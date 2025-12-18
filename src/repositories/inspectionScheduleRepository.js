/**
 * Inspection Schedule Repository
 *
 * Data access layer for InspectionSchedule entity using Prisma.
 */

const prisma = require('../config/prisma');

const inspectionScheduleRepository = {
  /**
   * Find all schedules with optional filters
   */
  async findAll(filters = {}) {
    const where = { isActive: true };

    if (filters.region) {
      where.region = filters.region;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.date_from || filters.date_to) {
      where.scheduleDate = {};
      if (filters.date_from) {
        where.scheduleDate.gte = new Date(filters.date_from);
      }
      if (filters.date_to) {
        where.scheduleDate.lte = new Date(filters.date_to);
      }
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const [schedules, total] = await Promise.all([
      prisma.inspectionSchedule.findMany({
        where,
        include: {
          creator: {
            select: { id: true, name: true },
          },
          _count: {
            select: { slots: true, notifications: true },
          },
        },
        orderBy: { scheduleDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.inspectionSchedule.count({ where }),
    ]);

    return {
      schedules,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Find schedule by ID with slots
   */
  async findById(id) {
    return prisma.inspectionSchedule.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, name: true },
        },
        slots: {
          orderBy: { startTime: 'asc' },
          include: {
            _count: {
              select: { bookings: true },
            },
          },
        },
        notifications: {
          include: {
            property: {
              select: { id: true, address: true },
            },
            contact: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  },

  /**
   * Find schedule by region and date
   */
  async findByRegionAndDate(region, scheduleDate) {
    return prisma.inspectionSchedule.findUnique({
      where: {
        region_scheduleDate: {
          region,
          scheduleDate: new Date(scheduleDate),
        },
      },
    });
  },

  /**
   * Create a new schedule with slots
   */
  async create(data, slots) {
    return prisma.inspectionSchedule.create({
      data: {
        region: data.region,
        scheduleDate: new Date(data.schedule_date),
        startTime: data.start_time,
        endTime: data.end_time,
        slotDuration: data.slot_duration,
        maxCapacity: data.max_capacity || 1,
        status: 'published',
        note: data.note,
        isActive: true,
        creator: {
          connect: { id: data.created_by },
        },
        slots: {
          create: slots.map((slot) => ({
            startTime: slot.startTime,
            endTime: slot.endTime,
            maxCapacity: slot.maxCapacity,
            currentBookings: 0,
            isAvailable: true,
          })),
        },
      },
      include: {
        slots: true,
        creator: {
          select: { id: true, name: true },
        },
      },
    });
  },

  /**
   * Update schedule
   */
  async update(id, data) {
    const updateData = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.note !== undefined) updateData.note = data.note;

    return prisma.inspectionSchedule.update({
      where: { id },
      data: updateData,
      include: {
        slots: true,
        creator: {
          select: { id: true, name: true },
        },
      },
    });
  },

  /**
   * Soft delete schedule
   */
  async softDelete(id) {
    return prisma.inspectionSchedule.update({
      where: { id },
      data: { isActive: false },
    });
  },
};

module.exports = inspectionScheduleRepository;
