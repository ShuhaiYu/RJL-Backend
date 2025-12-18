/**
 * Inspection Notification Service
 *
 * Handles sending booking invitation emails.
 */

const nodemailer = require('nodemailer');
const inspectionNotificationRepository = require('../repositories/inspectionNotificationRepository');
const inspectionScheduleRepository = require('../repositories/inspectionScheduleRepository');
const propertyRepository = require('../repositories/propertyRepository');
const contactRepository = require('../repositories/contactRepository');
const userRepository = require('../repositories/userRepository');
const systemSettingsRepository = require('../repositories/systemSettingsRepository');
const { generateBookingToken, getTokenExpiryDate } = require('../lib/tokenGenerator');
const { NotFoundError, ValidationError } = require('../lib/errors');
const { REGION_LABELS } = require('../config/constants');
const logger = require('../lib/logger');

// Frontend URL for booking links
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const inspectionNotificationService = {
  /**
   * Send booking invitations to multiple properties
   */
  async sendNotifications(scheduleId, propertyIds) {
    const schedule = await inspectionScheduleRepository.findById(scheduleId);
    if (!schedule) {
      throw new NotFoundError('Schedule not found');
    }

    const results = {
      success: [],
      failed: [],
      skipped: [],
    };

    for (const propertyId of propertyIds) {
      try {
        // Check if already notified
        const alreadyNotified = await inspectionNotificationRepository.existsForPropertyAndSchedule(
          propertyId,
          scheduleId
        );
        if (alreadyNotified) {
          results.skipped.push({
            property_id: propertyId,
            reason: 'Already notified',
          });
          continue;
        }

        // Get property with user info
        const property = await propertyRepository.findByIdWithRelations(propertyId);
        if (!property) {
          results.failed.push({
            property_id: propertyId,
            error: 'Property not found',
          });
          continue;
        }

        // Try to find recipient: 1) Property contacts, 2) Agency users (fallback)
        let recipient = null;
        let recipientType = null;

        // First, try property contacts
        const contacts = await contactRepository.findByPropertyId(propertyId);
        const contactWithEmail = contacts?.find((c) => c.email);

        if (contactWithEmail) {
          recipient = {
            name: contactWithEmail.name,
            email: contactWithEmail.email,
            id: contactWithEmail.id,
          };
          recipientType = 'contact';
        } else {
          // Fallback: find agency users (prioritize agencyAdmin)
          const agencyId = property.user?.agency?.id || property.user?.agencyId;
          if (agencyId) {
            const agencyUsers = await userRepository.findByAgencyIdWithPriority(agencyId);
            const agencyUserWithEmail = agencyUsers.find((u) => u.email);
            if (agencyUserWithEmail) {
              recipient = {
                name: agencyUserWithEmail.name,
                email: agencyUserWithEmail.email,
                id: agencyUserWithEmail.id,
                role: agencyUserWithEmail.role,
              };
              recipientType = 'agencyUser';
            }
          }
        }

        if (!recipient) {
          results.failed.push({
            property_id: propertyId,
            error: 'No contact or agency user with email found',
          });
          continue;
        }

        // Generate token and send email
        const token = generateBookingToken();
        const sent = await this.sendBookingInvitation(
          recipient,
          property,
          schedule,
          token
        );

        if (sent) {
          // Save notification record
          await inspectionNotificationRepository.create({
            schedule_id: scheduleId,
            property_id: propertyId,
            contact_id: recipientType === 'contact' ? recipient.id : null,
            recipient_email: recipient.email,
            booking_token: token,
            status: 'sent',
          });

          results.success.push({
            property_id: propertyId,
            recipient_email: recipient.email,
            recipient_name: recipient.name,
            recipient_type: recipientType,
            recipient_role: recipient.role || null,
          });
        } else {
          results.failed.push({
            property_id: propertyId,
            error: 'Failed to send email',
          });
        }
      } catch (error) {
        logger.error('Failed to send notification', {
          propertyId,
          error: error.message,
        });
        results.failed.push({
          property_id: propertyId,
          error: error.message,
        });
      }
    }

    return results;
  },

  /**
   * Send booking invitation email to a contact
   */
  async sendBookingInvitation(contact, property, schedule, token) {
    const emailSettings = await systemSettingsRepository.getEmailSettings();
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

    const transporter = nodemailer.createTransport({
      host: emailSettings.host || 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: emailSettings.user,
        pass: emailSettings.password,
      },
    });

    const mailOptions = {
      from: `"Property Inspection" <${emailSettings.user}>`,
      to: contact.email,
      subject: `Property Inspection Notice - ${property.address}`,
      html: this.generateEmailTemplate(contact, property, schedule, scheduleDate, bookingLink),
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
   * Send confirmation email for a booking
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

    const transporter = nodemailer.createTransport({
      host: emailSettings.host || 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: emailSettings.user,
        pass: emailSettings.password,
      },
    });

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

    const transporter = nodemailer.createTransport({
      host: emailSettings.host || 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: emailSettings.user,
        pass: emailSettings.password,
      },
    });

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

    const transporter = nodemailer.createTransport({
      host: emailSettings.host || 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: emailSettings.user,
        pass: emailSettings.password,
      },
    });

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
    const regionLabel = REGION_LABELS[booking.slot.schedule.region] || booking.slot.schedule.region;

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
                    <p style="margin: 0 0 16px; color: #111827; font-size: 16px; font-weight: bold;">${booking.slot.startTime} - ${booking.slot.endTime}</p>

                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Region:</p>
                    <p style="margin: 0; color: #111827; font-size: 16px; font-weight: bold;">${regionLabel}</p>
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
    const regionLabel = REGION_LABELS[booking.slot.schedule.region] || booking.slot.schedule.region;

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
    const regionLabel = REGION_LABELS[booking.slot.schedule.region] || booking.slot.schedule.region;

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
                    <p style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: bold;">${booking.slot.startTime} - ${booking.slot.endTime}</p>

                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Region:</p>
                    <p style="margin: 0; color: #111827; font-size: 16px; font-weight: bold;">${regionLabel}</p>
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
  generateEmailTemplate(contact, property, schedule, scheduleDate, bookingLink) {
    const regionLabel = REGION_LABELS[schedule.region] || schedule.region;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Property Inspection Notice</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; background-color: #4F46E5; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Property Inspection Notice</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                Dear ${contact.name || 'Tenant'},
              </p>

              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                We would like to inform you that a routine inspection has been scheduled for your property.
              </p>

              <!-- Property Info -->
              <table role="presentation" style="width: 100%; background-color: #f9fafb; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Property Address:</p>
                    <p style="margin: 0 0 16px; color: #111827; font-size: 16px; font-weight: bold;">${property.address}</p>

                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Inspection Date:</p>
                    <p style="margin: 0 0 16px; color: #111827; font-size: 16px; font-weight: bold;">${scheduleDate}</p>

                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Region:</p>
                    <p style="margin: 0; color: #111827; font-size: 16px; font-weight: bold;">${regionLabel}</p>
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
