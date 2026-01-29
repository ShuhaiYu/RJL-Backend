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
   * Process incoming email and create property/task/contacts
   */
  async processEmail(data, requestingUser) {
    const { subject, sender, textBody, html, gmail_msgid } = data;

    // Check for duplicate
    if (gmail_msgid) {
      const exists = await emailRepository.existsByGmailMsgId(gmail_msgid);
      if (exists) {
        return { duplicate: true, message: 'Email already processed' };
      }
    }

    // Extract tenant info from email body
    const tenantInfo = this.extractTenantInfo(textBody);
    if (!tenantInfo || !tenantInfo.address) {
      throw new ValidationError('Could not extract address from email');
    }

    // Format address using Google Maps API
    let formattedAddress = tenantInfo.address;
    try {
      formattedAddress = await this.formatAddress(tenantInfo.address);
    } catch (error) {
      logger.warn('Failed to format address', { error: error.message });
    }

    // Find agency based on sender email domain
    let agency = null;
    let agencyUser = null;

    // Try to find agency by whitelist
    agency = await agencyWhitelistRepository.findAgencyByEmail(sender);

    if (!agency && requestingUser.role !== 'system') {
      // Use requesting user's agency (not available for system/IMAP processing)
      agency = { id: requestingUser.agency_id };
    }

    if (!agency) {
      throw new ValidationError('Could not determine agency for this email');
    }

    // Get a user from the agency to assign the property
    const { users } = await userRepository.findAll({
      agencyId: agency.id,
      isActive: true,
      take: 1,
    });

    if (users.length === 0) {
      throw new ValidationError('No active users found in agency');
    }

    agencyUser = users[0];

    // Create or find property
    let property = await propertyRepository.findByAddressAndUser(formattedAddress, agencyUser.id);
    if (!property) {
      property = await propertyRepository.create({
        address: formattedAddress,
        user_id: agencyUser.id,
      });
    }

    // Create email record
    const email = await emailRepository.create({
      subject,
      sender,
      email_body: textBody,
      html,
      property_id: property.id,
      agency_id: agency.id,
      gmail_msgid,
    });

    // Create contacts if tenant info found
    const createdContacts = [];
    if (tenantInfo.contacts && tenantInfo.contacts.length > 0) {
      for (const contact of tenantInfo.contacts) {
        const newContact = await contactRepository.create({
          name: contact.name || 'Unknown',
          phone: contact.phone,
          email: contact.email,
          property_id: property.id,
        });
        createdContacts.push(newContact);
      }
    }

    // Create task from email
    const task = await taskRepository.create({
      property_id: property.id,
      agency_id: agency.id,
      task_name: subject || 'New task from email',
      task_description: textBody?.substring(0, 500),
      email_id: email.id,
      status: 'unknown',
    });

    return {
      email: this.formatEmail(email),
      property: {
        id: property.id,
        address: property.address,
      },
      contacts: createdContacts.length,
      task: {
        id: task.id,
        task_name: task.taskName,
      },
    };
  },

  /**
   * Extract tenant info from email text
   */
  extractTenantInfo(text) {
    if (!text) return null;

    const result = {
      address: null,
      contacts: [],
    };

    // Try to extract Australian address pattern
    const addressPattern = /\b\d+[A-Za-z\/]*[\w'\- ]*?(?:,\s*)?[A-Za-z'\- ]+(?:,\s*)?(VIC|NSW|QLD|ACT|TAS|NT|WA|SA)\s*\d{4}\b/gi;
    const addressMatch = text.match(addressPattern);
    if (addressMatch && addressMatch[0]) {
      result.address = addressMatch[0].trim();
    }

    // Try to extract phone numbers
    const phonePattern = /(?:0\d{9}|\d{2}\s*\d{4}\s*\d{4}|\+61\s*\d{9})/g;
    const phoneMatches = text.match(phonePattern) || [];

    // Try to extract emails
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailMatches = text.match(emailPattern) || [];

    // Try to extract names (simple pattern: capitalize words before phone/email)
    const namePattern = /(?:tenant|occupant|resident|name)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi;
    const nameMatches = text.match(namePattern) || [];

    // Build contacts array
    const maxContacts = Math.max(phoneMatches.length, emailMatches.length, 1);
    for (let i = 0; i < maxContacts && i < 5; i++) {
      if (phoneMatches[i] || emailMatches[i]) {
        result.contacts.push({
          name: nameMatches[i]?.replace(/tenant|occupant|resident|name[:\s]+/gi, '').trim() || null,
          phone: phoneMatches[i]?.replace(/\s/g, '') || null,
          email: emailMatches[i] || null,
        });
      }
    }

    return result;
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

    // Use Gemini AI to extract information
    logger.info('[Email] Extracting info with Gemini AI', { subject, sender });
    const extractedInfo = await geminiService.extractEmailInfo(subject, textBody);

    // If no address found, we still create a task but without property
    let formattedAddress = extractedInfo.address;
    if (formattedAddress) {
      try {
        formattedAddress = await this.formatAddress(formattedAddress);
      } catch (error) {
        logger.warn('[Email] Failed to format address', { error: error.message });
      }
    }

    // Find agency based on sender email domain
    let agency = null;
    let agencyUser = null;

    // Try to find agency by whitelist
    agency = await agencyWhitelistRepository.findAgencyByEmail(sender);

    if (!agency && requestingUser.role !== 'system') {
      agency = { id: requestingUser.agency_id };
    }

    if (!agency) {
      // Log warning but don't throw - create without agency assignment
      logger.warn('[Email] Could not determine agency for email', { sender });
      throw new ValidationError('Could not determine agency for this email');
    }

    // Get a user from the agency to assign the property
    const { users } = await userRepository.findAll({
      agencyId: agency.id,
      isActive: true,
      take: 1,
    });

    if (users.length === 0) {
      throw new ValidationError('No active users found in agency');
    }

    agencyUser = users[0];

    // Create or find property (only if address was extracted)
    let property = null;
    if (formattedAddress) {
      property = await propertyRepository.findByAddressAndUser(formattedAddress, agencyUser.id);
      if (!property) {
        property = await propertyRepository.create({
          address: formattedAddress,
          user_id: agencyUser.id,
        });
      }
    }

    // Create email record
    const email = await emailRepository.create({
      subject,
      sender,
      email_body: textBody,
      html,
      property_id: property?.id || null,
      agency_id: agency.id,
      gmail_msgid: messageId, // Reuse field for any message ID
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
            property_id: property?.id || null,
          });
          createdContacts.push(newContact);
        }
      }
    }

    // Map AI task type to our task types
    const taskType = this.mapTaskType(extractedInfo.taskType);

    // Create task from email
    const task = await taskRepository.create({
      property_id: property?.id || null,
      agency_id: agency.id,
      task_name: extractedInfo.summary || subject || 'New task from email',
      task_description: textBody?.substring(0, 500),
      email_id: email.id,
      status: 'UNKNOWN',
      type: taskType,
    });

    logger.info('[Email] Successfully processed email with AI', {
      emailId: email.id,
      propertyId: property?.id,
      taskId: task.id,
      taskType,
      urgency: extractedInfo.urgency,
    });

    return {
      email: this.formatEmail(email),
      property: property
        ? {
            id: property.id,
            address: property.address,
          }
        : null,
      contacts: createdContacts.length,
      task: {
        id: task.id,
        task_name: task.taskName,
        type: taskType,
      },
      extracted: {
        urgency: extractedInfo.urgency,
        summary: extractedInfo.summary,
      },
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
