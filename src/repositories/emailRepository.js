/**
 * Email Repository
 *
 * Data access layer for Email entity using Prisma.
 */

const prisma = require('../config/prisma');

const emailRepository = {
  /**
   * Find email by ID
   */
  async findById(id) {
    return prisma.email.findUnique({
      where: { id },
    });
  },

  /**
   * Find email by ID with relations
   */
  async findByIdWithRelations(id) {
    return prisma.email.findUnique({
      where: { id },
      include: {
        property: {
          include: {
            user: {
              include: {
                agency: true,
              },
            },
          },
        },
        tasks: { where: { isActive: true } },
      },
    });
  },

  /**
   * Find email by Gmail message ID
   */
  async findByGmailMsgId(gmailMsgid) {
    return prisma.email.findUnique({
      where: { gmailMsgid },
    });
  },

  /**
   * Find all emails with filters and pagination
   * @param {Object} options - Filter options
   * @param {number} options.propertyId - Filter by property ID
   * @param {number} options.agencyId - Filter by agency ID
   * @param {string} options.direction - Filter by direction ('inbound' | 'outbound')
   * @param {string} options.search - Search term
   * @param {number} options.skip - Pagination offset
   * @param {number} options.take - Pagination limit
   */
  async findAll({ propertyId, agencyId, direction, search, skip = 0, take = 50 }) {
    const where = {
      ...(propertyId && { propertyId }),
      ...(agencyId && { agencyId }),
      ...(direction && { direction }),
      ...(search && {
        OR: [
          { subject: { contains: search, mode: 'insensitive' } },
          { sender: { contains: search, mode: 'insensitive' } },
          { recipient: { contains: search, mode: 'insensitive' } },
          { emailBody: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where,
        include: {
          property: true,
          tasks: { where: { isActive: true } },
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.email.count({ where }),
    ]);

    return { emails, total };
  },

  /**
   * Find emails by property ID
   */
  async findByPropertyId(propertyId) {
    return prisma.email.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Create a new email (inbound by default)
   */
  async create(data) {
    return prisma.email.create({
      data: {
        subject: data.subject,
        sender: data.sender,
        emailBody: data.email_body,
        html: data.html,
        propertyId: data.property_id,
        agencyId: data.agency_id,
        gmailMsgid: data.gmail_msgid,
        direction: 'inbound', // Default to inbound for received emails
      },
      include: {
        property: true,
      },
    });
  },

  /**
   * Update an email
   */
  async update(id, data) {
    const updateData = {};
    if (data.subject !== undefined) updateData.subject = data.subject;
    if (data.sender !== undefined) updateData.sender = data.sender;
    if (data.email_body !== undefined) updateData.emailBody = data.email_body;
    if (data.html !== undefined) updateData.html = data.html;
    if (data.property_id !== undefined) updateData.propertyId = data.property_id;
    if (data.agency_id !== undefined) updateData.agencyId = data.agency_id;

    return prisma.email.update({
      where: { id },
      data: updateData,
    });
  },

  /**
   * Delete an email
   */
  async delete(id) {
    return prisma.email.delete({
      where: { id },
    });
  },

  /**
   * Check if email exists by Gmail message ID
   */
  async existsByGmailMsgId(gmailMsgid) {
    const count = await prisma.email.count({
      where: { gmailMsgid },
    });
    return count > 0;
  },

  /**
   * Find unprocessed emails
   * @param {number} limit - Maximum number of emails to return
   */
  async findUnprocessed(limit = 10) {
    return prisma.email.findMany({
      where: { isProcessed: false },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });
  },

  /**
   * Mark email as processed with optional updates
   * @param {number} id - Email ID
   * @param {Object} options - Optional updates
   * @param {number} options.propertyId - Property ID to link
   * @param {number} options.agencyId - Agency ID to link
   * @param {string} options.processNote - Processing result note
   */
  async markAsProcessed(id, { propertyId = null, agencyId = null, processNote = null } = {}) {
    const updateData = {
      isProcessed: true,
      updatedAt: new Date(),
    };
    if (propertyId !== null) updateData.propertyId = propertyId;
    if (agencyId !== null) updateData.agencyId = agencyId;
    if (processNote !== null) updateData.processNote = processNote;

    return prisma.email.update({
      where: { id },
      data: updateData,
    });
  },

  /**
   * Create a new email (raw, unprocessed)
   * For webhook - saves email without processing
   */
  async createRaw(data) {
    return prisma.email.create({
      data: {
        subject: data.subject,
        sender: data.sender,
        emailBody: data.email_body,
        html: data.html,
        gmailMsgid: data.gmail_msgid,
        isProcessed: false,
        direction: 'inbound',
        // propertyId and agencyId are null initially
      },
    });
  },

  /**
   * Create an outbound email record
   * For sent emails (reminders, notifications, etc.)
   * @param {Object} data - Email data
   * @param {string} data.subject - Email subject
   * @param {string} data.from - Sender address
   * @param {string} data.to - Recipient address
   * @param {string} data.text - Plain text content
   * @param {string} data.html - HTML content
   * @param {number} data.property_id - Optional property ID
   * @param {number} data.agency_id - Optional agency ID
   */
  async createOutbound(data) {
    return prisma.email.create({
      data: {
        subject: data.subject,
        sender: data.from,
        recipient: data.to,
        emailBody: data.text,
        html: data.html,
        propertyId: data.property_id || null,
        agencyId: data.agency_id || null,
        direction: 'outbound',
        isProcessed: true, // Outbound emails are marked as processed
      },
    });
  },
};

module.exports = emailRepository;
