/**
 * Winston Logger Configuration
 *
 * Provides structured logging with different levels and formats for development and production.
 */

const winston = require('winston');

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// Custom format for development (human-readable)
const devFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${message}`;
  if (stack) {
    log += `\n${stack}`;
  }
  if (Object.keys(meta).length > 0) {
    log += `\n${JSON.stringify(meta, null, 2)}`;
  }
  return log;
});

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true })
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

module.exports = logger;
