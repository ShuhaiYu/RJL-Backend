/**
 * Email Service
 *
 * Business logic for Email entity.
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
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
  async listEmails(requestingUser, { search, page = 1, limit = 50, property_id, agency_id, direction }) {
    const skip = (page - 1) * limit;

    const filters = {
      skip,
      take: limit,
      search,
      propertyId: property_id,
      direction, // 'inbound' | 'outbound' | undefined (all)
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

    // Create email record first (no property link yet — M2M connected after processing)
    const email = await emailRepository.create({
      subject,
      sender,
      email_body: textBody,
      html,
      agency_id: agency?.id || null,
      gmail_msgid: messageId,
    });

    // Process each property from AI extraction
    const propertyInfos = extractedInfo.properties || [{ address: null, contacts: [] }];
    const isMultiProperty = propertyInfos.length > 1;
    const allProperties = [];
    const allCreatedContacts = [];
    const allTasks = [];
    const taskTypesToCreate = extractedInfo.taskTypes || [];

    for (const propInfo of propertyInfos) {
      let formattedAddress = propInfo.address;
      if (formattedAddress) {
        try {
          formattedAddress = await this.formatAddress(formattedAddress);
        } catch (error) {
          logger.warn('[Email] Failed to format address', { error: error.message });
        }
      }

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
        const placeholderAddress = `[待补充地址] ${uuidv4().slice(0, 8)} - ${subject || 'Email'} - ${new Date().toISOString().slice(0, 10)}`;
        property = await propertyRepository.create({
          address: placeholderAddress,
          user_id: agencyUser.id,
        });
      }
      allProperties.push({ id: property.id, address: property.address });

      // Create contacts for this property
      if (propInfo.contacts && propInfo.contacts.length > 0) {
        for (const contact of propInfo.contacts) {
          if (contact.phone || contact.email) {
            const newContact = await contactRepository.create({
              name: contact.name || 'Unknown',
              phone: contact.phone,
              email: contact.email,
              property_id: property.id,
            });
            allCreatedContacts.push(newContact);
          }
        }
      }

      // Create tasks for this property
      if (agency?.id && taskTypesToCreate.length > 0) {
        for (const taskType of taskTypesToCreate) {
          const mappedType = this.mapTaskType(taskType);
          if (mappedType) {
            const shortAddress = property.address?.split(',')[0] || '';
            const taskName = isMultiProperty
              ? `${shortAddress} - ${taskType}`
              : `${extractedInfo.summary || subject || 'New task from email'} - ${taskType}`;
            const task = await taskRepository.create({
              property_id: property.id,
              agency_id: agency.id,
              task_name: taskName,
              task_description: textBody?.substring(0, 500),
              email_id: email.id,
              status: senderType === 'unassigned' ? 'UNASSIGNED' : 'UNKNOWN',
              type: mappedType,
            });
            allTasks.push({ id: task.id, task_name: task.taskName, type: mappedType, propertyId: property.id });
          }
        }
      }
    }

    // Connect all properties to the email via M2M
    const allPropertyIds = allProperties.map((p) => p.id);
    await emailRepository.connectProperties(email.id, allPropertyIds);

    // Re-fetch email with M2M relations for accurate formatEmail output
    const emailWithRelations = await emailRepository.findByIdWithRelations(email.id);

    if (!agency?.id) {
      logger.warn('[Email] No agency available, tasks not created. Email saved for manual review.', {
        emailId: email.id,
        senderType,
      });
    } else if (taskTypesToCreate.length === 0) {
      logger.info('[Email] No recognized task types, no tasks created.', {
        emailId: email.id,
      });
    }

    logger.info('[Email] Successfully processed email with AI', {
      emailId: email.id,
      propertyCount: allProperties.length,
      taskCount: allTasks.length,
      taskTypes: taskTypesToCreate,
      urgency: extractedInfo.urgency,
      senderType,
    });

    return {
      email: this.formatEmail(emailWithRelations),
      property: allProperties[0],
      properties: allProperties,
      contacts: allCreatedContacts.length,
      tasks: allTasks,
      task: allTasks.length > 0 ? allTasks[0] : null,
      extracted: {
        urgency: extractedInfo.urgency,
        summary: extractedInfo.summary,
        addressFound: allProperties.some((p) => !p.address?.startsWith('[待补充地址]')),
        taskTypes: taskTypesToCreate,
      },
      senderType,
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
      SAFETY_CHECK: TASK_TYPE.SAFETY_CHECK,
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
      recipient: email.recipient,
      email_body: email.emailBody,
      html: email.html,
      agency_id: email.agencyId,
      gmail_msgid: email.gmailMsgid,
      is_processed: email.isProcessed,
      process_note: email.processNote,
      direction: email.direction || 'inbound',
      created_at: email.createdAt,
      updated_at: email.updatedAt,
    };

    // M2M properties from _EmailToProperty join table
    if (email.properties && email.properties.length > 0) {
      formatted.property_id = email.properties[0].id;           // backward compat
      formatted.property_address = email.properties[0].address;  // backward compat
      formatted.property = { id: email.properties[0].id, address: email.properties[0].address };
      formatted.properties = email.properties.map((p) => ({ id: p.id, address: p.address }));
    }

    if (email.tasks && email.tasks.length > 0) {
      formatted.tasks = email.tasks.map((t) => ({
        id: t.id,
        task_name: t.taskName,
        status: t.status,
        type: t.type,
        property_id: t.propertyId,
        property_address: t.property?.address || null,
      }));
      // For display convenience
      formatted.task_id = email.tasks[0].id;
      formatted.task_name = email.tasks[0].taskName;
      formatted.task_type = email.tasks[0].type;

      // If properties not yet populated from M2M include, derive from tasks
      if (!formatted.properties) {
        const propertyMap = new Map();
        for (const t of email.tasks) {
          if (t.propertyId && !propertyMap.has(t.propertyId)) {
            propertyMap.set(t.propertyId, { id: t.propertyId, address: t.property?.address || null });
          }
        }
        if (propertyMap.size > 0) {
          formatted.properties = Array.from(propertyMap.values());
          formatted.property_id = formatted.properties[0].id;
          formatted.property_address = formatted.properties[0].address;
        }
      }
    }

    return formatted;
  },

  /**
   * Generate process note from processing result
   * @param {Object} result - Processing result
   */
  generateProcessNote(result) {
    const notes = [];

    // Sender identification
    if (result.senderType === 'user') {
      notes.push(`✓ Sender identified: System user (${result.agencyUser?.name || result.agencyUser?.email})`);
    } else if (result.senderType === 'whitelist') {
      notes.push(`✓ Sender identified: Whitelist user`);
    } else if (result.senderType === 'unassigned') {
      notes.push(`⚠ Sender not recognized: Assigned to system admin`);
    } else if (result.senderType === 'api') {
      notes.push(`✓ Manual processing via API`);
    }

    // Property identification (multi-property aware)
    const properties = result.properties || (result.property ? [result.property] : []);
    if (properties.length > 1) {
      notes.push(`📦 Composite email: ${properties.length} properties detected`);
      for (const prop of properties) {
        if (prop.existed) {
          notes.push(`  ✓ Linked to existing property: ${prop.address} (ID: ${prop.id})`);
        } else if (prop.address?.startsWith('[待补充地址]')) {
          notes.push(`  ⚠ Created placeholder property (ID: ${prop.id})`);
        } else {
          notes.push(`  ✓ Created new property: ${prop.address} (ID: ${prop.id})`);
        }
      }
    } else if (properties.length === 1) {
      const prop = properties[0];
      if (prop.existed) {
        notes.push(`✓ Linked to existing property: ${prop.address} (ID: ${prop.id})`);
      } else if (prop.address?.startsWith('[待补充地址]')) {
        notes.push(`⚠ Address not extracted: Created placeholder property`);
      } else {
        notes.push(`✓ Created new property: ${prop.address}`);
      }
    } else {
      notes.push(`⚠ Could not create property`);
    }

    // Task creation
    if (result.tasks && result.tasks.length > 0) {
      for (const task of result.tasks) {
        const taskType = task.type || 'General';
        notes.push(`✓ Created task: ${task.task_name} (${taskType})`);
      }
    } else if (result.task) {
      const taskType = result.task.type || 'General';
      notes.push(`✓ Created task: ${result.task.task_name} (${taskType})`);
    } else if (result.noAgency) {
      notes.push(`⚠ Task not created: No agency determined`);
    } else if (result.extracted?.taskTypes?.length === 0) {
      notes.push(`ℹ No tasks created: Email type not recognized as SMOKE_ALARM or GAS_&_ELECTRICITY`);
    }

    // AI extracted info
    if (result.extracted?.summary) {
      notes.push(`📋 AI Summary: ${result.extracted.summary}`);
    }

    return notes.join('\n');
  },

  /**
   * Process a stored (unprocessed) email by ID
   * Step 2 of 2-step processing: Full AI processing
   * @param {number} emailId - Email ID to process
   */
  async processStoredEmailById(emailId) {
    const email = await emailRepository.findById(emailId);
    if (!email) {
      throw new NotFoundError('Email');
    }

    if (email.isProcessed) {
      return {
        alreadyProcessed: true,
        message: 'Email already processed',
        email: this.formatEmail(email),
      };
    }

    return this.processStoredEmail(email);
  },

  /**
   * Process a stored email record with AI
   * Step 2 of 2-step processing
   * @param {Object} email - Email record from database
   */
  async processStoredEmail(email) {
    const { id, subject, sender, emailBody, html } = email;

    logger.info('[EmailService] Processing stored email', { emailId: id, subject, sender });

    // Extract actual email address from sender
    const senderEmail = this.extractEmailAddress(sender);

    // Use Gemini AI to extract information
    let extractedInfo = {};
    try {
      extractedInfo = await geminiService.extractEmailInfo(subject, emailBody);
    } catch (err) {
      logger.warn('[EmailService] AI extraction failed, using defaults', { error: err.message });
      extractedInfo = { properties: [{ address: null, contacts: [] }], taskTypes: [], summary: subject, urgency: 'MEDIUM' };
    }

    // Find agency and responsible user based on sender email
    let agency = null;
    let agencyUser = null;
    let senderType = null;

    if (senderEmail) {
      // Step 1: Check if sender is a registered system user
      const senderUser = await userRepository.findByEmail(senderEmail);

      if (senderUser && senderUser.isActive && senderUser.agencyId) {
        agency = { id: senderUser.agencyId };
        agencyUser = senderUser;
        senderType = 'user';
        logger.info('[EmailService] Sender is a registered user', {
          senderEmail,
          userId: senderUser.id,
          agencyId: senderUser.agencyId
        });
      } else {
        // Step 2: Check agency whitelist
        agency = await agencyWhitelistRepository.findAgencyByEmail(senderEmail);

        if (agency) {
          const agencyUsers = await userRepository.findByAgencyIdWithPriority(agency.id);
          if (agencyUsers.length > 0) {
            agencyUser = agencyUsers[0];
            senderType = 'whitelist';
            logger.info('[EmailService] Sender found in whitelist', {
              senderEmail,
              agencyId: agency.id,
              assignedUserId: agencyUser.id,
            });
          }
        }
      }
    }

    // Step 3: Fallback to system admin if no agency found
    if (!agency || !agencyUser) {
      logger.warn('[EmailService] Sender not recognized, using system admin fallback', { sender, senderEmail });

      const { users: adminUsers } = await userRepository.findAll({
        role: 'superuser',
        isActive: true,
        take: 1,
      });

      if (adminUsers.length === 0) {
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
        agency = agencyUser.agencyId ? { id: agencyUser.agencyId } : null;
        senderType = 'unassigned';
        logger.info('[EmailService] Using system admin as fallback', {
          adminUserId: agencyUser.id,
          agencyId: agency?.id || null
        });
      } else {
        // No admin found - mark as processed with error note
        const errorNote = '❌ Processing failed: No system admin available';
        await emailRepository.markAsProcessed(id, { processNote: errorNote });
        throw new ValidationError('System configuration error: No admin user available to process emails.');
      }
    }

    // Process each property from AI extraction
    const propertyInfos = extractedInfo.properties || [{ address: null, contacts: [] }];
    const isMultiProperty = propertyInfos.length > 1;
    const allProperties = [];
    const allCreatedContacts = [];
    const allTasks = [];
    const taskTypesToCreate = extractedInfo.taskTypes || [];
    let noAgency = false;

    for (let i = 0; i < propertyInfos.length; i++) {
      const propInfo = propertyInfos[i];
      let formattedAddress = propInfo.address;
      if (formattedAddress) {
        try {
          formattedAddress = await this.formatAddress(formattedAddress);
        } catch (error) {
          logger.warn('[EmailService] Failed to format address', { error: error.message });
        }
      }

      let property = null;
      let propertyExisted = false;

      if (formattedAddress) {
        property = await propertyRepository.findByAddressAndUser(formattedAddress, agencyUser.id);
        if (property) {
          propertyExisted = true;
        } else {
          property = await propertyRepository.create({
            address: formattedAddress,
            user_id: agencyUser.id,
          });
        }
      } else {
        const placeholderAddress = `[待补充地址] ${uuidv4().slice(0, 8)} - ${subject || 'Email'} - ${new Date().toISOString().slice(0, 10)}`;
        property = await propertyRepository.create({
          address: placeholderAddress,
          user_id: agencyUser.id,
        });
        logger.warn('[EmailService] No address extracted, created placeholder property', {
          propertyId: property.id,
          placeholderAddress,
        });
      }
      allProperties.push({ id: property.id, address: property.address, existed: propertyExisted });

      // Create contacts for this property
      if (propInfo.contacts && propInfo.contacts.length > 0) {
        for (const contact of propInfo.contacts) {
          if (contact.phone || contact.email) {
            const newContact = await contactRepository.create({
              name: contact.name || 'Unknown',
              phone: contact.phone,
              email: contact.email,
              property_id: property.id,
            });
            allCreatedContacts.push(newContact);
          }
        }
      }

      // Create tasks for this property
      if (agency?.id && taskTypesToCreate.length > 0) {
        for (const taskType of taskTypesToCreate) {
          const mappedType = this.mapTaskType(taskType);
          if (mappedType) {
            const shortAddress = property.address?.split(',')[0] || '';
            const taskName = isMultiProperty
              ? `${shortAddress} - ${taskType}`
              : `${extractedInfo.summary || subject || 'New task from email'} - ${taskType}`;
            const task = await taskRepository.create({
              property_id: property.id,
              agency_id: agency.id,
              task_name: taskName,
              task_description: emailBody?.substring(0, 500),
              email_id: id,
              status: senderType === 'unassigned' ? 'UNASSIGNED' : 'UNKNOWN',
              type: mappedType,
            });
            allTasks.push({ id: task.id, task_name: task.taskName, type: mappedType, propertyId: property.id });
          }
        }
      } else if (!agency?.id) {
        noAgency = true;
      }
    }

    if (noAgency) {
      logger.warn('[EmailService] No agency available, tasks not created', { emailId: id });
    } else if (taskTypesToCreate.length === 0) {
      logger.info('[EmailService] No recognized task types, no tasks created.', { emailId: id });
    }

    // Build result for process note generation
    const result = {
      senderType,
      agencyUser,
      property: allProperties[0],
      properties: allProperties,
      task: allTasks.length > 0 ? allTasks[0] : null,
      tasks: allTasks,
      noAgency,
      extracted: {
        urgency: extractedInfo.urgency,
        summary: extractedInfo.summary,
        addressFound: allProperties.some((p) => !p.address?.startsWith('[待补充地址]')),
        taskTypes: taskTypesToCreate,
      },
    };

    // Generate process note
    const processNote = this.generateProcessNote(result);

    // Mark email as processed and connect all properties via M2M
    await emailRepository.markAsProcessed(id, {
      propertyIds: allProperties.map((p) => p.id),
      agencyId: agency?.id || null,
      processNote,
    });

    logger.info('[EmailService] Successfully processed stored email', {
      emailId: id,
      propertyCount: allProperties.length,
      taskCount: allTasks.length,
      taskTypes: taskTypesToCreate,
      senderType,
    });

    // Fetch updated email for return
    const updatedEmail = await emailRepository.findByIdWithRelations(id);

    return {
      email: this.formatEmail(updatedEmail),
      property: allProperties[0],
      properties: allProperties,
      contacts: allCreatedContacts.length,
      task: result.task,
      tasks: allTasks,
      extracted: result.extracted,
      senderType,
      processNote,
    };
  },
};

module.exports = emailService;
