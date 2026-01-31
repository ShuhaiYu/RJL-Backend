/**
 * Global Error Handler Middleware
 *
 * Catches all errors and sends standardized error responses.
 */

const logger = require('../lib/logger');
const { sendError } = require('../lib/response');
const { AppError } = require('../lib/errors');
const { ERROR_CODES } = require('../config/constants');

/**
 * Handle Prisma errors and convert to AppError
 * Reference: https://www.prisma.io/docs/reference/api-reference/error-reference
 */
function handlePrismaError(err) {
  // Prisma known error codes
  switch (err.code) {
    // Query Engine Errors (P2xxx)
    case 'P2000': // Value too long for column
      return {
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Input value too long for the field',
      };
    case 'P2001': // Record not found in WHERE condition
      return {
        statusCode: 404,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Record not found',
      };
    case 'P2002': // Unique constraint violation
      return {
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'A record with this value already exists',
      };
    case 'P2003': // Foreign key constraint violation
      return {
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Related record not found',
      };
    case 'P2004': // Constraint violation
      return {
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Database constraint violation',
      };
    case 'P2005': // Invalid value for field type
      return {
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Invalid value for field type',
      };
    case 'P2006': // Invalid value provided
      return {
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Invalid value provided',
      };
    case 'P2007': // Data validation error
      return {
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Data validation error',
      };
    case 'P2011': // Null constraint violation
      return {
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Required field cannot be null',
      };
    case 'P2012': // Missing required value
      return {
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Missing required value',
      };
    case 'P2014': // Relation violation
      return {
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Invalid relation - change would violate required relation',
      };
    case 'P2015': // Related record not found
      return {
        statusCode: 404,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Related record not found',
      };
    case 'P2025': // Record not found
      return {
        statusCode: 404,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Record not found',
      };

    // Connection Errors (P1xxx)
    case 'P1001': // Database server unreachable
      return {
        statusCode: 503,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Database connection error',
      };
    case 'P1002': // Database server reached but timed out
      return {
        statusCode: 503,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Database connection timed out',
      };
    case 'P1008': // Operations timed out
      return {
        statusCode: 504,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Database operation timed out',
      };
    case 'P1017': // Server has closed the connection
      return {
        statusCode: 503,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Database connection closed',
      };

    default:
      // Check if it's a Prisma error by the code pattern
      if (err.code && typeof err.code === 'string' && err.code.startsWith('P')) {
        logger.warn('Unhandled Prisma error code', { code: err.code, message: err.message });
        return {
          statusCode: 500,
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Database error',
        };
      }
      return null;
  }
}

/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, next) {
  // Log the error
  logger.error({
    message: err.message,
    stack: err.stack,
    code: err.code,
    path: req.path,
    method: req.method,
    userId: req.user?.user_id,
  });

  // Handle operational errors (AppError instances)
  if (err instanceof AppError) {
    return sendError(res, {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
    });
  }

  // Handle Prisma errors
  const prismaError = handlePrismaError(err);
  if (prismaError) {
    return sendError(res, prismaError);
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return sendError(res, {
      statusCode: 401,
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Invalid token',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return sendError(res, {
      statusCode: 401,
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Token expired',
    });
  }

  // Handle validation errors from express-validator or similar
  if (err.name === 'ValidationError' || err.type === 'validation') {
    return sendError(res, {
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: err.message || 'Validation failed',
      details: err.details || err.errors,
    });
  }

  // Default: Internal server error
  // In production, don't expose error details
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  return sendError(res, {
    statusCode: 500,
    code: ERROR_CODES.INTERNAL_ERROR,
    message,
  });
}

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res, next) {
  return sendError(res, {
    statusCode: 404,
    code: ERROR_CODES.NOT_FOUND,
    message: `Route ${req.method} ${req.path} not found`,
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
