/**
 * Property Service
 *
 * Business logic for Property entity.
 */

const propertyRepository = require('../repositories/propertyRepository');
const userRepository = require('../repositories/userRepository');
const veuProjectRepository = require('../repositories/veuProjectRepository');
const { NotFoundError, ConflictError, ForbiddenError } = require('../lib/errors');
const { USER_ROLES } = require('../config/constants');
const { createPagination } = require('../lib/response');

const propertyService = {
  /**
   * Get property by ID
   */
  async getPropertyById(id, requestingUser) {
    const property = await propertyRepository.findByIdWithRelations(id);
    if (!property) {
      throw new NotFoundError('Property');
    }

    // Check access
    if (!this.canAccessProperty(requestingUser, property)) {
      throw new ForbiddenError('Cannot access this property');
    }

    return this.formatProperty(property);
  },

  /**
   * List properties with filters
   */
  async listProperties(requestingUser, { search, page = 1, limit = 50, user_id, region }) {
    const skip = (page - 1) * limit;
    const scope = this.buildPropertyScope(requestingUser);

    const filters = {
      ...scope,
      skip,
      take: limit,
      search,
    };

    // Allow user_id filter for admin roles
    if (['superuser', 'admin', 'agency-admin'].includes(requestingUser.role) && user_id) {
      filters.userId = user_id;
    }

    // Add region filter
    if (region) {
      filters.region = region;
    }

    const { properties, total } = await propertyRepository.findAll(filters);

    return {
      properties: properties.map(this.formatProperty),
      pagination: createPagination(page, limit, total),
    };
  },

  /**
   * Create a new property
   */
  async createProperty(data, requestingUser) {
    // Determine user_id
    let userId = data.user_id;
    if (!userId) {
      // Default to requesting user
      userId = requestingUser.user_id;
    }

    // Verify access to create property for this user
    if (userId !== requestingUser.user_id) {
      if (!['superuser', 'admin', 'agency-admin'].includes(requestingUser.role)) {
        throw new ForbiddenError('Cannot create property for another user');
      }

      // Agency admin can only create for users in their agency
      if (requestingUser.role === USER_ROLES.AGENCY_ADMIN) {
        const targetUser = await userRepository.findById(userId);
        if (!targetUser || targetUser.agencyId !== requestingUser.agency_id) {
          throw new ForbiddenError('Cannot create property for user in another agency');
        }
      }
    }

    // Check for duplicate address
    const existing = await propertyRepository.findByAddressAndUser(data.address, userId);
    if (existing) {
      throw new ConflictError('Property with this address already exists for this user');
    }

    // Create property
    const property = await propertyRepository.create({
      address: data.address,
      user_id: userId,
      region: data.region || null,
    });

    // Create default VEU projects if agency has VEU activated
    if (property.user?.agency?.veuActivated) {
      await veuProjectRepository.createDefaultForProperty(property.id);
    }

    return propertyRepository.findByIdWithRelations(property.id);
  },

  /**
   * Update a property
   */
  async updateProperty(id, data, requestingUser) {
    const property = await propertyRepository.findByIdWithRelations(id);
    if (!property) {
      throw new NotFoundError('Property');
    }

    // Check access
    if (!this.canModifyProperty(requestingUser, property)) {
      throw new ForbiddenError('Cannot modify this property');
    }

    // If changing user_id, validate the target user
    if (data.user_id !== undefined && data.user_id !== property.userId) {
      // Only admin roles can change property ownership
      if (!['superuser', 'admin', 'agency-admin'].includes(requestingUser.role)) {
        throw new ForbiddenError('Cannot change property owner');
      }

      if (data.user_id !== null) {
        const targetUser = await userRepository.findById(data.user_id);
        if (!targetUser) {
          throw new NotFoundError('Target user');
        }

        // Agency admin can only assign to users in their agency
        if (requestingUser.role === USER_ROLES.AGENCY_ADMIN) {
          if (targetUser.agencyId !== requestingUser.agency_id) {
            throw new ForbiddenError('Cannot assign property to user in another agency');
          }
        }
      }
    }

    // If changing address, check for conflicts
    if (data.address && data.address !== property.address) {
      const userId = data.user_id || property.userId;
      const existing = await propertyRepository.findByAddressAndUser(data.address, userId);
      if (existing && existing.id !== id) {
        throw new ConflictError('Property with this address already exists');
      }
    }

    await propertyRepository.update(id, data);
    return propertyRepository.findByIdWithRelations(id);
  },

  /**
   * Delete a property (soft delete)
   */
  async deleteProperty(id, requestingUser) {
    const property = await propertyRepository.findByIdWithRelations(id);
    if (!property) {
      throw new NotFoundError('Property');
    }

    // Check access
    if (!this.canModifyProperty(requestingUser, property)) {
      throw new ForbiddenError('Cannot delete this property');
    }

    return propertyRepository.softDelete(id);
  },

  /**
   * Build property scope based on user role
   */
  buildPropertyScope(requestingUser) {
    if (['superuser', 'admin'].includes(requestingUser.role)) {
      return { isActive: true };
    }
    if (requestingUser.role === USER_ROLES.AGENCY_ADMIN) {
      return { isActive: true, agencyId: requestingUser.agency_id };
    }
    return { isActive: true, userId: requestingUser.user_id };
  },

  /**
   * Check if user can access property
   */
  canAccessProperty(requestingUser, property) {
    if (['superuser', 'admin'].includes(requestingUser.role)) return true;
    if (requestingUser.role === USER_ROLES.AGENCY_ADMIN) {
      return property.user?.agencyId === requestingUser.agency_id;
    }
    return property.userId === requestingUser.user_id;
  },

  /**
   * Check if user can modify property
   */
  canModifyProperty(requestingUser, property) {
    if (['superuser', 'admin'].includes(requestingUser.role)) return true;
    if (requestingUser.role === USER_ROLES.AGENCY_ADMIN) {
      return property.user?.agencyId === requestingUser.agency_id;
    }
    return property.userId === requestingUser.user_id;
  },

  /**
   * Format property for API response
   */
  formatProperty(property) {
    const formatted = {
      id: property.id,
      address: property.address,
      user_id: property.userId,
      region: property.region,
      is_active: property.isActive,
      created_at: property.createdAt,
      updated_at: property.updatedAt,
    };

    if (property.user) {
      formatted.user = {
        id: property.user.id,
        name: property.user.name,
        email: property.user.email,
      };

      if (property.user.agency) {
        formatted.agency = {
          id: property.user.agency.id,
          agency_name: property.user.agency.agencyName,
        };
      }
    }

    if (property.contacts) {
      formatted.contacts = property.contacts.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
      }));
    }

    if (property._count) {
      formatted.task_count = property._count.tasks;
    }

    if (property.veuProjects) {
      formatted.veu_projects = property.veuProjects.map((v) => ({
        id: v.id,
        type: v.type,
        is_completed: v.isCompleted,
      }));
    }

    return formatted;
  },

  /**
   * Batch update region for multiple properties
   */
  async batchUpdateRegion(propertyIds, region, requestingUser) {
    // Only admin and superuser can batch update
    if (!['superuser', 'admin'].includes(requestingUser.role)) {
      throw new ForbiddenError('Permission denied');
    }

    const result = await propertyRepository.batchUpdateRegion(propertyIds, region);
    return {
      updated_count: result.count,
    };
  },
};

module.exports = propertyService;
