/**
 * Inspection Schedule Repository
 *
 * Data access layer for InspectionSchedule entity using Prisma.
 */

const prisma = require('../config/prisma');

const inspectionScheduleRepository = {
  /**
   * Find all schedules with optional filters
   * For agency users, only return schedules that have bookings from their agency's properties
   * @param {Object} filters - Query filters
   * @param {Object} scope - Access scope (agencyId for agency users)
   */
  async findAll(filters = {}, scope = {}) {
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

    // For agency users, only show schedules that have bookings for their agency's properties
    if (scope.agencyId) {
      where.slots = {
        some: {
          bookings: {
            some: {
              property: {
                user: { agencyId: scope.agencyId },
              },
            },
          },
        },
      };
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
   * For agency users, validates they have access (via property bookings)
   * @param {number} id - Schedule ID
   * @param {Object} scope - Access scope (agencyId for agency users)
   */
  async findById(id, scope = {}) {
    // Build include for slots - if agency user, filter bookings to only their agency's
    const slotsInclude = {
      orderBy: { startTime: 'asc' },
      include: {
        _count: {
          select: { bookings: true },
        },
      },
    };

    // For agency users, only include bookings for their agency's properties
    if (scope.agencyId) {
      slotsInclude.include.bookings = {
        where: {
          property: {
            user: { agencyId: scope.agencyId },
          },
        },
        include: {
          property: {
            select: { id: true, address: true },
          },
        },
      };
    }

    const schedule = await prisma.inspectionSchedule.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, name: true },
        },
        slots: slotsInclude,
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

    // For agency users, verify they have at least one booking in this schedule
    if (schedule && scope.agencyId) {
      const hasAccess = schedule.slots.some(
        (slot) => slot.bookings && slot.bookings.length > 0
      );
      if (!hasAccess) {
        return null; // No access to this schedule
      }
    }

    return schedule;
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
   * Find future published schedules by region (for multi-date booking display)
   */
  async findFutureByRegion(region) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return prisma.inspectionSchedule.findMany({
      where: {
        region,
        isActive: true,
        status: 'published',
        scheduleDate: {
          gte: today,
        },
      },
      include: {
        slots: {
          where: { isAvailable: true },
          orderBy: { startTime: 'asc' },
        },
      },
      orderBy: { scheduleDate: 'asc' },
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
