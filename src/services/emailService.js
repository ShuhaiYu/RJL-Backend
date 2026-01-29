/**
 * Email Service
 *
 * Business logic for Email entity.
 */

const axios = require('axios');
const emailRepository = require('../repositories/emailRepository');
const propertyRepository = require('../repositories/propertyRepository');
const contactRepository = require('../repositories/contactRepository');
const taskRepository = require('../repositories/taskRepository');
const userRepository = require('../repositories/userRepository');
const agencyWhitelistRepository = require('../repositories/agencyWhitelistRepository');
const systemSettingsRepository = require('../repositories/systemSettingsRepository');
const geminiService = require('./geminiService');
const { NotFoundError, ForbiddenError, ValidationError } = require('../lib/errors');
const { USER_ROLES, TASK_TYPE } = require('../config/constants');
const { createPagination } = require('../lib/response');
const logger = require('../lib/logger');

const emailService = {
  /**
   * Get email by ID
   */
  async getEmailById(id, requestingUser) {
    const email = await emailRepository.findByIdWithRelations(id);
    if (!email) {
      throw new NotFoundError('Email');
    }

    return this.formatEmail(email);
  },

  /**
   * List emails with filters
   */
  async listEmails(requestingUser, { search, page = 1, limit = 50, property_id, agency_id }) {
    const skip = (page - 1) * limit;

    const filters = {
      skip,
      take: limit,
      search,
      propertyId: property_id,
    };

    // Apply agency filter based on role
    if (['superuser', 'admin'].includes(requestingUser.role)) {
      if (agency_id) filters.agencyId = agency_id;
    } else {
      filters.agencyId = requestingUser.agency_id;
    }

    const { emails, total } = await emailRepository.findAll(filters);

    return {
      emails: emails.map(this.formatEmail),
      pagination: createPagination(page, limit, total),
    };
  },

  /**
   * Format address using Google Maps API
   */
  async formatAddress(address) {
    const googleMapKey = await systemSettingsRepository.getGoogleMapKey();
    if (!googleMapKey) {
      return address;
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          address: address,
          key: googleMapKey,
          components: 'country:AU',
        },
      });

      if (response.data.results && response.data.results[0]) {
        return response.data.results[0].formatted_address;
      }
    } catch (error) {
      logger.warn('Google Maps API error', { error: error.message });
    }

    return address;
  },

  /**
   * Extract email address from sender string
   * Handles formats like "John Doe <john@example.com>" or "john@example.com"
   */
  extractEmailAddress(sender) {
    if (!sender) return null;

    // Try to extract email from "Name <email>" format
    const match = sender.match(/<([^>]+)>/);
    if (match) {
      return match[1].toLowerCase().trim();
    }

    // If no angle brackets, assume it's just the email
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const emailMatch = sender.match(emailPattern);
    if (emailMatch) {
      return emailMatch[0].toLowerCase().trim();
    }

    return sender.toLowerCase().trim();
  },

  /**
   * Process incoming email using AI for extraction (for Mailgun webhook)
   * @param {Object} data - Email data from Mailgun
   * @param {Object} requestingUser - User context (system for webhooks)
   */
  async processEmailWithAI(data, requestingUser) {
    const { subject, sender, textBody, html, messageId } = data;

    // Check for duplicate using messageId
    if (messageId) {
      const exists = await emailRepository.existsByGmailMsgId(messageId);
      if (exists) {
        return { duplicate: true, message: 'Email already processed' };
      }
    }

    // Extract actual email address from sender
    const senderEmail = this.extractEmailAddress(sender);
    logger.info('[Email] Processing email', { subject, sender, senderEmail });

    // Use Gemini AI to extract information
    const extractedInfo = await geminiService.extractEmailInfo(subject, textBody);

    // Format address if found
    let formattedAddress = extractedInfo.address;
    if (formattedAddress) {
      try {
        formattedAddress = await this.formatAddress(formattedAddress);
      } catch (error) {
        logger.warn('[Email] Failed to format address', { error: error.message });
      }
    }

    // Find agency and responsible user based on sender email
    // Priority: 1. System user  2. Agency whitelist  3. System admin (fallback)
    let agency = null;
    let agencyUser = null;
    let senderType = null; // 'user', 'whitelist', 'unassigned'

    if (senderEmail) {
      // Step 1: Check if sender is a registered system user
      const senderUser = await userRepository.findByEmail(senderEmail);

      if (senderUser && senderUser.isActive && senderUser.agencyId) {
        // Sender is a system user - use their agency and themselves as responsible user
        agency = { id: senderUser.agencyId };
        agencyUser = senderUser;
        senderType = 'user';
        logger.info('[Email] Sender is a registered user', {
          senderEmail,
          userId: senderUser.id,
          agencyId: senderUser.agencyId
        });
      } else {
        // Step 2: Check agency whitelist
        agency = await agencyWhitelistRepository.findAgencyByEmail(senderEmail);

        if (agency) {
          // Sender is in whitelist - use agency admin as responsible user
          const agencyUsers = await userRepository.findByAgencyIdWithPriority(agency.id);

          if (agencyUsers.length > 0) {
            agencyUser = agencyUsers[0]; // First user is agency-admin (priority sorted)
            senderType = 'whitelist';
            logger.info('[Email] Sender found in whitelist', {
              senderEmail,
              agencyId: agency.id,
              assignedUserId: agencyUser.id,
              assignedUserRole: agencyUser.role
            });
          }
        }
      }
    }

    // Fallback for non-system requests (e.g., API calls with auth)
    if (!agency && requestingUser.role !== 'system') {
      agency = { id: requestingUser.agency_id };
      agencyUser = { id: requestingUser.id };
      senderType = 'api';
    }

    // Step 3: Fallback to system admin if no agency found
    // Email will be saved and marked as unassigned for manual review
    if (!agency || !agencyUser) {
      logger.warn('[Email] Sender not recognized, using system admin fallback', { sender, senderEmail });

      // Find a superuser or admin to handle unassigned emails
      const { users: adminUsers } = await userRepository.findAll({
        role: 'superuser',
        isActive: true,
        take: 1,
      });

      if (adminUsers.length === 0) {
        // Try admin if no superuser
        const { users: fallbackUsers } = await userRepository.findAll({
          role: 'admin',
          isActive: true,
          take: 1,
        });

        if (fallbackUsers.length > 0) {
          agencyUser = fallbackUsers[0];
        }
      } else {
        agencyUser = adminUsers[0];
      }

      if (agencyUser) {
        // Use the admin's agency if they have one, otherwise leave agency as null
        agency = agencyUser.agencyId ? { id: agencyUser.agencyId } : null;
        senderType = 'unassigned';
        logger.info('[Email] Using system admin as fallback', {
          adminUserId: agencyUser.id,
          adminRole: agencyUser.role,
          agencyId: agency?.id || null
        });
      } else {
        // No admin found at all - this is a critical error
        logger.error('[Email] No system admin found to handle unassigned email');
        throw new ValidationError(
          'System configuration error: No admin user available to process unassigned emails.'
        );
      }
    }

    // Create or find property
    // If no address extracted, use a placeholder address (propertyId is required)
    let property = null;
    if (formattedAddress) {
      property = await propertyRepository.findByAddressAndUser(formattedAddress, agencyUser.id);
      if (!property) {
        property = await propertyRepository.create({
          address: formattedAddress,
          user_id: agencyUser.id,
        });
      }
    } else {
      // No address found - create property with placeholder
      const placeholderAddress = `[待补充地址] - ${subject || 'Email'} - ${new Date().toISOString().slice(0, 10)}`;
      property = await propertyRepository.create({
        address: placeholderAddress,
        user_id: agencyUser.id,
      });
      logger.warn('[Email] No address extracted, created placeholder property', {
        propertyId: property.id,
        placeholderAddress,
      });
    }

    // Create email record (agencyId can be null for unassigned emails)
    const email = await emailRepository.create({
      subject,
      sender,
      email_body: textBody,
      html,
      property_id: property.id,
      agency_id: agency?.id || null,
      gmail_msgid: messageId,
    });

    // Create contacts if extracted
    const createdContacts = [];
    if (extractedInfo.contacts && extractedInfo.contacts.length > 0) {
      for (const contact of extractedInfo.contacts) {
        if (contact.phone || contact.email) {
          const newContact = await contactRepository.create({
            name: contact.name || 'Unknown',
            phone: contact.phone,
            email: contact.email,
            property_id: property.id,
          });
          createdContacts.push(newContact);
        }
      }
    }

    // Map AI task type to our task types
    const taskType = this.mapTaskType(extractedInfo.taskType);

    // Create task from email (only if we have an agency, since agencyId is required)
    let task = null;
    if (agency?.id) {
      task = await taskRepository.create({
        property_id: property.id,
        agency_id: agency.id,
        task_name: extractedInfo.summary || subject || 'New task from email',
        task_description: textBody?.substring(0, 500),
        email_id: email.id,
        status: senderType === 'unassigned' ? 'UNASSIGNED' : 'UNKNOWN',
        type: taskType,
      });
    } else {
      logger.warn('[Email] No agency available, task not created. Email saved for manual review.', {
        emailId: email.id,
        senderType,
      });
    }

    logger.info('[Email] Successfully processed email with AI', {
      emailId: email.id,
      propertyId: property.id,
      taskId: task?.id || null,
      taskType,
      urgency: extractedInfo.urgency,
      addressExtracted: !!extractedInfo.address,
      senderType,
    });

    return {
      email: this.formatEmail(email),
      property: {
        id: property.id,
        address: property.address,
      },
      contacts: createdContacts.length,
      task: task
        ? {
            id: task.id,
            task_name: task.taskName,
            type: taskType,
          }
        : null,
      extracted: {
        urgency: extractedInfo.urgency,
        summary: extractedInfo.summary,
        addressFound: !!extractedInfo.address,
      },
      senderType, // 'user', 'whitelist', 'unassigned', or 'api'
    };
  },

  /**
   * Map AI-detected task type to system task types
   */
  mapTaskType(aiTaskType) {
    const mapping = {
      SMOKE_ALARM: TASK_TYPE.SMOKE_ALARM,
      'GAS_&_ELECTRICITY': TASK_TYPE.GAS_ELECTRICITY,
      GAS: TASK_TYPE.GAS_ELECTRICITY,
      ELECTRICITY: TASK_TYPE.GAS_ELECTRICITY,
    };
    return mapping[aiTaskType] || null;
  },

  /**
   * Format email for API response
   */
  formatEmail(email) {
    const formatted = {
      id: email.id,
      subject: email.subject,
      sender: email.sender,
      email_body: email.emailBody,
      html: email.html,
      property_id: email.propertyId,
      agency_id: email.agencyId,
      gmail_msgid: email.gmailMsgid,
      created_at: email.createdAt,
      updated_at: email.updatedAt,
    };

    if (email.property) {
      formatted.property = {
        id: email.property.id,
        address: email.property.address,
      };
    }

    if (email.tasks) {
      formatted.tasks = email.tasks.map((t) => ({
        id: t.id,
        task_name: t.taskName,
        status: t.status,
      }));
    }

    return formatted;
  },
};

module.exports = emailService;
