/**
 * Cron Authentication Middleware
 *
 * Verifies that cron requests are legitimate (from Vercel or authorized sources).
 * SECURITY: Only accepts Authorization header - query parameters are logged and rejected.
 */

const logger = require('../lib/logger');

/**
 * Verify cron secret from Authorization header ONLY.
 * Vercel Cron sends the secret in the Authorization header as "Bearer <secret>".
 *
 * SECURITY NOTE: We do NOT accept secrets via query parameters because:
 * - Query parameters are logged in access logs, proxies, and CDN logs
 * - They may be cached and stored in browser history
 * - They can leak through Referer headers
 */
function verifyCronSecret(req, res, next) {
  const cronSecret = process.env.CRON_SECRET;

  // SECURITY: Warn if someone attempts to use query parameter (may indicate attack or misconfiguration)
  if (req.query.secret) {
    logger.warn('[CRON AUTH] Rejected attempt to use secret via query parameter', {
      ip: req.ip,
      path: req.path,
      // Do NOT log the actual secret value
    });
    return res.status(401).json({
      success: false,
      error: 'Query parameter authentication not allowed. Use Authorization header.',
    });
  }

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

  // Check Authorization header ONLY (Vercel sends "Bearer <secret>")
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const [scheme, token] = authHeader.split(' ');
    if (scheme === 'Bearer' && token === cronSecret) {
      return next();
    }
  }

  logger.warn('[CRON AUTH] Unauthorized cron request', {
    ip: req.ip,
    path: req.path,
    hasAuthHeader: !!authHeader,
  });

  return res.status(401).json({
    success: false,
    error: 'Unauthorized',
  });
}

module.exports = {
  verifyCronSecret,
};
