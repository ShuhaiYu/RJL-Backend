/**
 * Rate Limiter Middleware
 *
 * Provides rate limiting for authentication endpoints to prevent brute force attacks.
 */

const logger = require('../lib/logger');

// In-memory store for rate limiting (consider using Redis in production for distributed systems)
const rateLimitStore = new Map();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Create a rate limiter middleware
 * @param {Object} options - Configuration options
 * @param {number} options.windowMs - Time window in milliseconds (default: 15 minutes)
 * @param {number} options.max - Maximum number of requests per window (default: 5)
 * @param {string} options.message - Error message to return
 * @param {boolean} options.skipSuccessfulRequests - Don't count successful requests (default: false)
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 5,
    message = 'Too many requests, please try again later',
    skipSuccessfulRequests = false,
  } = options;

  return (req, res, next) => {
    // Use IP address as the key (consider using user ID for authenticated requests)
    const key = `${req.ip}-${req.originalUrl}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);

    // Initialize or reset if window has expired
    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(key, record);
    }

    // Check if limit exceeded
    if (record.count >= max) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);

      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.originalUrl,
        retryAfter,
      });

      return res.status(429).json({
        success: false,
        error: message,
        retryAfter,
      });
    }

    // Increment count (optionally skip successful requests)
    if (!skipSuccessfulRequests) {
      record.count++;
    } else {
      // If skipping successful requests, increment after response
      const originalSend = res.send;
      res.send = function (body) {
        if (res.statusCode >= 400) {
          record.count++;
        }
        return originalSend.call(this, body);
      };
    }

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': max,
      'X-RateLimit-Remaining': Math.max(0, max - record.count),
      'X-RateLimit-Reset': Math.ceil(record.resetTime / 1000),
    });

    next();
  };
}

// Pre-configured rate limiters for common use cases
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many login attempts, please try again in 15 minutes',
  skipSuccessfulRequests: true, // Only count failed attempts
});

const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 reset requests per hour
  message: 'Too many password reset requests, please try again later',
});

const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registration attempts per hour
  message: 'Too many registration attempts, please try again later',
});

module.exports = {
  createRateLimiter,
  authLimiter,
  passwordResetLimiter,
  registerLimiter,
};
