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
        tasks: true,
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
   */
  async findAll({ propertyId, agencyId, search, skip = 0, take = 50 }) {
    const where = {
      ...(propertyId && { propertyId }),
      ...(agencyId && { agencyId }),
      ...(search && {
        OR: [
          { subject: { contains: search, mode: 'insensitive' } },
          { sender: { contains: search, mode: 'insensitive' } },
          { emailBody: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where,
        include: {
          property: true,
          tasks: true,
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
   * Create a new email
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
};

module.exports = emailRepository;
