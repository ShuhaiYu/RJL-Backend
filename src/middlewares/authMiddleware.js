/**
 * Authentication Middleware
 *
 * JWT token verification and permission checking.
 */

const jwt = require('jsonwebtoken');
const logger = require('../lib/logger');
const { sendError } = require('../lib/response');
const { ERROR_CODES } = require('../config/constants');

const SECRET_KEY = process.env.JWT_ACCESS_SECRET;

module.exports = {
  /**
   * Basic authentication middleware: verify token and store payload in req.user
   */
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return sendError(res, {
        statusCode: 401,
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'No token provided',
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return sendError(res, {
        statusCode: 401,
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Invalid authorization header format',
      });
    }

    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      // decoded contains: { user_id, role, agency_id, permissions, iat, exp }
      req.user = decoded;
      next();
    } catch (err) {
      logger.warn('Invalid token', { error: err.message });
      return sendError(res, {
        statusCode: 401,
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Invalid or expired token',
      });
    }
  },

  /**
   * Permission check middleware
   * @param {string} requiredValue - Required operation permission (create, read, update, delete)
   * @param {string} requiredScope - Permission scope (user, agency, property, task, etc.)
   */
  requirePermission: (requiredValue, requiredScope) => {
    return (req, res, next) => {
      if (!req.user) {
        return sendError(res, {
          statusCode: 403,
          code: ERROR_CODES.FORBIDDEN,
          message: 'Unauthorized - no user context',
        });
      }

      const permissions = req.user.permissions;

      // Check if permissions structure is valid
      if (!permissions || typeof permissions !== 'object') {
        logger.warn('Invalid permissions format in token', { userId: req.user.user_id });
        return sendError(res, {
          statusCode: 403,
          code: ERROR_CODES.FORBIDDEN,
          message: 'Invalid permissions format in token',
        });
      }

      // Get permissions for the required scope
      const scopePermissions = permissions[requiredScope];
      if (!Array.isArray(scopePermissions)) {
        return sendError(res, {
          statusCode: 403,
          code: ERROR_CODES.FORBIDDEN,
          message: `No permissions for scope: ${requiredScope}`,
        });
      }

      // Check if user has the required permission
      if (!scopePermissions.includes(requiredValue)) {
        logger.warn('Permission denied', {
          userId: req.user.user_id,
          required: `${requiredScope}.${requiredValue}`,
        });
        return sendError(res, {
          statusCode: 403,
          code: ERROR_CODES.FORBIDDEN,
          message: `Missing permission: ${requiredScope}.${requiredValue}`,
        });
      }

      next();
    };
  },
};
