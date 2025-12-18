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
 */
function handlePrismaError(err) {
  // Prisma known error codes
  switch (err.code) {
    case 'P2002': // Unique constraint violation
      return {
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'A record with this value already exists',
      };
    case 'P2025': // Record not found
      return {
        statusCode: 404,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Record not found',
      };
    case 'P2003': // Foreign key constraint violation
      return {
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Related record not found',
      };
    default:
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
