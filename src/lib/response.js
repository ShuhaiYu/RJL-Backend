/**
 * Response Helpers
 *
 * Standardized response formatting for consistent API responses.
 */

/**
 * Send a successful response
 * @param {Response} res - Express response object
 * @param {Object} options - Response options
 * @param {number} options.statusCode - HTTP status code (default: 200)
 * @param {string} options.message - Success message
 * @param {*} options.data - Response data
 * @param {Object} options.pagination - Pagination info
 */
function sendSuccess(res, { statusCode = 200, message, data, pagination } = {}) {
  const response = {
    success: true,
  };

  if (message) {
    response.message = message;
  }

  if (data !== undefined) {
    response.data = data;
  }

  if (pagination) {
    response.pagination = pagination;
  }

  return res.status(statusCode).json(response);
}

/**
 * Send an error response
 * @param {Response} res - Express response object
 * @param {Object} options - Response options
 * @param {number} options.statusCode - HTTP status code (default: 500)
 * @param {string} options.code - Error code
 * @param {string} options.message - Error message
 * @param {Array} options.details - Error details (for validation errors)
 */
function sendError(res, { statusCode = 500, code = 'INTERNAL_ERROR', message = 'An error occurred', details } = {}) {
  const response = {
    success: false,
    error: {
      code,
      message,
    },
  };

  if (details && details.length > 0) {
    response.error.details = details;
  }

  return res.status(statusCode).json(response);
}

/**
 * Create a pagination object
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total items count
 * @returns {Object} Pagination object
 */
function createPagination(page, limit, total) {
  return {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    total: parseInt(total, 10),
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Parse pagination params from query
 * @param {Object} query - Express request query object
 * @param {number} defaultLimit - Default limit (default: 50)
 * @param {number} maxLimit - Maximum limit (default: 100)
 * @returns {Object} Parsed pagination params
 */
function parsePaginationParams(query, defaultLimit = 50, maxLimit = 100) {
  let page = parseInt(query.page, 10) || 1;
  let limit = parseInt(query.limit, 10) || defaultLimit;

  if (page < 1) page = 1;
  if (limit < 1) limit = 1;
  if (limit > maxLimit) limit = maxLimit;

  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

module.exports = {
  sendSuccess,
  sendError,
  createPagination,
  parsePaginationParams,
};
