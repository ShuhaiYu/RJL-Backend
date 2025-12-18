/**
 * Email Controller
 *
 * HTTP layer for Email endpoints. Delegates business logic to emailService.
 */

const emailService = require('../services/emailService');
const { sendSuccess } = require('../lib/response');

module.exports = {
  /**
   * Process incoming email
   * POST /api/emails/process
   */
  processEmail: async (req, res, next) => {
    try {
      const result = await emailService.processEmail(req.body, req.user);

      if (result.duplicate) {
        return sendSuccess(res, {
          message: result.message,
          data: { duplicate: true },
        });
      }

      sendSuccess(res, {
        statusCode: 201,
        message: 'Email processed successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get email by ID
   * GET /api/emails/:id
   */
  getEmailDetail: async (req, res, next) => {
    try {
      const email = await emailService.getEmailById(
        parseInt(req.params.id, 10),
        req.user
      );

      sendSuccess(res, {
        data: email,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List emails
   * GET /api/emails
   */
  listEmails: async (req, res, next) => {
    try {
      const { search, page, limit, property_id, agency_id } = req.query;
      const result = await emailService.listEmails(req.user, {
        search,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 50,
        property_id: property_id ? parseInt(property_id, 10) : undefined,
        agency_id: agency_id ? parseInt(agency_id, 10) : undefined,
      });

      sendSuccess(res, {
        data: result.emails,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },
};
