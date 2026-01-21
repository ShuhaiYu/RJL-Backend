/**
 * Agency Service
 *
 * Business logic for Agency entity.
 */

const bcrypt = require('bcrypt');
const agencyRepository = require('../repositories/agencyRepository');
const userRepository = require('../repositories/userRepository');
const permissionRepository = require('../repositories/permissionRepository');
const agencyWhitelistRepository = require('../repositories/agencyWhitelistRepository');
const { NotFoundError, ConflictError, ForbiddenError } = require('../lib/errors');
const { USER_ROLES } = require('../config/constants');
const { createPagination } = require('../lib/response');

const agencyService = {
  /**
   * Get agency by ID
   */
  async getAgencyById(id, requestingUser) {
    const agency = await agencyRepository.findByIdWithRelations(id);
    if (!agency) {
      throw new NotFoundError('Agency');
    }

    // Check access
    if (!this.canAccessAgency(requestingUser, agency)) {
      throw new ForbiddenError('Cannot access this agency');
    }

    return this.formatAgency(agency);
  },

  /**
   * List agencies with statistics
   */
  async listAgencies(requestingUser, { search, page = 1, limit = 50 }) {
    // Only superuser/admin can list all agencies
    if (!['superuser', 'admin'].includes(requestingUser.role)) {
      // Other roles can only see their own agency
      const agency = await agencyRepository.findByIdWithRelations(requestingUser.agency_id);
      return {
        agencies: agency ? [this.formatAgency(agency)] : [],
        pagination: createPagination(1, 1, agency ? 1 : 0),
      };
    }

    // Use the complex stats query
    const stats = await agencyRepository.listAgenciesWithStats(search);

    // Apply pagination manually
    const skip = (page - 1) * limit;
    const paginatedStats = stats.slice(skip, skip + limit);

    return {
      agencies: paginatedStats.map((a) => ({
        id: Number(a.agency_id),
        agency_name: a.agency_name,
        address: a.address,
        phone: a.phone,
        logo: a.logo,
        is_active: a.is_active,
        veu_activated: a.veu_activated,
        created_at: a.created_at,
        updated_at: a.updated_at,
        total_users: Number(a.total_users),
        task_stats: {
          unknown: Number(a.unknown_count),
          incomplete: Number(a.incomplete_count),
          processing: Number(a.processing_count),
          due_soon: Number(a.due_soon_count),
          expired: Number(a.expired_count),
          completed: Number(a.completed_count),
        },
      })),
      pagination: createPagination(page, limit, stats.length),
    };
  },

  /**
   * Create a new agency with admin user
   */
  async createAgency(data) {
    // Check if admin email already exists BEFORE creating agency
    const existingUser = await userRepository.findByEmail(data.admin_email);
    if (existingUser) {
      throw new ConflictError('Admin email is already registered');
    }

    // Create agency
    const agency = await agencyRepository.create({
      agency_name: data.agency_name,
      address: data.address,
      phone: data.phone,
      logo: data.logo,
    });

    // Create admin user
    const hashedPassword = await bcrypt.hash(data.admin_password, 10);
    const adminUser = await userRepository.create({
      email: data.admin_email,
      name: data.admin_name,
      password: hashedPassword,
      role: USER_ROLES.AGENCY_ADMIN,
      agency_id: agency.id,
    });

    // Assign default permissions
    await permissionRepository.assignDefaultPermissions(adminUser.id, USER_ROLES.AGENCY_ADMIN);

    // Add admin email to whitelist
    await agencyWhitelistRepository.create({
      agency_id: agency.id,
      email_address: data.admin_email,
    });

    return {
      agency: this.formatAgency(agency),
      adminUser: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role,
      },
    };
  },

  /**
   * Update an agency
   */
  async updateAgency(id, data, requestingUser) {
    const agency = await agencyRepository.findById(id);
    if (!agency) {
      throw new NotFoundError('Agency');
    }

    // Check access
    if (!this.canModifyAgency(requestingUser, agency)) {
      throw new ForbiddenError('Cannot modify this agency');
    }

    await agencyRepository.update(id, data);
    return agencyRepository.findByIdWithRelations(id);
  },

  /**
   * Delete an agency (soft delete)
   * Also deactivates all users belonging to this agency
   */
  async deleteAgency(id, requestingUser) {
    const agency = await agencyRepository.findById(id);
    if (!agency) {
      throw new NotFoundError('Agency');
    }

    // Only superuser can delete agencies
    if (requestingUser.role !== 'superuser') {
      throw new ForbiddenError('Only superuser can delete agencies');
    }

    // Deactivate all users in this agency and clear their tokens
    await userRepository.deactivateByAgencyId(id);

    return agencyRepository.softDelete(id);
  },

  /**
   * Activate VEU for an agency
   */
  async activateVeu(id, requestingUser) {
    const agency = await agencyRepository.findById(id);
    if (!agency) {
      throw new NotFoundError('Agency');
    }

    // Check access
    if (!['superuser', 'admin'].includes(requestingUser.role)) {
      throw new ForbiddenError('Only superuser or admin can activate VEU');
    }

    return agencyRepository.activateVeu(id);
  },

  /**
   * Get agency whitelist
   */
  async getWhitelist(agencyId, requestingUser) {
    const agency = await agencyRepository.findById(agencyId);
    if (!agency) {
      throw new NotFoundError('Agency');
    }

    if (!this.canAccessAgency(requestingUser, agency)) {
      throw new ForbiddenError('Cannot access this agency');
    }

    return agencyWhitelistRepository.findByAgencyId(agencyId);
  },

  /**
   * Add email to agency whitelist
   */
  async addToWhitelist(agencyId, emailAddress, requestingUser) {
    const agency = await agencyRepository.findById(agencyId);
    if (!agency) {
      throw new NotFoundError('Agency');
    }

    if (!this.canModifyAgency(requestingUser, agency)) {
      throw new ForbiddenError('Cannot modify this agency');
    }

    // Check if already whitelisted
    const existing = await agencyWhitelistRepository.findByEmailAndAgency(emailAddress, agencyId);
    if (existing) {
      throw new ConflictError('Email already in whitelist');
    }

    return agencyWhitelistRepository.create({
      agency_id: agencyId,
      email_address: emailAddress,
    });
  },

  /**
   * Remove email from agency whitelist
   */
  async removeFromWhitelist(whitelistId, requestingUser) {
    const entry = await agencyWhitelistRepository.findById(whitelistId);
    if (!entry) {
      throw new NotFoundError('Whitelist entry');
    }

    if (!this.canModifyAgency(requestingUser, entry.agency)) {
      throw new ForbiddenError('Cannot modify this agency');
    }

    return agencyWhitelistRepository.delete(whitelistId);
  },

  /**
   * Check if user can access agency
   */
  canAccessAgency(requestingUser, agency) {
    if (['superuser', 'admin'].includes(requestingUser.role)) return true;
    return requestingUser.agency_id === agency.id;
  },

  /**
   * Check if user can modify agency
   */
  canModifyAgency(requestingUser, agency) {
    if (['superuser', 'admin'].includes(requestingUser.role)) return true;
    if (requestingUser.role === USER_ROLES.AGENCY_ADMIN) {
      return requestingUser.agency_id === agency.id;
    }
    return false;
  },

  /**
   * Format agency for API response
   */
  formatAgency(agency) {
    return {
      id: agency.id,
      agency_name: agency.agencyName,
      address: agency.address,
      phone: agency.phone,
      logo: agency.logo,
      is_active: agency.isActive,
      veu_activated: agency.veuActivated,
      created_at: agency.createdAt,
      updated_at: agency.updatedAt,
      users: agency.users?.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
      })),
      whitelist: agency.whitelist?.map((w) => ({
        id: w.id,
        email_address: w.emailAddress,
      })),
    };
  },
};

module.exports = agencyService;
