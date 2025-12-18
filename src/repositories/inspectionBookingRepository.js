/**
 * Inspection Booking Repository
 *
 * Data access layer for InspectionBooking entity using Prisma.
 */

const prisma = require('../config/prisma');

const inspectionBookingRepository = {
  /**
   * Find booking by ID
   */
  async findById(id) {
    return prisma.inspectionBooking.findUnique({
      where: { id },
      include: {
        slot: {
          include: {
            schedule: true,
          },
        },
        property: true,
        contact: true,
        confirmer: {
          select: { id: true, name: true },
        },
      },
    });
  },

  /**
   * Find booking by token
   */
  async findByToken(token) {
    return prisma.inspectionBooking.findUnique({
      where: { bookingToken: token },
      include: {
        slot: {
          include: {
            schedule: true,
          },
        },
        property: true,
        contact: true,
      },
    });
  },

  /**
   * Find bookings by schedule ID
   */
  async findByScheduleId(scheduleId) {
    return prisma.inspectionBooking.findMany({
      where: {
        slot: {
          scheduleId,
        },
      },
      include: {
        slot: true,
        property: {
          select: { id: true, address: true },
        },
        contact: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Find bookings with filters
   */
  async findAll(filters = {}) {
    const where = {};

    if (filters.schedule_id) {
      where.slot = { scheduleId: filters.schedule_id };
    }

    if (filters.property_id) {
      where.propertyId = filters.property_id;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      prisma.inspectionBooking.findMany({
        where,
        include: {
          slot: {
            include: {
              schedule: {
                select: { id: true, region: true, scheduleDate: true },
              },
            },
          },
          property: {
            select: { id: true, address: true },
          },
          contact: {
            select: { id: true, name: true, email: true, phone: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.inspectionBooking.count({ where }),
    ]);

    return {
      bookings,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Check if booking exists for property and schedule
   */
  async existsForPropertyAndSchedule(propertyId, scheduleId) {
    const count = await prisma.inspectionBooking.count({
      where: {
        propertyId,
        slot: { scheduleId },
        status: { notIn: ['cancelled'] },
      },
    });
    return count > 0;
  },

  /**
   * Create a booking
   */
  async create(data) {
    return prisma.inspectionBooking.create({
      data: {
        slotId: data.slot_id,
        propertyId: data.property_id,
        taskId: data.task_id,
        contactId: data.contact_id,
        contactName: data.contact_name,
        contactPhone: data.contact_phone,
        contactEmail: data.contact_email,
        status: data.status || 'pending',
        note: data.note,
        bookingToken: data.booking_token,
        tokenExpiresAt: data.token_expires_at,
      },
      include: {
        slot: {
          include: {
            schedule: true,
          },
        },
        property: true,
      },
    });
  },

  /**
   * Update booking status
   */
  async updateStatus(id, status, confirmedBy = null) {
    const updateData = { status };
    if (confirmedBy) {
      updateData.confirmedBy = confirmedBy;
      updateData.confirmedAt = new Date();
    }

    return prisma.inspectionBooking.update({
      where: { id },
      data: updateData,
      include: {
        slot: {
          include: {
            schedule: true,
          },
        },
        property: true,
        contact: true,
      },
    });
  },

  /**
   * Reschedule booking to a different slot
   */
  async reschedule(id, newSlotId, note = null) {
    return prisma.inspectionBooking.update({
      where: { id },
      data: {
        slotId: newSlotId,
        note: note,
      },
      include: {
        slot: {
          include: {
            schedule: true,
          },
        },
        property: true,
      },
    });
  },
};

module.exports = inspectionBookingRepository;
