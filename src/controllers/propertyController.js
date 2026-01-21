/**
 * Property Controller
 *
 * HTTP layer for Property endpoints. Delegates business logic to propertyService.
 */

const propertyService = require('../services/propertyService');
const { sendSuccess } = require('../lib/response');

module.exports = {
  /**
   * Create a new property
   * POST /api/properties
   */
  createProperty: async (req, res, next) => {
    try {
      const property = await propertyService.createProperty(req.body, req.user);

      sendSuccess(res, {
        statusCode: 201,
        message: 'Property created successfully',
        data: propertyService.formatProperty(property),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get property by ID
   * GET /api/properties/:id
   */
  getPropertyDetail: async (req, res, next) => {
    try {
      const property = await propertyService.getPropertyById(
        parseInt(req.params.id, 10),
        req.user
      );

      sendSuccess(res, {
        data: property,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update a property
   * PUT /api/properties/:id
   */
  updateProperty: async (req, res, next) => {
    try {
      const property = await propertyService.updateProperty(
        parseInt(req.params.id, 10),
        req.body,
        req.user
      );

      sendSuccess(res, {
        message: 'Property updated successfully',
        data: propertyService.formatProperty(property),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List properties
   * GET /api/properties
   */
  listProperties: async (req, res, next) => {
    try {
      const { search, page, limit, user_id } = req.query;
      const result = await propertyService.listProperties(req.user, {
        search,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 50,
        user_id: user_id ? parseInt(user_id, 10) : undefined,
      });

      sendSuccess(res, {
        data: result.properties,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete a property (soft delete)
   * DELETE /api/properties/:id
   */
  deleteProperty: async (req, res, next) => {
    try {
      await propertyService.deleteProperty(parseInt(req.params.id, 10), req.user);

      sendSuccess(res, {
        message: 'Property deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Batch update region for multiple properties
   * PUT /api/properties/batch-update-region
   */
  batchUpdateRegion: async (req, res, next) => {
    try {
      const { property_ids, region } = req.body;
      const result = await propertyService.batchUpdateRegion(property_ids, region, req.user);

      sendSuccess(res, {
        message: 'Properties updated successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};
