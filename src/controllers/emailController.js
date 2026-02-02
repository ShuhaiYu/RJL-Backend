/**
 * Email Controller
 *
 * HTTP layer for Email endpoints. Delegates business logic to emailService.
 */

const emailService = require('../services/emailService');
const { sendSuccess } = require('../lib/response');

module.exports = {
  /**
   * Process incoming email (legacy - for API submissions)
   * POST /api/emails/process
   */
  processEmail: async (req, res, next) => {
    try {
      const result = await emailService.processEmailWithAI(req.body, req.user);

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
   * Process a stored (unprocessed) email by ID
   * POST /api/emails/:id/process
   *
   * Step 2 of 2-step processing - manual trigger from frontend
   */
  processStoredEmail: async (req, res, next) => {
    try {
      const emailId = parseInt(req.params.id, 10);
      const result = await emailService.processStoredEmailById(emailId);

      if (result.alreadyProcessed) {
        return sendSuccess(res, {
          message: result.message,
          data: result.email,
        });
      }

      sendSuccess(res, {
        statusCode: 200,
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
   * Query params:
   *   - direction: 'inbound' | 'outbound' (optional filter)
   *   - search: search term
   *   - page, limit: pagination
   *   - property_id, agency_id: filters
   */
  listEmails: async (req, res, next) => {
    try {
      const { search, page, limit, property_id, agency_id, direction } = req.query;
      const result = await emailService.listEmails(req.user, {
        search,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 50,
        property_id: property_id ? parseInt(property_id, 10) : undefined,
        agency_id: agency_id ? parseInt(agency_id, 10) : undefined,
        direction: direction || undefined,
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
