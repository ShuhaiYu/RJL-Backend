/**
 * Data Import Controller
 *
 * HTTP layer for CSV data import endpoint.
 */

const dataImportService = require('../services/dataImportService');
const { sendSuccess, sendError } = require('../lib/response');
const logger = require('../lib/logger');

module.exports = {
  /**
   * Import CSV data
   * POST /api/data-import
   */
  importCsv: async (req, res, next) => {
    try {
      // Check if file was uploaded
      if (!req.file) {
        return sendError(res, {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'No CSV file uploaded',
        });
      }

      logger.info('Starting CSV import', {
        filename: req.file.originalname,
        size: req.file.size,
        userId: req.user.user_id,
      });

      // Process the CSV file
      const results = await dataImportService.importCsv(req.file.buffer, req.user);

      // Return results
      sendSuccess(res, {
        statusCode: 200,
        message: `Import completed: ${results.created} job orders created`,
        data: {
          created: results.created,
          skipped: results.skipped,
          errors: results.errors,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
