/**
 * VEU Project Service
 *
 * Business logic for VEU Project entity.
 */

const veuProjectRepository = require('../repositories/veuProjectRepository');
const propertyRepository = require('../repositories/propertyRepository');
const { NotFoundError, ForbiddenError, ConflictError } = require('../lib/errors');
const { USER_ROLES } = require('../config/constants');
const { createPagination } = require('../lib/response');

const veuProjectService = {
  /**
   * Get VEU project by ID
   */
  async getVeuProjectById(id, requestingUser) {
    const project = await veuProjectRepository.findByIdWithRelations(id);
    if (!project) {
      throw new NotFoundError('VEU Project');
    }

    // Check access
    if (!this.canAccessVeuProject(requestingUser, project)) {
      throw new ForbiddenError('Cannot access this VEU project');
    }

    return this.formatVeuProject(project);
  },

  /**
   * List VEU projects with filters
   */
  async listVeuProjects(requestingUser, { search, page = 1, limit = 50, property_id, type, is_completed }) {
    const skip = (page - 1) * limit;

    const filters = {
      skip,
      take: limit,
      search,
      propertyId: property_id,
      type,
      isCompleted: is_completed,
    };

    const { projects, total } = await veuProjectRepository.findAll(filters);

    // Filter by access
    const accessibleProjects = projects.filter((project) =>
      this.canAccessVeuProject(requestingUser, project)
    );

    return {
      projects: accessibleProjects.map(this.formatVeuProject),
      pagination: createPagination(page, limit, total),
    };
  },

  /**
   * Get VEU overview tree
   */
  async getVeuOverviewTree(requestingUser) {
    const rows = await veuProjectRepository.getVeuOverviewTree(requestingUser);

    // Build tree structure
    const agencyMap = new Map();

    for (const row of rows) {
      const agencyId = Number(row.agency_id);

      if (!agencyMap.has(agencyId)) {
        agencyMap.set(agencyId, {
          agency_id: agencyId,
          agency_name: row.agency_name,
          total_properties: Number(row.total_properties),
          water_heater_completed: Number(row.water_heater_completed),
          air_conditioner_completed: Number(row.air_conditioner_completed),
          properties: new Map(),
        });
      }

      const agency = agencyMap.get(agencyId);
      const propertyId = Number(row.property_id);

      if (!agency.properties.has(propertyId)) {
        agency.properties.set(propertyId, {
          property_id: propertyId,
          address: row.address,
          veu_projects: [],
        });
      }

      if (row.veu_id) {
        agency.properties.get(propertyId).veu_projects.push({
          id: Number(row.veu_id),
          type: row.type,
          is_completed: row.is_completed,
          price: row.price,
          completed_by: row.completed_by,
          note: row.note,
        });
      }
    }

    // Convert to array structure
    return Array.from(agencyMap.values()).map((agency) => ({
      ...agency,
      properties: Array.from(agency.properties.values()),
    }));
  },

  /**
   * Get VEU projects by property ID
   */
  async getVeuProjectsByPropertyId(propertyId, requestingUser) {
    const property = await propertyRepository.findByIdWithRelations(propertyId);
    if (!property) {
      throw new NotFoundError('Property');
    }

    if (!this.canAccessProperty(requestingUser, property)) {
      throw new ForbiddenError('Cannot access this property');
    }

    const projects = await veuProjectRepository.findByPropertyId(propertyId);
    return projects.map(this.formatVeuProject);
  },

  /**
   * Create a new VEU project
   */
  async createVeuProject(data, requestingUser) {
    // Verify property access
    const property = await propertyRepository.findByIdWithRelations(data.property_id);
    if (!property) {
      throw new NotFoundError('Property');
    }

    if (!this.canAccessProperty(requestingUser, property)) {
      throw new ForbiddenError('Cannot create VEU project for this property');
    }

    // Check if VEU project with same type already exists
    const existing = await veuProjectRepository.findByPropertyIdAndType(data.property_id, data.type);
    if (existing) {
      throw new ConflictError('VEU project with this type already exists for this property');
    }

    const project = await veuProjectRepository.create(data);
    return veuProjectRepository.findByIdWithRelations(project.id);
  },

  /**
   * Update a VEU project
   */
  async updateVeuProject(id, data, requestingUser) {
    const project = await veuProjectRepository.findByIdWithRelations(id);
    if (!project) {
      throw new NotFoundError('VEU Project');
    }

    // Check access
    if (!this.canAccessVeuProject(requestingUser, project)) {
      throw new ForbiddenError('Cannot modify this VEU project');
    }

    await veuProjectRepository.update(id, data);
    return veuProjectRepository.findByIdWithRelations(id);
  },

  /**
   * Delete a VEU project
   */
  async deleteVeuProject(id, requestingUser) {
    const project = await veuProjectRepository.findByIdWithRelations(id);
    if (!project) {
      throw new NotFoundError('VEU Project');
    }

    // Check access
    if (!this.canAccessVeuProject(requestingUser, project)) {
      throw new ForbiddenError('Cannot delete this VEU project');
    }

    return veuProjectRepository.delete(id);
  },

  /**
   * Check if user can access VEU project
   */
  canAccessVeuProject(requestingUser, project) {
    if (['superuser', 'admin'].includes(requestingUser.role)) return true;

    const agencyId = project.property?.user?.agencyId;
    if (requestingUser.role === USER_ROLES.AGENCY_ADMIN) {
      return agencyId === requestingUser.agency_id;
    }
    return project.property?.userId === requestingUser.user_id;
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
   * Format VEU project for API response
   */
  formatVeuProject(project) {
    const formatted = {
      id: project.id,
      property_id: project.propertyId,
      type: project.type,
      is_completed: project.isCompleted,
      price: project.price,
      completed_by: project.completedBy,
      note: project.note,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
    };

    if (project.property) {
      formatted.property = {
        id: project.property.id,
        address: project.property.address,
      };

      if (project.property.user) {
        formatted.user = {
          id: project.property.user.id,
          name: project.property.user.name,
        };

        if (project.property.user.agency) {
          formatted.agency = {
            id: project.property.user.agency.id,
            agency_name: project.property.user.agency.agencyName,
          };
        }
      }
    }

    if (project.files) {
      formatted.files = project.files.map((f) => ({
        id: f.id,
        file_name: f.fileName,
        file_s3_key: f.fileS3Key,
        file_desc: f.fileDesc,
        created_at: f.createdAt,
      }));
    }

    return formatted;
  },
};

module.exports = veuProjectService;
