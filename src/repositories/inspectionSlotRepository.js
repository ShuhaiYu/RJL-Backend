/**
 * Inspection Slot Repository
 *
 * Data access layer for InspectionSlot entity using Prisma.
 */

const prisma = require('../config/prisma');

const inspectionSlotRepository = {
  /**
   * Find slot by ID
   */
  async findById(id) {
    return prisma.inspectionSlot.findUnique({
      where: { id },
      include: {
        schedule: true,
        bookings: {
          include: {
            property: {
              select: { id: true, address: true },
            },
          },
        },
      },
    });
  },

  /**
   * Find slots by schedule ID
   */
  async findByScheduleId(scheduleId) {
    return prisma.inspectionSlot.findMany({
      where: { scheduleId },
      orderBy: { startTime: 'asc' },
      include: {
        _count: {
          select: { bookings: true },
        },
      },
    });
  },

  /**
   * Find available slots for a schedule
   */
  async findAvailableByScheduleId(scheduleId) {
    return prisma.inspectionSlot.findMany({
      where: {
        scheduleId,
        isAvailable: true,
      },
      orderBy: { startTime: 'asc' },
    });
  },

  /**
   * Update slot booking count
   */
  async incrementBookings(id) {
    return prisma.inspectionSlot.update({
      where: { id },
      data: {
        currentBookings: { increment: 1 },
      },
    });
  },

  /**
   * Decrement slot booking count
   */
  async decrementBookings(id) {
    return prisma.inspectionSlot.update({
      where: { id },
      data: {
        currentBookings: { decrement: 1 },
      },
    });
  },

  /**
   * Decrement slot booking count (with transaction support)
   */
  async decrementBookingsWithTx(tx, id) {
    return tx.inspectionSlot.update({
      where: { id },
      data: {
        currentBookings: { decrement: 1 },
      },
    });
  },

  /**
   * Update slot availability
   */
  async updateAvailability(id, isAvailable) {
    return prisma.inspectionSlot.update({
      where: { id },
      data: { isAvailable },
    });
  },

  /**
   * Check if slot is available for booking
   */
  async checkAvailability(id) {
    const slot = await prisma.inspectionSlot.findUnique({
      where: { id },
      select: {
        isAvailable: true,
        maxCapacity: true,
        currentBookings: true,
      },
    });

    if (!slot) return false;
    return slot.isAvailable && slot.currentBookings < slot.maxCapacity;
  },
};

module.exports = inspectionSlotRepository;
