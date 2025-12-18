/**
 * Permission Repository
 *
 * Data access layer for Permission and UserPermission entities using Prisma.
 */

const prisma = require('../config/prisma');

const permissionRepository = {
  /**
   * Find permission by ID
   */
  async findById(id) {
    return prisma.permission.findUnique({
      where: { id },
    });
  },

  /**
   * Find permission by value and scope
   */
  async findByValueAndScope(permissionValue, permissionScope) {
    return prisma.permission.findFirst({
      where: {
        permissionValue,
        permissionScope,
      },
    });
  },

  /**
   * Find all permissions
   */
  async findAll() {
    return prisma.permission.findMany({
      orderBy: [
        { permissionScope: 'asc' },
        { permissionValue: 'asc' },
      ],
    });
  },

  /**
   * Find permissions by user ID
   */
  async findByUserId(userId) {
    const userPermissions = await prisma.userPermission.findMany({
      where: { userId },
      include: {
        permission: true,
      },
    });

    return userPermissions.map((up) => up.permission);
  },

  /**
   * Create a new permission
   */
  async create(data) {
    return prisma.permission.create({
      data: {
        permissionValue: data.permission_value,
        permissionScope: data.permission_scope,
      },
    });
  },

  /**
   * Assign permission to user
   */
  async assignToUser(userId, permissionId) {
    return prisma.userPermission.create({
      data: {
        userId,
        permissionId,
      },
    });
  },

  /**
   * Assign multiple permissions to user
   */
  async assignManyToUser(userId, permissionIds) {
    const data = permissionIds.map((permissionId) => ({
      userId,
      permissionId,
    }));

    return prisma.userPermission.createMany({
      data,
      skipDuplicates: true,
    });
  },

  /**
   * Remove permission from user
   */
  async removeFromUser(userId, permissionId) {
    return prisma.userPermission.delete({
      where: {
        userId_permissionId: {
          userId,
          permissionId,
        },
      },
    });
  },

  /**
   * Remove all permissions from user
   */
  async removeAllFromUser(userId) {
    return prisma.userPermission.deleteMany({
      where: { userId },
    });
  },

  /**
   * Get or create permission
   */
  async getOrCreate(permissionValue, permissionScope) {
    let permission = await this.findByValueAndScope(permissionValue, permissionScope);
    if (!permission) {
      permission = await this.create({
        permission_value: permissionValue,
        permission_scope: permissionScope,
      });
    }
    return permission;
  },

  /**
   * Assign default permissions based on role
   */
  async assignDefaultPermissions(userId, role) {
    const scopes = ['user', 'agency', 'property', 'task', 'contact', 'email', 'veu_project', 'setting', 'inspection'];
    const permissions = [];

    for (const scope of scopes) {
      // Read permission for all roles
      permissions.push({ permission_value: 'read', permission_scope: scope });

      // Create and Update for admin roles
      if (['superuser', 'admin', 'agency-admin'].includes(role)) {
        permissions.push({ permission_value: 'create', permission_scope: scope });
        permissions.push({ permission_value: 'update', permission_scope: scope });
      }

      // Delete only for superuser
      if (role === 'superuser') {
        permissions.push({ permission_value: 'delete', permission_scope: scope });
      }
    }

    // Get or create all permissions and assign them
    const permissionIds = [];
    for (const perm of permissions) {
      const permission = await this.getOrCreate(perm.permission_value, perm.permission_scope);
      permissionIds.push(permission.id);
    }

    await this.assignManyToUser(userId, permissionIds);
  },
};

module.exports = permissionRepository;
