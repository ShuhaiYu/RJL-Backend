/**
 * VEU Project Controller
 *
 * HTTP layer for VEU Project endpoints. Delegates business logic to veuProjectService.
 */

const veuProjectService = require('../services/veuProjectService');
const { sendSuccess } = require('../lib/response');

module.exports = {
  /**
   * Create a new VEU project
   * POST /api/veu-projects
   */
  createVeuProject: async (req, res, next) => {
    try {
      const project = await veuProjectService.createVeuProject(req.body, req.user);

      sendSuccess(res, {
        statusCode: 201,
        message: 'VEU project created successfully',
        data: veuProjectService.formatVeuProject(project),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get VEU project by ID
   * GET /api/veu-projects/:id
   */
  getVeuProjectDetail: async (req, res, next) => {
    try {
      const project = await veuProjectService.getVeuProjectById(
        parseInt(req.params.id, 10),
        req.user
      );

      sendSuccess(res, {
        data: project,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update a VEU project
   * PUT /api/veu-projects/:id
   */
  updateVeuProject: async (req, res, next) => {
    try {
      const project = await veuProjectService.updateVeuProject(
        parseInt(req.params.id, 10),
        req.body,
        req.user
      );

      sendSuccess(res, {
        message: 'VEU project updated successfully',
        data: veuProjectService.formatVeuProject(project),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List VEU projects
   * GET /api/veu-projects
   */
  listVeuProjects: async (req, res, next) => {
    try {
      const { search, page, limit, property_id, type, is_completed } = req.query;
      const result = await veuProjectService.listVeuProjects(req.user, {
        search,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 50,
        property_id: property_id ? parseInt(property_id, 10) : undefined,
        type,
        is_completed: is_completed !== undefined ? is_completed === 'true' : undefined,
      });

      sendSuccess(res, {
        data: result.projects,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get VEU overview tree
   * GET /api/veu-projects/overview
   */
  getVeuOverviewTree: async (req, res, next) => {
    try {
      const tree = await veuProjectService.getVeuOverviewTree(req.user);

      sendSuccess(res, {
        data: tree,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get VEU projects by property ID
   * GET /api/properties/:property_id/veu-projects
   */
  getVeuProjectsByProperty: async (req, res, next) => {
    try {
      const projects = await veuProjectService.getVeuProjectsByPropertyId(
        parseInt(req.params.property_id, 10),
        req.user
      );

      sendSuccess(res, {
        data: projects,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete a VEU project
   * DELETE /api/veu-projects/:id
   */
  deleteVeuProject: async (req, res, next) => {
    try {
      await veuProjectService.deleteVeuProject(parseInt(req.params.id, 10), req.user);

      sendSuccess(res, {
        message: 'VEU project deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },
};
