/**
 * Custom Error Classes
 *
 * Provides a hierarchy of error classes for consistent error handling throughout the application.
 */

const { ERROR_CODES } = require('../config/constants');

/**
 * Base application error class
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = ERROR_CODES.INTERNAL_ERROR) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // Distinguishes operational errors from programming errors

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error - for invalid input data
 */
class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = []) {
    super(message, 400, ERROR_CODES.VALIDATION_ERROR);
    this.details = details;
  }
}

/**
 * Not found error - for missing resources
 */
class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, ERROR_CODES.NOT_FOUND);
    this.resource = resource;
  }
}

/**
 * Unauthorized error - for authentication failures
 */
class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, ERROR_CODES.UNAUTHORIZED);
  }
}

/**
 * Forbidden error - for authorization failures
 */
class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, ERROR_CODES.FORBIDDEN);
  }
}

/**
 * Conflict error - for duplicate resources or state conflicts
 */
class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, ERROR_CODES.CONFLICT);
  }
}

/**
 * Database error - for database-related failures
 */
class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', originalError = null) {
    super(message, 500, ERROR_CODES.DATABASE_ERROR);
    this.originalError = originalError;
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  DatabaseError,
};
