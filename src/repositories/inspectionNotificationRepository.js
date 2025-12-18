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
        property: true,
        contact: true,
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
   * Create a new notification
   */
  async create(data) {
    return prisma.inspectionNotification.create({
      data: {
        scheduleId: data.schedule_id,
        propertyId: data.property_id,
        contactId: data.contact_id,
        recipientEmail: data.recipient_email,
        bookingToken: data.booking_token,
        status: data.status || 'sent',
        sentAt: new Date(),
      },
      include: {
        property: true,
        contact: true,
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
