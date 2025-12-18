/**
 * User Service
 *
 * Business logic for User entity.
 */

const bcrypt = require('bcrypt');
const userRepository = require('../repositories/userRepository');
const permissionRepository = require('../repositories/permissionRepository');
const { NotFoundError, ConflictError, ForbiddenError } = require('../lib/errors');
const { USER_ROLES } = require('../config/constants');
const { createPagination } = require('../lib/response');

const userService = {
  /**
   * Get user by ID
   */
  async getUserById(id, requestingUser) {
    const user = await userRepository.findByIdWithRelations(id);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Check access
    if (!this.canAccessUser(requestingUser, user)) {
      throw new ForbiddenError('Cannot access this user');
    }

    return this.formatUser(user);
  },

  /**
   * List users with filters
   */
  async listUsers(requestingUser, { search, page = 1, limit = 50, role, agency_id }) {
    const skip = (page - 1) * limit;
    const scope = this.buildUserScope(requestingUser);

    // Merge scope with additional filters
    const filters = {
      ...scope,
      skip,
      take: limit,
      search,
      role,
    };

    // Only allow agency_id filter for superuser/admin
    if (['superuser', 'admin'].includes(requestingUser.role) && agency_id) {
      filters.agencyId = agency_id;
    }

    const { users, total } = await userRepository.findAll(filters);

    return {
      users: users.map(this.formatUser),
      pagination: createPagination(page, limit, total),
    };
  },

  /**
   * Create a new user
   */
  async createUser(data, requestingUser) {
    // Check if email already exists
    const existingUser = await userRepository.findByEmail(data.email);
    if (existingUser) {
      throw new ConflictError('This email is already registered');
    }

    // Verify agency access for non-superuser/admin
    if (!['superuser', 'admin'].includes(requestingUser.role)) {
      if (data.agency_id !== requestingUser.agency_id) {
        throw new ForbiddenError('Cannot create user for another agency');
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Create user
    const user = await userRepository.create({
      ...data,
      password: hashedPassword,
    });

    // Assign permissions based on role
    if (data.permissions && data.permissions.length > 0) {
      // Custom permissions
      const permissionIds = [];
      for (const perm of data.permissions) {
        const permission = await permissionRepository.getOrCreate(
          perm.permission_value,
          perm.permission_scope
        );
        permissionIds.push(permission.id);
      }
      await permissionRepository.assignManyToUser(user.id, permissionIds);
    } else {
      // Default permissions based on role
      await permissionRepository.assignDefaultPermissions(user.id, user.role);
    }

    return userRepository.findByIdWithRelations(user.id);
  },

  /**
   * Update a user
   */
  async updateUser(id, data, requestingUser) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Check access
    if (!this.canModifyUser(requestingUser, user)) {
      throw new ForbiddenError('Cannot modify this user');
    }

    // If email is being changed, check for conflicts
    if (data.email && data.email !== user.email) {
      const existingUser = await userRepository.findByEmail(data.email);
      if (existingUser) {
        throw new ConflictError('This email is already registered');
      }
    }

    // Hash password if being changed
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }

    await userRepository.update(id, data);
    return userRepository.findByIdWithRelations(id);
  },

  /**
   * Delete a user (soft delete)
   */
  async deleteUser(id, requestingUser) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Prevent self-deletion
    if (id === requestingUser.user_id) {
      throw new ForbiddenError('Cannot delete yourself');
    }

    // Check access
    if (!this.canModifyUser(requestingUser, user)) {
      throw new ForbiddenError('Cannot delete this user');
    }

    return userRepository.softDelete(id);
  },

  /**
   * Build user scope based on requesting user's role
   */
  buildUserScope(requestingUser) {
    if (['superuser', 'admin'].includes(requestingUser.role)) {
      return { isActive: true };
    }
    if (requestingUser.role === USER_ROLES.AGENCY_ADMIN) {
      return { isActive: true, agencyId: requestingUser.agency_id };
    }
    // Agency user can only see themselves
    return { isActive: true, id: requestingUser.user_id };
  },

  /**
   * Check if requesting user can access target user
   */
  canAccessUser(requestingUser, targetUser) {
    if (['superuser', 'admin'].includes(requestingUser.role)) return true;
    if (requestingUser.role === USER_ROLES.AGENCY_ADMIN) {
      return requestingUser.agency_id === targetUser.agencyId;
    }
    return requestingUser.user_id === targetUser.id;
  },

  /**
   * Check if requesting user can modify target user
   */
  canModifyUser(requestingUser, targetUser) {
    if (requestingUser.role === 'superuser') return true;
    if (requestingUser.role === 'admin') {
      // Admin can modify non-superusers
      return targetUser.role !== 'superuser';
    }
    if (requestingUser.role === USER_ROLES.AGENCY_ADMIN) {
      // Agency admin can modify users in their agency
      return requestingUser.agency_id === targetUser.agencyId &&
        !['superuser', 'admin'].includes(targetUser.role);
    }
    // Users can only modify themselves
    return requestingUser.user_id === targetUser.id;
  },

  /**
   * Format user for API response
   */
  formatUser(user) {
    const formatted = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_active: user.isActive,
      agency_id: user.agencyId,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    };

    if (user.agency) {
      formatted.agency = {
        id: user.agency.id,
        agency_name: user.agency.agencyName,
      };
    }

    if (user.permissions) {
      formatted.permissions = user.permissions.reduce((acc, up) => {
        const scope = up.permission.permissionScope;
        if (!acc[scope]) acc[scope] = [];
        acc[scope].push(up.permission.permissionValue);
        return acc;
      }, {});
    }

    if (user.properties) {
      formatted.properties = user.properties.map((p) => ({
        id: p.id,
        address: p.address,
      }));
    }

    return formatted;
  },
};

module.exports = userService;
