/**
 * User Repository
 *
 * Data access layer for User entity using Prisma.
 */

const prisma = require('../config/prisma');

const userRepository = {
  /**
   * Find user by ID
   */
  async findById(id) {
    return prisma.user.findUnique({
      where: { id },
    });
  },

  /**
   * Find user by ID with relations
   */
  async findByIdWithRelations(id) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        agency: true,
        properties: {
          where: { isActive: true },
        },
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  },

  /**
   * Find user by email
   */
  async findByEmail(email) {
    return prisma.user.findUnique({
      where: { email },
    });
  },

  /**
   * Find all users with filters and pagination
   */
  async findAll({ isActive, agencyId, role, search, skip = 0, take = 50 }) {
    const where = {
      ...(isActive !== undefined && { isActive }),
      ...(agencyId && { agencyId }),
      ...(role && { role }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          agency: true,
          permissions: {
            include: {
              permission: true,
            },
          },
        },
        skip,
        take,
        orderBy: { id: 'asc' },
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  },

  /**
   * Create a new user
   */
  async create(data) {
    return prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: data.password,
        role: data.role,
        agencyId: data.agency_id,
      },
    });
  },

  /**
   * Update a user
   */
  async update(id, data) {
    const updateData = {};
    if (data.email !== undefined) updateData.email = data.email;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.password !== undefined) updateData.password = data.password;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.agency_id !== undefined) updateData.agencyId = data.agency_id;
    if (data.is_active !== undefined) updateData.isActive = data.is_active;
    if (data.refresh_token !== undefined) updateData.refreshToken = data.refresh_token;

    return prisma.user.update({
      where: { id },
      data: updateData,
    });
  },

  /**
   * Soft delete a user
   */
  async softDelete(id) {
    return prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  },

  /**
   * Update refresh token
   */
  async updateRefreshToken(id, refreshToken) {
    return prisma.user.update({
      where: { id },
      data: { refreshToken },
    });
  },

  /**
   * Find user by refresh token
   */
  async findByRefreshToken(refreshToken) {
    return prisma.user.findFirst({
      where: { refreshToken },
    });
  },

  /**
   * Find agency users by agencyId, prioritizing agencyAdmin
   */
  async findByAgencyIdWithPriority(agencyId) {
    const users = await prisma.user.findMany({
      where: {
        agencyId,
        isActive: true,
        email: {
          not: '',
        },
      },
      orderBy: [
        // agencyAdmin first, then agencyUser
        { role: 'asc' },
      ],
    });

    // Sort to prioritize agencyAdmin
    return users.sort((a, b) => {
      const priority = { agencyAdmin: 1, agencyUser: 2, admin: 3, superuser: 4 };
      return (priority[a.role] || 99) - (priority[b.role] || 99);
    });
  },
};

module.exports = userRepository;
