/**
 * VEU Project Repository
 *
 * Data access layer for VEU Project entity using Prisma.
 */

const prisma = require('../config/prisma');

const veuProjectRepository = {
  /**
   * Find VEU project by ID
   */
  async findById(id) {
    return prisma.veuProject.findUnique({
      where: { id },
    });
  },

  /**
   * Find VEU project by ID with relations
   */
  async findByIdWithRelations(id) {
    return prisma.veuProject.findUnique({
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
        files: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  },

  /**
   * Find VEU projects by property ID
   */
  async findByPropertyId(propertyId) {
    return prisma.veuProject.findMany({
      where: { propertyId },
      include: {
        files: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  },

  /**
   * Find VEU project by property ID and type
   */
  async findByPropertyIdAndType(propertyId, type) {
    return prisma.veuProject.findUnique({
      where: {
        propertyId_type: {
          propertyId,
          type,
        },
      },
    });
  },

  /**
   * Find all VEU projects with filters and pagination
   */
  async findAll({ propertyId, type, isCompleted, search, skip = 0, take = 50 }) {
    const where = {
      ...(propertyId && { propertyId }),
      ...(type && { type }),
      ...(isCompleted !== undefined && { isCompleted }),
      ...(search && {
        OR: [
          { note: { contains: search, mode: 'insensitive' } },
          { completedBy: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [projects, total] = await Promise.all([
      prisma.veuProject.findMany({
        where,
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
          files: {
            orderBy: { createdAt: 'desc' },
          },
        },
        skip,
        take,
        orderBy: { id: 'desc' },
      }),
      prisma.veuProject.count({ where }),
    ]);

    return { projects, total };
  },

  /**
   * Get VEU overview tree (complex aggregation)
   * Uses raw SQL for the complex CTE query
   */
  async getVeuOverviewTree(user) {
    const agencyId = user?.agency_id;
    const userIds = user?.role === 'agency-user' ? [user.user_id] : null;

    // Build conditions
    let agencyCondition = '';
    let userCondition = '';

    if (agencyId && !['superuser', 'admin'].includes(user?.role)) {
      agencyCondition = `AND u.agency_id = ${agencyId}`;
    }

    if (userIds && userIds.length > 0) {
      userCondition = `AND p.user_id IN (${userIds.join(',')})`;
    }

    const result = await prisma.$queryRawUnsafe(`
      WITH scoped_props AS (
        SELECT p.id as property_id, p.address, u.agency_id, a.agency_name
        FROM "PROPERTY" p
        JOIN "USER" u ON p.user_id = u.id
        JOIN "AGENCY" a ON u.agency_id = a.id
        WHERE p.is_active = true
          AND a.veu_activated = true
          ${agencyCondition}
          ${userCondition}
      ),
      veu_data AS (
        SELECT
          sp.agency_id,
          sp.agency_name,
          sp.property_id,
          sp.address,
          v.id as veu_id,
          v.type,
          v.is_completed,
          v.price,
          v.completed_by,
          v.note,
          v.created_at,
          v.updated_at
        FROM scoped_props sp
        LEFT JOIN "VEU_PROJECT" v ON v.property_id = sp.property_id
      ),
      agency_stats AS (
        SELECT
          agency_id,
          agency_name,
          COUNT(DISTINCT property_id) as total_properties,
          COUNT(DISTINCT CASE WHEN type = 'water_heater' AND is_completed = true THEN property_id END) as water_heater_completed,
          COUNT(DISTINCT CASE WHEN type = 'air_conditioner' AND is_completed = true THEN property_id END) as air_conditioner_completed
        FROM veu_data
        GROUP BY agency_id, agency_name
      )
      SELECT
        vd.agency_id,
        vd.agency_name,
        vd.property_id,
        vd.address,
        vd.veu_id,
        vd.type,
        vd.is_completed,
        vd.price,
        vd.completed_by,
        vd.note,
        vd.created_at,
        vd.updated_at,
        ast.total_properties,
        ast.water_heater_completed,
        ast.air_conditioner_completed
      FROM veu_data vd
      JOIN agency_stats ast ON vd.agency_id = ast.agency_id
      ORDER BY vd.agency_id, vd.property_id, vd.type
    `);

    return result;
  },

  /**
   * Create a new VEU project
   */
  async create(data) {
    return prisma.veuProject.create({
      data: {
        propertyId: data.property_id,
        type: data.type,
        isCompleted: data.is_completed || false,
        price: data.price,
        completedBy: data.completed_by,
        note: data.note,
      },
      include: {
        property: true,
        files: true,
      },
    });
  },

  /**
   * Create default VEU projects for a property
   */
  async createDefaultForProperty(propertyId) {
    return prisma.veuProject.createMany({
      data: [
        { propertyId, type: 'water_heater' },
        { propertyId, type: 'air_conditioner' },
      ],
      skipDuplicates: true,
    });
  },

  /**
   * Update a VEU project
   */
  async update(id, data) {
    const updateData = {};
    if (data.type !== undefined) updateData.type = data.type;
    if (data.is_completed !== undefined) updateData.isCompleted = data.is_completed;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.completed_by !== undefined) updateData.completedBy = data.completed_by;
    if (data.note !== undefined) updateData.note = data.note;

    return prisma.veuProject.update({
      where: { id },
      data: updateData,
    });
  },

  /**
   * Delete a VEU project
   */
  async delete(id) {
    return prisma.veuProject.delete({
      where: { id },
    });
  },
};

module.exports = veuProjectRepository;
