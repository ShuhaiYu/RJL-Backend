/**
 * Validation Middleware Factory
 *
 * Creates middleware functions that validate request data using Zod schemas.
 */

const { ValidationError } = require('../lib/errors');

/**
 * Creates a validation middleware for the given Zod schema
 * @param {ZodSchema} schema - Zod schema to validate against
 * @param {string} source - Source of data to validate: 'body', 'params', 'query'
 * @returns {Function} Express middleware function
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const data = source === 'params' ? req.params
        : source === 'query' ? req.query
          : req.body;

      const result = schema.safeParse(data);

      if (!result.success) {
        const details = result.error.issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        throw new ValidationError('Validation failed', details);
      }

      // Replace with parsed/coerced values
      if (source === 'params') {
        req.params = result.data;
      } else if (source === 'query') {
        req.query = result.data;
      } else {
        req.body = result.data;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Validates multiple sources at once
 * @param {Object} schemas - Object with optional body, params, query schemas
 * @returns {Function} Express middleware function
 */
function validateAll(schemas) {
  return (req, res, next) => {
    try {
      const errors = [];

      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          result.error.issues.forEach((err) => {
            errors.push({
              field: `params.${err.path.join('.')}`,
              message: err.message,
            });
          });
        } else {
          req.params = result.data;
        }
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          result.error.issues.forEach((err) => {
            errors.push({
              field: `query.${err.path.join('.')}`,
              message: err.message,
            });
          });
        } else {
          req.query = result.data;
        }
      }

      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          result.error.issues.forEach((err) => {
            errors.push({
              field: `body.${err.path.join('.')}`,
              message: err.message,
            });
          });
        } else {
          req.body = result.data;
        }
      }

      if (errors.length > 0) {
        throw new ValidationError('Validation failed', errors);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  validate,
  validateAll,
};
