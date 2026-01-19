/**
 * Inspection Notification Repository
 *
 * Data access layer for InspectionNotification entity using Prisma.
 */

const prisma = require('../config/prisma');

const inspectionNotificationRepository = {
  /**
   * Find notification by ID
   */
  async findById(id) {
    return prisma.inspectionNotification.findUnique({
      where: { id },
      include: {
        schedule: true,
        property: true,
        contact: true,
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
  },

  /**
   * Find notification by booking token
   */
  async findByToken(token) {
    return prisma.inspectionNotification.findFirst({
      where: { bookingToken: token },
      include: {
        schedule: {
          include: {
            slots: {
              where: { isAvailable: true },
              orderBy: { startTime: 'asc' },
            },
          },
        },
        property: {
          include: {
            user: {
              include: {
                agency: {
                  select: { id: true, agencyName: true },
                },
              },
            },
          },
        },
        contact: true,
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
  },

  /**
   * Find notifications by schedule ID
   */
  async findByScheduleId(scheduleId) {
    return prisma.inspectionNotification.findMany({
      where: { scheduleId },
      include: {
        property: {
          select: { id: true, address: true },
        },
        contact: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Check if notification exists for property and schedule
   */
  async existsForPropertyAndSchedule(propertyId, scheduleId) {
    const count = await prisma.inspectionNotification.count({
      where: { propertyId, scheduleId },
    });
    return count > 0;
  },

  /**
   * Check if notification exists for specific email and schedule
   */
  async existsForEmailAndSchedule(email, scheduleId) {
    const count = await prisma.inspectionNotification.count({
      where: { recipientEmail: email, scheduleId },
    });
    return count > 0;
  },

  /**
   * Find all notifications for a property (across all schedules)
   */
  async findByPropertyId(propertyId) {
    return prisma.inspectionNotification.findMany({
      where: { propertyId },
      include: {
        schedule: true,
        contact: true,
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Find all recipients who received notifications for a property
   */
  async findRecipientsByPropertyId(propertyId) {
    return prisma.inspectionNotification.findMany({
      where: { propertyId },
      select: {
        id: true,
        recipientEmail: true,
        recipientType: true,
        contactId: true,
        userId: true,
        contact: {
          select: { id: true, name: true, email: true },
        },
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      distinct: ['recipientEmail'],
    });
  },

  /**
   * Create a new notification
   */
  async create(data) {
    return prisma.inspectionNotification.create({
      data: {
        scheduleId: data.schedule_id,
        propertyId: data.property_id,
        contactId: data.contact_id,
        userId: data.user_id,
        recipientType: data.recipient_type,
        recipientEmail: data.recipient_email,
        bookingToken: data.booking_token,
        status: data.status || 'sent',
        sentAt: new Date(),
      },
      include: {
        property: true,
        contact: true,
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
  },

  /**
   * Create multiple notifications
   */
  async createMany(notifications) {
    return prisma.inspectionNotification.createMany({
      data: notifications.map((n) => ({
        scheduleId: n.schedule_id,
        propertyId: n.property_id,
        contactId: n.contact_id,
        recipientEmail: n.recipient_email,
        bookingToken: n.booking_token,
        status: n.status || 'sent',
        sentAt: new Date(),
      })),
    });
  },

  /**
   * Update notification status
   */
  async updateStatus(id, status) {
    return prisma.inspectionNotification.update({
      where: { id },
      data: { status },
    });
  },
};

module.exports = inspectionNotificationRepository;
