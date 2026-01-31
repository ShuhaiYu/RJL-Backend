/**
 * Winston Logger Configuration
 *
 * Provides structured logging with different levels and formats for development and production.
 * Includes correlation ID support for request tracing.
 */

const winston = require('winston');
const crypto = require('crypto');

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// AsyncLocalStorage for correlation ID (Node.js 12.17+)
const { AsyncLocalStorage } = require('async_hooks');
const correlationStorage = new AsyncLocalStorage();

/**
 * Generate a correlation ID
 * @returns {string} UUID-like correlation ID
 */
function generateCorrelationId() {
  return crypto.randomUUID();
}

/**
 * Get current correlation ID from async context
 * @returns {string|undefined}
 */
function getCorrelationId() {
  return correlationStorage.getStore()?.correlationId;
}

/**
 * Run a function with a correlation ID context
 * @param {string} correlationId - The correlation ID to use
 * @param {Function} fn - Function to run in context
 * @returns {*} Result of fn
 */
function runWithCorrelationId(correlationId, fn) {
  return correlationStorage.run({ correlationId }, fn);
}

// Custom format for development (human-readable)
const devFormat = printf(({ level, message, timestamp, stack, correlationId, ...meta }) => {
  const corrId = correlationId || getCorrelationId();
  let log = `${timestamp} [${level}]${corrId ? ` [${corrId.slice(0, 8)}]` : ''}: ${message}`;
  if (stack) {
    log += `\n${stack}`;
  }
  if (Object.keys(meta).length > 0) {
    log += `\n${JSON.stringify(meta, null, 2)}`;
  }
  return log;
});

// Custom format to inject correlation ID
const addCorrelationId = winston.format((info) => {
  const correlationId = getCorrelationId();
  if (correlationId) {
    info.correlationId = correlationId;
  }
  return info;
});

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    addCorrelationId()
  ),
  defaultMeta: { service: 'rjl-backend' },
  transports: [],
});

// Add console transport with appropriate format based on environment
if (process.env.NODE_ENV === 'production') {
  // Production: JSON format for log aggregation tools
  logger.add(new winston.transports.Console({
    format: combine(
      timestamp(),
      json()
    )
  }));
} else {
  // Development: Colorized, human-readable format
  logger.add(new winston.transports.Console({
    format: combine(
      colorize({ all: true }),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      devFormat
    )
  }));
}

// Helper methods for common logging scenarios
logger.request = (req, message = 'Incoming request') => {
  logger.info(message, {
    method: req.method,
    path: req.path,
    query: req.query,
    userId: req.user?.user_id,
  });
};

logger.response = (req, res, message = 'Response sent') => {
  logger.info(message, {
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    userId: req.user?.user_id,
  });
};

logger.dbQuery = (operation, model, duration) => {
  logger.debug('Database query', {
    operation,
    model,
    duration: `${duration}ms`,
  });
};

/**
 * Express middleware to add correlation ID to requests
 * Extracts from X-Correlation-ID header or generates a new one
 */
function correlationIdMiddleware(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || generateCorrelationId();

  // Set on response header for tracing
  res.setHeader('X-Correlation-ID', correlationId);

  // Store on request for easy access
  req.correlationId = correlationId;

  // Run the rest of the request in correlation context
  runWithCorrelationId(correlationId, () => {
    next();
  });
}

module.exports = logger;
module.exports.correlationIdMiddleware = correlationIdMiddleware;
module.exports.getCorrelationId = getCorrelationId;
module.exports.generateCorrelationId = generateCorrelationId;
module.exports.runWithCorrelationId = runWithCorrelationId;
