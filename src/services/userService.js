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

    // Agency roles (agency-admin, agency-user) must have an agency_id
    const agencyRoles = [USER_ROLES.AGENCY_ADMIN, USER_ROLES.AGENCY_USER];
    if (agencyRoles.includes(data.role) && !data.agency_id) {
      throw new ForbiddenError('Agency users must belong to an agency');
    }

    // Non-agency roles (superuser, admin) should not have an agency_id
    if (!agencyRoles.includes(data.role) && data.agency_id) {
      throw new ForbiddenError('Superuser and admin users cannot belong to an agency');
    }

    // Verify agency access for non-superuser/admin
    if (!['superuser', 'admin'].includes(requestingUser.role)) {
      if (data.agency_id !== requestingUser.agency_id) {
        throw new ForbiddenError('Cannot create user for another agency');
      }
    }

    // Prevent role escalation - cannot create users with higher role
    const roleHierarchy = [USER_ROLES.AGENCY_USER, USER_ROLES.AGENCY_ADMIN, 'admin', 'superuser'];
    const requestingRoleIndex = roleHierarchy.indexOf(requestingUser.role);
    const targetRoleIndex = roleHierarchy.indexOf(data.role);

    if (targetRoleIndex > requestingRoleIndex) {
      throw new ForbiddenError('Cannot create a user with a role higher than your own');
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
      // Only superuser and admin can set custom permissions
      if (!['superuser', 'admin'].includes(requestingUser.role)) {
        // Non-admin users get default permissions regardless of what they request
        await permissionRepository.assignDefaultPermissions(user.id, user.role);
      } else {
        // Validate custom permissions don't exceed role defaults
        const validationResult = this.validatePermissionsForRole(data.permissions, user.role);
        if (!validationResult.valid) {
          // Clean up created user and throw error
          await userRepository.softDelete(user.id);
          throw new ForbiddenError(validationResult.message);
        }

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
      }
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

    // Password update restriction:
    // - Only superuser/admin can change other users' passwords directly
    // - Regular users must use /auth/change-password endpoint which requires old password
    if (data.password) {
      const isSelf = requestingUser.user_id === id;
      const isAdmin = ['superuser', 'admin'].includes(requestingUser.role);

      if (isSelf && !isAdmin) {
        throw new ForbiddenError('Use /auth/change-password endpoint to change your own password');
      }

      data.password = await bcrypt.hash(data.password, 10);

      // Clear refresh token when password is changed by admin
      data.refresh_token = null;
    }

    // Track if permissions need to be updated
    let permissionsChanged = false;

    // Handle role change with permission sync
    if (data.role && data.role !== user.role) {
      // Only superuser and admin can change roles
      if (!['superuser', 'admin'].includes(requestingUser.role)) {
        throw new ForbiddenError('Only superuser or admin can change user roles');
      }

      // Prevent escalation to higher roles
      const roleHierarchy = [USER_ROLES.AGENCY_USER, USER_ROLES.AGENCY_ADMIN, 'admin', 'superuser'];
      const requestingRoleIndex = roleHierarchy.indexOf(requestingUser.role);
      const targetRoleIndex = roleHierarchy.indexOf(data.role);

      if (targetRoleIndex > requestingRoleIndex) {
        throw new ForbiddenError('Cannot assign a role higher than your own');
      }

      // Validate agency_id based on new role
      const agencyRoles = [USER_ROLES.AGENCY_ADMIN, USER_ROLES.AGENCY_USER];
      const newAgencyId = data.agency_id !== undefined ? data.agency_id : user.agencyId;

      if (agencyRoles.includes(data.role) && !newAgencyId) {
        throw new ForbiddenError('Agency users must belong to an agency');
      }
      if (!agencyRoles.includes(data.role) && newAgencyId) {
        throw new ForbiddenError('Superuser and admin users cannot belong to an agency');
      }

      // If sync_permissions_on_role_change is true (default), reset permissions
      if (data.sync_permissions_on_role_change !== false) {
        await permissionRepository.removeAllFromUser(id);
        await permissionRepository.assignDefaultPermissions(id, data.role);
        permissionsChanged = true;
      }
    }

    // Handle explicit permissions update (only if role didn't change or sync was disabled)
    if (data.permissions && Array.isArray(data.permissions) && !permissionsChanged) {
      // Only superuser and admin can modify permissions
      if (!['superuser', 'admin'].includes(requestingUser.role)) {
        throw new ForbiddenError('Only superuser or admin can modify user permissions');
      }

      // Validate permissions don't exceed what's allowed for the role
      const targetRole = data.role || user.role;
      const validationResult = this.validatePermissionsForRole(data.permissions, targetRole);
      if (!validationResult.valid) {
        throw new ForbiddenError(validationResult.message);
      }

      // Remove existing permissions and assign new ones
      await permissionRepository.removeAllFromUser(id);
      const permissionIds = [];
      for (const perm of data.permissions) {
        const permission = await permissionRepository.getOrCreate(
          perm.permission_value,
          perm.permission_scope
        );
        permissionIds.push(permission.id);
      }
      await permissionRepository.assignManyToUser(id, permissionIds);
      permissionsChanged = true;
    }

    // Remove non-user fields before update
    const { permissions, sync_permissions_on_role_change, ...userData } = data;

    // Invalidate refresh token if permissions changed (forces re-login)
    if (permissionsChanged) {
      userData.refresh_token = null;
    }

    await userRepository.update(id, userData);

    return userRepository.findByIdWithRelations(id);
  },

  /**
   * Validate that custom permissions don't exceed role defaults
   */
  validatePermissionsForRole(permissions, role) {
    const scopes = ['user', 'agency', 'property', 'task', 'contact', 'email', 'veu_project', 'setting', 'inspection'];
    const allowedValues = {
      'superuser': ['create', 'read', 'update', 'delete'],
      'admin': ['create', 'read', 'update'],
      'agency-admin': ['create', 'read', 'update'],
      'agency-user': ['read'],
    };

    const allowed = allowedValues[role] || ['read'];

    for (const perm of permissions) {
      if (!scopes.includes(perm.permission_scope)) {
        return { valid: false, message: `Invalid permission scope: ${perm.permission_scope}` };
      }
      if (!allowed.includes(perm.permission_value)) {
        return {
          valid: false,
          message: `Permission '${perm.permission_value}' is not allowed for role '${role}'. Allowed: ${allowed.join(', ')}`,
        };
      }
    }

    return { valid: true };
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
