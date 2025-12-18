/**
 * Inspection Config Repository
 *
 * Data access layer for InspectionConfig entity using Prisma.
 */

const prisma = require('../config/prisma');

const inspectionConfigRepository = {
  /**
   * Find all inspection configs
   */
  async findAll() {
    return prisma.inspectionConfig.findMany({
      where: { isActive: true },
      orderBy: { region: 'asc' },
    });
  },

  /**
   * Find config by region
   */
  async findByRegion(region) {
    return prisma.inspectionConfig.findUnique({
      where: { region },
    });
  },

  /**
   * Create a new config
   */
  async create(data) {
    return prisma.inspectionConfig.create({
      data: {
        region: data.region,
        startTime: data.start_time,
        endTime: data.end_time,
        slotDuration: data.slot_duration,
        maxCapacity: data.max_capacity || 1,
        isActive: true,
      },
    });
  },

  /**
   * Update a config by region
   */
  async updateByRegion(region, data) {
    const updateData = {};
    if (data.start_time !== undefined) updateData.startTime = data.start_time;
    if (data.end_time !== undefined) updateData.endTime = data.end_time;
    if (data.slot_duration !== undefined) updateData.slotDuration = data.slot_duration;
    if (data.max_capacity !== undefined) updateData.maxCapacity = data.max_capacity;
    if (data.is_active !== undefined) updateData.isActive = data.is_active;

    return prisma.inspectionConfig.update({
      where: { region },
      data: updateData,
    });
  },

  /**
   * Upsert a config (create or update)
   */
  async upsert(region, data) {
    return prisma.inspectionConfig.upsert({
      where: { region },
      update: {
        startTime: data.start_time,
        endTime: data.end_time,
        slotDuration: data.slot_duration,
        maxCapacity: data.max_capacity || 1,
        isActive: data.is_active !== undefined ? data.is_active : true,
      },
      create: {
        region,
        startTime: data.start_time,
        endTime: data.end_time,
        slotDuration: data.slot_duration,
        maxCapacity: data.max_capacity || 1,
        isActive: true,
      },
    });
  },

  /**
   * Delete a config by region
   */
  async deleteByRegion(region) {
    return prisma.inspectionConfig.delete({
      where: { region },
    });
  },
};

module.exports = inspectionConfigRepository;
