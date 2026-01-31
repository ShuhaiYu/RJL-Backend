/**
 * Environment Variable Validation
 *
 * Validates that all required environment variables are set at startup.
 */

const logger = require('../lib/logger');

const requiredEnvVars = [
  { name: 'DATABASE_URL', description: 'PostgreSQL connection string' },
  { name: 'JWT_ACCESS_SECRET', description: 'JWT access token signing secret' },
  { name: 'JWT_REFRESH_SECRET', description: 'JWT refresh token signing secret' },
  { name: 'CORS_ORIGIN', description: 'Allowed CORS origins (comma-separated)' },
  { name: 'RESEND_API_KEY', description: 'Resend API key for fetching email content' },
];

const optionalEnvVars = [
  { name: 'PORT', default: '3000', description: 'Server port' },
  { name: 'NODE_ENV', default: 'development', description: 'Node environment' },
  { name: 'JWT_ACCESS_EXPIRES', default: '24h', description: 'Access token expiration' },
  { name: 'JWT_REFRESH_EXPIRES', default: '7d', description: 'Refresh token expiration' },
  { name: 'FRONTEND_URL', default: 'http://localhost:5173', description: 'Frontend URL' },
  { name: 'GEMINI_API_KEY', default: '', description: 'Google Gemini API key for AI email extraction' },
  { name: 'RESEND_WEBHOOK_SECRET', default: '', description: 'Resend webhook signing secret for verification' },
];

/**
 * Validate required environment variables
 * Throws an error if any required variable is missing
 */
function validateEnv() {
  const missing = [];
  const warnings = [];

  // Check required variables
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar.name]) {
      missing.push(`${envVar.name} - ${envVar.description}`);
    }
  }

  // Log warnings for optional variables using defaults
  for (const envVar of optionalEnvVars) {
    if (!process.env[envVar.name]) {
      warnings.push(`${envVar.name} not set, using default: ${envVar.default}`);
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    warnings.forEach((warning) => logger.warn(warning));
  }

  // Throw error if required variables are missing
  if (missing.length > 0) {
    const errorMessage = `Missing required environment variables:\n${missing.map((m) => `  - ${m}`).join('\n')}`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  logger.info('Environment validation passed');
}

module.exports = { validateEnv, requiredEnvVars, optionalEnvVars };
