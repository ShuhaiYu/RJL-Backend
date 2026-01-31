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
];

// These variables are optional in development but REQUIRED in production for security
const productionRequiredEnvVars = [
  { name: 'RESEND_WEBHOOK_SECRET', description: 'Resend webhook signing secret (required in production)' },
  { name: 'CRON_SECRET', description: 'Secret for Vercel Cron job authentication (required in production)' },
];

/**
 * Validate required environment variables
 * Throws an error if any required variable is missing
 */
function validateEnv() {
  const missing = [];
  const warnings = [];
  const isProduction = process.env.NODE_ENV === 'production';

  // Check required variables
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar.name]) {
      missing.push(`${envVar.name} - ${envVar.description}`);
    }
  }

  // Check production-required variables
  if (isProduction) {
    for (const envVar of productionRequiredEnvVars) {
      if (!process.env[envVar.name]) {
        missing.push(`${envVar.name} - ${envVar.description}`);
      }
    }
  } else {
    // In development, warn about missing production-required variables
    for (const envVar of productionRequiredEnvVars) {
      if (!process.env[envVar.name]) {
        warnings.push(`⚠️  ${envVar.name} not set - this is REQUIRED in production`);
      }
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

  logger.info('Environment validation passed', { environment: isProduction ? 'production' : 'development' });
}

module.exports = { validateEnv, requiredEnvVars, optionalEnvVars, productionRequiredEnvVars };
