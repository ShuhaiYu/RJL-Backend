/**
 * Agency Controller
 *
 * HTTP layer for Agency endpoints. Delegates business logic to agencyService.
 */

const agencyService = require('../services/agencyService');
const { sendSuccess } = require('../lib/response');

module.exports = {
  /**
   * Create a new agency with admin user
   * POST /api/agencies
   */
  createAgency: async (req, res, next) => {
    try {
      const result = await agencyService.createAgency(req.body);

      sendSuccess(res, {
        statusCode: 201,
        message: 'Agency created successfully with admin user',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get agency by ID
   * GET /api/agencies/:id
   */
  getAgencyDetail: async (req, res, next) => {
    try {
      const agency = await agencyService.getAgencyById(
        parseInt(req.params.id, 10),
        req.user
      );

      sendSuccess(res, {
        data: agency,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update an agency
   * PUT /api/agencies/:id
   */
  updateAgency: async (req, res, next) => {
    try {
      const agency = await agencyService.updateAgency(
        parseInt(req.params.id, 10),
        req.body,
        req.user
      );

      sendSuccess(res, {
        message: 'Agency updated successfully',
        data: agencyService.formatAgency(agency),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List agencies with statistics
   * GET /api/agencies
   */
  listAgencies: async (req, res, next) => {
    try {
      const { search, page, limit } = req.query;
      const result = await agencyService.listAgencies(req.user, {
        search,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 50,
      });

      sendSuccess(res, {
        data: result.agencies,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete an agency (soft delete)
   * DELETE /api/agencies/:id
   */
  deleteAgency: async (req, res, next) => {
    try {
      await agencyService.deleteAgency(parseInt(req.params.id, 10), req.user);

      sendSuccess(res, {
        message: 'Agency deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Activate VEU for an agency
   * POST /api/agencies/:id/activate-veu
   */
  activateVeu: async (req, res, next) => {
    try {
      await agencyService.activateVeu(parseInt(req.params.id, 10), req.user);

      sendSuccess(res, {
        message: 'VEU activated successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get agency whitelist
   * GET /api/agencies/:id/whitelist
   */
  getWhitelist: async (req, res, next) => {
    try {
      const whitelist = await agencyService.getWhitelist(
        parseInt(req.params.id, 10),
        req.user
      );

      sendSuccess(res, {
        data: whitelist.map((w) => ({
          id: w.id,
          email_address: w.emailAddress,
          created_at: w.createdAt,
        })),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Add email to whitelist
   * POST /api/agencies/:id/whitelist
   */
  addToWhitelist: async (req, res, next) => {
    try {
      const entry = await agencyService.addToWhitelist(
        parseInt(req.params.id, 10),
        req.body.email_address,
        req.user
      );

      sendSuccess(res, {
        statusCode: 201,
        message: 'Email added to whitelist',
        data: {
          id: entry.id,
          email_address: entry.emailAddress,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Remove email from whitelist
   * DELETE /api/agencies/:agency_id/whitelist/:whitelist_id
   */
  removeFromWhitelist: async (req, res, next) => {
    try {
      await agencyService.removeFromWhitelist(
        parseInt(req.params.whitelist_id, 10),
        req.user
      );

      sendSuccess(res, {
        message: 'Email removed from whitelist',
      });
    } catch (error) {
      next(error);
    }
  },
};
