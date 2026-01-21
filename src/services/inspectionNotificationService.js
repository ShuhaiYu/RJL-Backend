/**
 * Inspection Notification Service
 *
 * Handles sending booking invitation emails.
 */

const nodemailer = require('nodemailer');
const prisma = require('../config/prisma');
const inspectionNotificationRepository = require('../repositories/inspectionNotificationRepository');
const inspectionScheduleRepository = require('../repositories/inspectionScheduleRepository');
const propertyRepository = require('../repositories/propertyRepository');
const contactRepository = require('../repositories/contactRepository');
const userRepository = require('../repositories/userRepository');
const systemSettingsRepository = require('../repositories/systemSettingsRepository');
const { generateBookingToken, getTokenExpiryDate } = require('../lib/tokenGenerator');
const { NotFoundError, ValidationError } = require('../lib/errors');
const logger = require('../lib/logger');

// Transporter cache for connection reuse
let cachedTransporter = null;
let transporterSettingsHash = null;

/**
 * Get or create a cached SMTP transporter with connection pooling
 */
function getTransporter(emailSettings) {
  const settingsHash = `${emailSettings.host}:${emailSettings.user}`;

  // Reuse existing transporter if settings haven't changed
  if (cachedTransporter && transporterSettingsHash === settingsHash) {
    return cachedTransporter;
  }

  // Close existing transporter if it exists
  if (cachedTransporter) {
    cachedTransporter.close();
  }

  cachedTransporter = nodemailer.createTransport({
    host: emailSettings.host || 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: emailSettings.user,
      pass: emailSettings.password,
    },
    pool: true, // Enable connection pooling
    maxConnections: 5, // Max concurrent connections
    maxMessages: 100, // Max messages per connection
  });

  transporterSettingsHash = settingsHash;
  return cachedTransporter;
}

/**
 * Send emails in batches with controlled concurrency
 */
async function sendInBatches(emailTasks, concurrency = 5) {
  const results = [];

  for (let i = 0; i < emailTasks.length; i += concurrency) {
    const batch = emailTasks.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map((task) => task()));
    results.push(...batchResults);
  }

  return results;
}

// Task type labels for email display
const TASK_TYPE_LABELS = {
  'smoke alarm': 'Smoke Alarm',
  'gas/electric': 'Gas & Electricity',
  'pool safety': 'Pool Safety',
  'unknown': 'Safety Check',
};

// Frontend URL for booking links
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const inspectionNotificationService = {
  /**
   * Send booking invitations to multiple properties (multi-recipient)
   * For each property, sends to ALL contacts with email AND ALL agency users
   * Optimized for parallel sending with connection pooling
   */
  async sendNotifications(scheduleId, propertyIds) {
    const schedule = await inspectionScheduleRepository.findById(scheduleId);
    if (!schedule) {
      throw new NotFoundError('Schedule not found');
    }

    // Get email settings ONCE at the beginning
    const emailSettings = await systemSettingsRepository.getEmailSettings();
    if (!emailSettings || !emailSettings.user) {
      throw new Error('Email settings not configured');
    }

    // Get cached transporter with connection pooling
    const transporter = getTransporter(emailSettings);

    const results = {
      success: [],
      failed: [],
      skipped: [],
    };

    // Phase 1: Collect all recipients data (still sequential for data integrity)
    const emailTasks = [];

    for (const propertyId of propertyIds) {
      try {
        // Get property with user info
        const property = await propertyRepository.findByIdWithRelations(propertyId);
        if (!property) {
          results.failed.push({
            property_id: propertyId,
            error: 'Property not found',
          });
          continue;
        }

        // Collect all potential recipients
        const recipients = [];

        // 1. Get ALL property contacts with email
        const contacts = await contactRepository.findByPropertyId(propertyId);
        const contactsWithEmail = contacts?.filter((c) => c.email) || [];
        for (const contact of contactsWithEmail) {
          recipients.push({
            name: contact.name,
            email: contact.email,
            id: contact.id,
            type: 'contact',
            contactId: contact.id,
            userId: null,
          });
        }

        // 2. Get ALL agency users (agencyAdmin + agencyUser)
        const agencyId = property.user?.agency?.id || property.user?.agencyId;
        if (agencyId) {
          const agencyUsers = await userRepository.findByAgencyIdWithPriority(agencyId);
          for (const user of agencyUsers) {
            if (user.email) {
              recipients.push({
                name: user.name,
                email: user.email,
                id: user.id,
                type: 'agencyUser',
                contactId: null,
                userId: user.id,
                role: user.role,
              });
            }
          }
        }

        // 3. Get property tasks to include inspection types in email
        const propertyTasks = await prisma.task.findMany({
          where: {
            propertyId,
            isActive: true,
            status: { in: ['incomplete', 'unknown'] },
          },
          select: { type: true },
        });
        const inspectionTypes = [...new Set(propertyTasks.map((t) => t.type).filter(Boolean))];

        if (recipients.length === 0) {
          results.failed.push({
            property_id: propertyId,
            error: 'No contact or agency user with email found',
          });
          continue;
        }

        // Check duplicates and prepare email tasks
        for (const recipient of recipients) {
          // Check if this email already received notification for this schedule
          const alreadySent = await inspectionNotificationRepository.existsForEmailAndSchedule(
            recipient.email,
            scheduleId
          );
          if (alreadySent) {
            results.skipped.push({
              property_id: propertyId,
              recipient_email: recipient.email,
              recipient_name: recipient.name,
              recipient_type: recipient.type,
              reason: 'Already notified for this schedule',
            });
            continue;
          }

          // Generate independent token for this recipient
          const token = generateBookingToken();

          // Queue email task for parallel sending
          emailTasks.push({
            recipient,
            property,
            schedule,
            token,
            inspectionTypes,
            propertyId,
            scheduleId,
          });
        }
      } catch (error) {
        logger.error('Failed to process property for notifications', {
          propertyId,
          error: error.message,
        });
        results.failed.push({
          property_id: propertyId,
          error: error.message,
        });
      }
    }

    // Phase 2: Send all emails in parallel batches
    if (emailTasks.length > 0) {
      logger.info('Starting parallel email sending', {
        scheduleId,
        totalEmails: emailTasks.length,
      });

      const sendResults = await sendInBatches(
        emailTasks.map((task) => async () => {
          try {
            const sent = await this.sendBookingInvitation(
              task.recipient,
              task.property,
              task.schedule,
              task.token,
              task.inspectionTypes,
              transporter,
              emailSettings
            );

            if (sent) {
              // Save notification record
              await inspectionNotificationRepository.create({
                schedule_id: task.scheduleId,
                property_id: task.propertyId,
                contact_id: task.recipient.contactId,
                user_id: task.recipient.userId,
                recipient_type: task.recipient.type,
                recipient_email: task.recipient.email,
                booking_token: task.token,
                status: 'sent',
              });

              return { success: true, task };
            } else {
              return { success: false, task, error: 'Failed to send email' };
            }
          } catch (error) {
            return { success: false, task, error: error.message };
          }
        }),
        5 // Concurrency limit
      );

      // Process results
      for (const result of sendResults) {
        if (result.status === 'fulfilled') {
          const { success, task, error } = result.value;
          if (success) {
            results.success.push({
              property_id: task.propertyId,
              recipient_email: task.recipient.email,
              recipient_name: task.recipient.name,
              recipient_type: task.recipient.type,
              recipient_role: task.recipient.role || null,
            });
          } else {
            results.failed.push({
              property_id: task.propertyId,
              recipient_email: task.recipient.email,
              error: error,
            });
          }
        } else {
          // Promise was rejected (should not happen with our error handling)
          logger.error('Email task promise rejected', { reason: result.reason });
        }
      }

      logger.info('Parallel email sending completed', {
        scheduleId,
        success: results.success.length,
        failed: results.failed.length,
        skipped: results.skipped.length,
      });
    }

    return results;
  },

  /**
   * Send booking invitation email to a contact
   * @param {Object} contact - Recipient info
   * @param {Object} property - Property info
   * @param {Object} schedule - Schedule info
   * @param {string} token - Booking token
   * @param {Array} inspectionTypes - Types of inspections
   * @param {Object} existingTransporter - Optional: reuse existing transporter
   * @param {Object} existingEmailSettings - Optional: reuse existing email settings
   */
  async sendBookingInvitation(
    contact,
    property,
    schedule,
    token,
    inspectionTypes = [],
    existingTransporter = null,
    existingEmailSettings = null
  ) {
    // Use provided settings or fetch new ones
    const emailSettings = existingEmailSettings || await systemSettingsRepository.getEmailSettings();
    if (!emailSettings || !emailSettings.user) {
      throw new Error('Email settings not configured');
    }

    const bookingLink = `${FRONTEND_URL}/book/${token}`;
    const scheduleDate = new Date(schedule.scheduleDate).toLocaleDateString('en-AU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Use provided transporter or create/get cached one
    const transporter = existingTransporter || getTransporter(emailSettings);

    const mailOptions = {
      from: `"Safety Check Inspection" <${emailSettings.user}>`,
      to: contact.email,
      subject: `Safety Check Inspection - ${property.address}`,
      html: this.generateEmailTemplate(contact, property, schedule, scheduleDate, bookingLink, inspectionTypes),
    };

    try {
      await transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      logger.error('Failed to send email', { error: error.message });
      throw error;
    }
  },

  /**
   * Send confirmation email for a booking (to single recipient)
   */
  async sendConfirmationEmail(booking) {
    const emailSettings = await systemSettingsRepository.getEmailSettings();
    if (!emailSettings || !emailSettings.user) {
      throw new Error('Email settings not configured');
    }

    if (!booking.contactEmail) {
      logger.warn('No contact email for booking confirmation', { bookingId: booking.id });
      return false;
    }

    const scheduleDate = new Date(booking.slot.schedule.scheduleDate).toLocaleDateString('en-AU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Use cached transporter with connection pooling
    const transporter = getTransporter(emailSettings);

    const mailOptions = {
      from: `"Property Inspection" <${emailSettings.user}>`,
      to: booking.contactEmail,
      subject: `Booking Confirmed - ${booking.property.address}`,
      html: this.generateConfirmationTemplate(booking, scheduleDate),
    };

    try {
      await transporter.sendMail(mailOptions);
      logger.info('Confirmation email sent', { bookingId: booking.id, email: booking.contactEmail });
      return true;
    } catch (error) {
      logger.error('Failed to send confirmation email', { error: error.message });
      return false;
    }
  },

  /**
   * Send confirmation emails to ALL recipients who received invitations for this property
   * This ensures everyone knows the final booking result
   * Optimized for parallel sending
   */
  async sendConfirmationToAllRecipients(booking) {
    const emailSettings = await systemSettingsRepository.getEmailSettings();
    if (!emailSettings || !emailSettings.user) {
      throw new Error('Email settings not configured');
    }

    // Get all recipients who received notifications for this property
    const recipients = await inspectionNotificationRepository.findRecipientsByPropertyId(
      booking.propertyId
    );

    if (!recipients || recipients.length === 0) {
      logger.warn('No recipients found for confirmation email', { bookingId: booking.id });
      return { sent: 0, failed: 0 };
    }

    const scheduleDate = new Date(booking.slot.schedule.scheduleDate).toLocaleDateString('en-AU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Use cached transporter with connection pooling
    const transporter = getTransporter(emailSettings);

    let sent = 0;
    let failed = 0;

    // Send emails in parallel batches
    const sendResults = await sendInBatches(
      recipients.map((recipient) => async () => {
        const recipientName = recipient.contact?.name || recipient.user?.name || 'Recipient';
        const mailOptions = {
          from: `"Property Inspection" <${emailSettings.user}>`,
          to: recipient.recipientEmail,
          subject: `Booking Confirmed - ${booking.property.address}`,
          html: this.generateConfirmationTemplateWithBooker(booking, scheduleDate, recipientName),
        };

        await transporter.sendMail(mailOptions);
        logger.info('Confirmation email sent to recipient', {
          bookingId: booking.id,
          email: recipient.recipientEmail,
        });
        return { success: true, email: recipient.recipientEmail };
      }),
      5 // Concurrency limit
    );

    // Process results
    for (const result of sendResults) {
      if (result.status === 'fulfilled') {
        sent++;
      } else {
        failed++;
        logger.error('Failed to send confirmation email to recipient', {
          error: result.reason?.message || result.reason,
        });
      }
    }

    logger.info('Confirmation emails batch complete', {
      bookingId: booking.id,
      sent,
      failed,
      total: recipients.length,
    });

    return { sent, failed };
  },

  /**
   * Send rejection email for a booking
   */
  async sendRejectionEmail(booking) {
    const emailSettings = await systemSettingsRepository.getEmailSettings();
    if (!emailSettings || !emailSettings.user) {
      throw new Error('Email settings not configured');
    }

    if (!booking.contactEmail) {
      logger.warn('No contact email for booking rejection', { bookingId: booking.id });
      return false;
    }

    const scheduleDate = new Date(booking.slot.schedule.scheduleDate).toLocaleDateString('en-AU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Use cached transporter with connection pooling
    const transporter = getTransporter(emailSettings);

    const mailOptions = {
      from: `"Property Inspection" <${emailSettings.user}>`,
      to: booking.contactEmail,
      subject: `Booking Update - ${booking.property.address}`,
      html: this.generateRejectionTemplate(booking, scheduleDate),
    };

    try {
      await transporter.sendMail(mailOptions);
      logger.info('Rejection email sent', { bookingId: booking.id, email: booking.contactEmail });
      return true;
    } catch (error) {
      logger.error('Failed to send rejection email', { error: error.message });
      return false;
    }
  },

  /**
   * Send reschedule notification email for a booking
   */
  async sendRescheduleEmail(booking, oldSlot) {
    const emailSettings = await systemSettingsRepository.getEmailSettings();
    if (!emailSettings || !emailSettings.user) {
      throw new Error('Email settings not configured');
    }

    if (!booking.contactEmail) {
      logger.warn('No contact email for booking reschedule', { bookingId: booking.id });
      return false;
    }

    const scheduleDate = new Date(booking.slot.schedule.scheduleDate).toLocaleDateString('en-AU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Use cached transporter with connection pooling
    const transporter = getTransporter(emailSettings);

    const mailOptions = {
      from: `"Property Inspection" <${emailSettings.user}>`,
      to: booking.contactEmail,
      subject: `Booking Rescheduled - ${booking.property.address}`,
      html: this.generateRescheduleTemplate(booking, scheduleDate, oldSlot),
    };

    try {
      await transporter.sendMail(mailOptions);
      logger.info('Reschedule email sent', { bookingId: booking.id, email: booking.contactEmail });
      return true;
    } catch (error) {
      logger.error('Failed to send reschedule email', { error: error.message });
      return false;
    }
  },

  /**
   * Generate confirmation email HTML template
   */
  generateConfirmationTemplate(booking, scheduleDate) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmed</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; background-color: #10B981; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px;">✓ Booking Confirmed</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                Dear ${booking.contactName || 'Tenant'},
              </p>

              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                Your property inspection booking has been <strong style="color: #10B981;">confirmed</strong>. Please see the details below:
              </p>

              <!-- Booking Info -->
              <table role="presentation" style="width: 100%; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Property Address:</p>
                    <p style="margin: 0 0 16px; color: #111827; font-size: 16px; font-weight: bold;">${booking.property.address}</p>

                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Inspection Date:</p>
                    <p style="margin: 0 0 16px; color: #111827; font-size: 16px; font-weight: bold;">${scheduleDate}</p>

                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Time Slot:</p>
                    <p style="margin: 0; color: #111827; font-size: 16px; font-weight: bold;">${booking.slot.startTime} - ${booking.slot.endTime}</p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                Please ensure someone is available at the property during the inspection time.
              </p>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                If you need to make any changes, please contact your property manager.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                This is an automated message. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  },

  /**
   * Generate confirmation email HTML template with booker information
   * Used when sending to all recipients to show who made the booking
   */
  generateConfirmationTemplateWithBooker(booking, scheduleDate, recipientName) {

    // Determine booker information
    let bookerName = booking.contactName || 'Unknown';
    let bookerTypeLabel = 'Tenant';
    if (booking.bookerType === 'agencyUser' && booking.bookedByUser) {
      bookerName = booking.bookedByUser.name || bookerName;
      bookerTypeLabel = 'Agency Staff';
    } else if (booking.bookerType === 'contact') {
      bookerTypeLabel = 'Property Contact';
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmed</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; background-color: #10B981; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px;">✓ Booking Confirmed</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                Dear ${recipientName},
              </p>

              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                The property inspection booking has been <strong style="color: #10B981;">confirmed</strong>. Please see the details below:
              </p>

              <!-- Booking Info -->
              <table role="presentation" style="width: 100%; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Property Address:</p>
                    <p style="margin: 0 0 16px; color: #111827; font-size: 16px; font-weight: bold;">${booking.property.address}</p>

                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Inspection Date:</p>
                    <p style="margin: 0 0 16px; color: #111827; font-size: 16px; font-weight: bold;">${scheduleDate}</p>

                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Time Slot:</p>
                    <p style="margin: 0 0 16px; color: #111827; font-size: 16px; font-weight: bold;">${booking.slot.startTime} - ${booking.slot.endTime}</p>

                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Booked By:</p>
                    <p style="margin: 0; color: #111827; font-size: 16px; font-weight: bold;">${bookerName} <span style="color: #6b7280; font-weight: normal;">(${bookerTypeLabel})</span></p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                Please ensure someone is available at the property during the inspection time.
              </p>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                If you need to make any changes, please contact your property manager.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                This is an automated message. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  },

  /**
   * Generate rejection email HTML template
   */
  generateRejectionTemplate(booking, scheduleDate) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Update</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; background-color: #EF4444; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Booking Update</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                Dear ${booking.contactName || 'Tenant'},
              </p>

              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                We regret to inform you that your inspection booking for the following property could not be confirmed at this time:
              </p>

              <!-- Booking Info -->
              <table role="presentation" style="width: 100%; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Property Address:</p>
                    <p style="margin: 0 0 16px; color: #111827; font-size: 16px; font-weight: bold;">${booking.property.address}</p>

                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Requested Date:</p>
                    <p style="margin: 0 0 16px; color: #111827; font-size: 16px; font-weight: bold;">${scheduleDate}</p>

                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Requested Time:</p>
                    <p style="margin: 0; color: #111827; font-size: 16px; font-weight: bold;">${booking.slot.startTime} - ${booking.slot.endTime}</p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                Please contact your property manager to arrange an alternative inspection time.
              </p>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                We apologize for any inconvenience this may cause.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                This is an automated message. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  },

  /**
   * Generate reschedule email HTML template
   */
  generateRescheduleTemplate(booking, scheduleDate, oldSlot) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Rescheduled</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; background-color: #F59E0B; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Booking Rescheduled</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                Dear ${booking.contactName || 'Tenant'},
              </p>

              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                Your property inspection booking has been rescheduled. Please see the updated details below:
              </p>

              <!-- Old Time (Crossed out) -->
              <table role="presentation" style="width: 100%; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; margin-bottom: 16px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 4px; color: #6b7280; font-size: 12px;">Previous Time (Cancelled):</p>
                    <p style="margin: 0; color: #9ca3af; font-size: 14px; text-decoration: line-through;">
                      ${oldSlot ? `${oldSlot.startTime} - ${oldSlot.endTime}` : 'N/A'}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- New Time -->
              <table role="presentation" style="width: 100%; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Property Address:</p>
                    <p style="margin: 0 0 16px; color: #111827; font-size: 16px; font-weight: bold;">${booking.property.address}</p>

                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Inspection Date:</p>
                    <p style="margin: 0 0 16px; color: #111827; font-size: 16px; font-weight: bold;">${scheduleDate}</p>

                    <p style="margin: 0 0 8px; color: #10B981; font-size: 14px; font-weight: bold;">New Time Slot:</p>
                    <p style="margin: 0; color: #111827; font-size: 18px; font-weight: bold;">${booking.slot.startTime} - ${booking.slot.endTime}</p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                Please ensure someone is available at the property during the new inspection time.
              </p>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                If you have any questions, please contact your property manager.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                This is an automated message. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  },

  /**
   * Generate email HTML template
   */
  generateEmailTemplate(contact, property, schedule, scheduleDate, bookingLink, inspectionTypes = []) {
    // Format inspection types for display
    const typeLabels = inspectionTypes
      .map((type) => TASK_TYPE_LABELS[type] || type)
      .filter(Boolean);
    const inspectionTypesText = typeLabels.length > 0
      ? typeLabels.join(', ')
      : 'Safety Check';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Safety Check Inspection</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; background-color: #4F46E5; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Safety Check Inspection</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                Dear ${contact.name || 'Tenant'},
              </p>

              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                We would like to inform you that a safety check inspection has been scheduled for your property.
              </p>

              <!-- Property Info -->
              <table role="presentation" style="width: 100%; background-color: #f9fafb; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Property Address:</p>
                    <p style="margin: 0 0 16px; color: #111827; font-size: 16px; font-weight: bold;">${property.address}</p>

                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Inspection Date:</p>
                    <p style="margin: 0 0 16px; color: #111827; font-size: 16px; font-weight: bold;">${scheduleDate}</p>

                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Inspection Type:</p>
                    <p style="margin: 0; color: #111827; font-size: 16px; font-weight: bold;">${inspectionTypesText}</p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 24px; color: #374151; font-size: 16px;">
                Please click the button below to select a convenient time slot for the inspection:
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; margin-bottom: 24px;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${bookingLink}" style="display: inline-block; padding: 14px 32px; background-color: #4F46E5; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; border-radius: 8px;">
                      Book Inspection Time
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 16px; color: #6b7280; font-size: 14px;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px; color: #4F46E5; font-size: 14px; word-break: break-all;">
                ${bookingLink}
              </p>

              <p style="margin: 0 0 16px; color: #ef4444; font-size: 14px; font-weight: bold;">
                This link will expire in 14 days.
              </p>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                If you have any questions, please contact your property manager.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                This is an automated message. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  },
};

module.exports = inspectionNotificationService;
