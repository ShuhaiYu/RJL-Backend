/**
 * Property Repository
 *
 * Data access layer for Property entity using Prisma.
 */

const prisma = require('../config/prisma');

const propertyRepository = {
  /**
   * Find property by ID
   */
  async findById(id) {
    return prisma.property.findUnique({
      where: { id },
    });
  },

  /**
   * Find property by ID with relations
   */
  async findByIdWithRelations(id) {
    return prisma.property.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            agency: true,
          },
        },
        contacts: {
          where: { isActive: true },
        },
        tasks: {
          where: { isActive: true },
        },
        emails: true,
        veuProjects: true,
      },
    });
  },

  /**
   * Find property by address for a user
   */
  async findByAddressAndUser(address, userId) {
    return prisma.property.findFirst({
      where: {
        address,
        userId,
        isActive: true,
      },
    });
  },

  /**
   * Find all properties with filters and pagination
   */
  async findAll({ isActive = true, userId, agencyId, region, search, skip = 0, take = 50 }) {
    let where = {
      ...(isActive !== undefined && { isActive }),
      ...(userId && { userId }),
      ...(region && { region }),
      ...(search && {
        address: { contains: search, mode: 'insensitive' },
      }),
    };

    // If agencyId is provided, filter by users in that agency
    if (agencyId) {
      where = {
        ...where,
        user: {
          agencyId,
        },
      };
    }

    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where,
        include: {
          user: {
            include: {
              agency: true,
            },
          },
          contacts: {
            where: { isActive: true },
          },
          _count: {
            select: {
              tasks: { where: { isActive: true } },
            },
          },
        },
        skip,
        take,
        orderBy: { id: 'desc' },
      }),
      prisma.property.count({ where }),
    ]);

    return { properties, total };
  },

  /**
   * Find properties by user IDs
   */
  async findByUserIds(userIds) {
    return prisma.property.findMany({
      where: {
        userId: { in: userIds },
        isActive: true,
      },
      include: {
        user: true,
      },
    });
  },

  /**
   * Create a new property
   */
  async create(data) {
    return prisma.property.create({
      data: {
        address: data.address,
        userId: data.user_id,
        region: data.region || null,
      },
      include: {
        user: {
          include: {
            agency: true,
          },
        },
      },
    });
  },

  /**
   * Update a property
   */
  async update(id, data) {
    const updateData = {};
    if (data.address !== undefined) updateData.address = data.address;
    if (data.user_id !== undefined) updateData.userId = data.user_id;
    if (data.is_active !== undefined) updateData.isActive = data.is_active;
    if (data.region !== undefined) updateData.region = data.region;

    return prisma.property.update({
      where: { id },
      data: updateData,
    });
  },

  /**
   * Soft delete a property
   */
  async softDelete(id) {
    return prisma.property.update({
      where: { id },
      data: { isActive: false },
    });
  },

  /**
   * Batch update region for multiple properties
   */
  async batchUpdateRegion(propertyIds, region) {
    return prisma.property.updateMany({
      where: {
        id: { in: propertyIds },
        isActive: true,
      },
      data: { region },
    });
  },

  /**
   * Find properties in a region that have at least one incomplete task
   * Used for inspection scheduling - only properties needing inspection
   * @param {string} region - The region to filter by
   * @param {number|undefined} agencyId - Optional agency ID to filter by (for agency users)
   */
  async findByRegionWithIncompleteTasks(region, agencyId = undefined) {
    const where = {
      region: region,
      isActive: true,
      tasks: {
        some: {
          status: 'incomplete',
          isActive: true,
        },
      },
    };

    // For agency users, only show their agency's properties
    if (agencyId) {
      where.user = {
        agencyId: agencyId,
      };
    }

    return prisma.property.findMany({
      where,
      include: {
        user: {
          include: {
            agency: true,
          },
        },
        contacts: {
          where: { isActive: true },
        },
      },
      orderBy: { id: 'desc' },
    });
  },
};

module.exports = propertyRepository;
