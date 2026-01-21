/**
 * Agency Repository
 *
 * Data access layer for Agency entity using Prisma.
 */

const prisma = require('../config/prisma');

const agencyRepository = {
  /**
   * Find agency by ID
   */
  async findById(id) {
    return prisma.agency.findUnique({
      where: { id },
    });
  },

  /**
   * Find agency by ID with relations
   */
  async findByIdWithRelations(id) {
    return prisma.agency.findUnique({
      where: { id },
      include: {
        users: {
          where: { isActive: true },
        },
        whitelist: true,
      },
    });
  },

  /**
   * Find all agencies with filters and pagination
   */
  async findAll({ isActive = true, search, skip = 0, take = 50 }) {
    const where = {
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        agencyName: { contains: search, mode: 'insensitive' },
      }),
    };

    const [agencies, total] = await Promise.all([
      prisma.agency.findMany({
        where,
        include: {
          _count: {
            select: {
              users: true,
            },
          },
        },
        skip,
        take,
        orderBy: { id: 'asc' },
      }),
      prisma.agency.count({ where }),
    ]);

    return { agencies, total };
  },

  /**
   * List agencies with task statistics
   * Uses raw query for complex aggregation with parameterized search
   */
  async listAgenciesWithStats(search) {
    // Use parameterized query to prevent SQL injection
    if (search) {
      const stats = await prisma.$queryRaw`
        SELECT
          a.id as agency_id,
          a.agency_name,
          a.address,
          a.phone,
          a.logo,
          a.is_active,
          a.veu_activated,
          a.created_at,
          a.updated_at,
          COUNT(DISTINCT u.id) as total_users,
          COUNT(DISTINCT CASE WHEN t.status = 'unknown' AND t.is_active = true THEN p.id END) as unknown_count,
          COUNT(CASE WHEN t.status = 'incomplete' AND t.is_active = true THEN 1 END) as incomplete_count,
          COUNT(CASE WHEN t.status = 'processing' AND t.is_active = true THEN 1 END) as processing_count,
          COUNT(CASE WHEN t.status = 'due soon' AND t.is_active = true THEN 1 END) as due_soon_count,
          COUNT(CASE WHEN t.status = 'expired' AND t.is_active = true THEN 1 END) as expired_count,
          COUNT(CASE WHEN t.status = 'completed' AND t.is_active = true THEN 1 END) as completed_count
        FROM "AGENCY" a
        LEFT JOIN "USER" u ON u.agency_id = a.id AND u.is_active = true
        LEFT JOIN "PROPERTY" p ON p.user_id = u.id AND p.is_active = true
        LEFT JOIN "TASK" t ON t.property_id = p.id
        WHERE a.is_active = true AND a.agency_name ILIKE ${'%' + search + '%'}
        GROUP BY a.id
        ORDER BY a.id ASC
      `;
      return stats;
    }

    // No search - no need for ILIKE condition
    const stats = await prisma.$queryRaw`
      SELECT
        a.id as agency_id,
        a.agency_name,
        a.address,
        a.phone,
        a.logo,
        a.is_active,
        a.veu_activated,
        a.created_at,
        a.updated_at,
        COUNT(DISTINCT u.id) as total_users,
        COUNT(DISTINCT CASE WHEN t.status = 'unknown' AND t.is_active = true THEN p.id END) as unknown_count,
        COUNT(CASE WHEN t.status = 'incomplete' AND t.is_active = true THEN 1 END) as incomplete_count,
        COUNT(CASE WHEN t.status = 'processing' AND t.is_active = true THEN 1 END) as processing_count,
        COUNT(CASE WHEN t.status = 'due soon' AND t.is_active = true THEN 1 END) as due_soon_count,
        COUNT(CASE WHEN t.status = 'expired' AND t.is_active = true THEN 1 END) as expired_count,
        COUNT(CASE WHEN t.status = 'completed' AND t.is_active = true THEN 1 END) as completed_count
      FROM "AGENCY" a
      LEFT JOIN "USER" u ON u.agency_id = a.id AND u.is_active = true
      LEFT JOIN "PROPERTY" p ON p.user_id = u.id AND p.is_active = true
      LEFT JOIN "TASK" t ON t.property_id = p.id
      WHERE a.is_active = true
      GROUP BY a.id
      ORDER BY a.id ASC
    `;

    return stats;
  },

  /**
   * Create a new agency
   */
  async create(data) {
    return prisma.agency.create({
      data: {
        agencyName: data.agency_name,
        address: data.address,
        phone: data.phone,
        logo: data.logo,
      },
    });
  },

  /**
   * Update an agency
   */
  async update(id, data) {
    const updateData = {};
    if (data.agency_name !== undefined) updateData.agencyName = data.agency_name;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.logo !== undefined) updateData.logo = data.logo;
    if (data.is_active !== undefined) updateData.isActive = data.is_active;
    if (data.veu_activated !== undefined) updateData.veuActivated = data.veu_activated;

    return prisma.agency.update({
      where: { id },
      data: updateData,
    });
  },

  /**
   * Soft delete an agency
   */
  async softDelete(id) {
    return prisma.agency.update({
      where: { id },
      data: { isActive: false },
    });
  },

  /**
   * Activate VEU for agency
   */
  async activateVeu(id) {
    return prisma.agency.update({
      where: { id },
      data: { veuActivated: true },
    });
  },
};

module.exports = agencyRepository;
