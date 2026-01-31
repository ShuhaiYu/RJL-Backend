/**
 * Cron Authentication Middleware
 *
 * Verifies that cron requests are legitimate (from Vercel or authorized sources).
 */

const logger = require('../lib/logger');

/**
 * Verify cron secret from Authorization header or query parameter.
 * Vercel Cron sends the secret in the Authorization header as "Bearer <secret>".
 */
function verifyCronSecret(req, res, next) {
  const cronSecret = process.env.CRON_SECRET;

  // In development, allow bypass if no secret is set
  if (process.env.NODE_ENV === 'development' && !cronSecret) {
    logger.warn('[CRON AUTH] No CRON_SECRET set, allowing request in development');
    return next();
  }

  if (!cronSecret) {
    logger.error('[CRON AUTH] CRON_SECRET environment variable not set');
    return res.status(500).json({
      success: false,
      error: 'Server configuration error',
    });
  }

  // Check Authorization header (Vercel sends "Bearer <secret>")
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const [scheme, token] = authHeader.split(' ');
    if (scheme === 'Bearer' && token === cronSecret) {
      return next();
    }
  }

  // Fallback: check query parameter (for manual testing)
  if (req.query.secret === cronSecret) {
    return next();
  }

  logger.warn('[CRON AUTH] Unauthorized cron request', {
    ip: req.ip,
    path: req.path,
  });

  return res.status(401).json({
    success: false,
    error: 'Unauthorized',
  });
}

module.exports = {
  verifyCronSecret,
};
