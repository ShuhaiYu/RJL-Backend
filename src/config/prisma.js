/**
 * Prisma Client Singleton
 *
 * This file exports a single instance of the Prisma Client to be used throughout the application.
 * Using a singleton pattern prevents creating multiple database connections.
 * Includes connection retry logic for transient failures.
 */

const { PrismaClient } = require('@prisma/client');
const logger = require('../lib/logger');

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Create Prisma client with logging configuration based on environment
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? [
        { level: 'query', emit: 'event' },
        { level: 'info', emit: 'event' },
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ]
    : [{ level: 'error', emit: 'event' }],
});

// Log Prisma events in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug('[Prisma Query]', {
      query: e.query,
      params: e.params,
      duration: `${e.duration}ms`,
    });
  });
}

prisma.$on('error', (e) => {
  logger.error('[Prisma Error]', { message: e.message });
});

/**
 * Connect to database with retry logic
 * @param {number} retries - Number of retries remaining
 * @returns {Promise<void>}
 */
async function connectWithRetry(retries = MAX_RETRIES) {
  try {
    await prisma.$connect();
    logger.info('[Prisma] Database connected successfully');
  } catch (error) {
    if (retries > 0) {
      logger.warn(`[Prisma] Connection failed, retrying in ${RETRY_DELAY_MS}ms...`, {
        retriesLeft: retries - 1,
        error: error.message,
      });
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return connectWithRetry(retries - 1);
    }
    logger.error('[Prisma] Failed to connect after all retries', {
      error: error.message,
    });
    throw error;
  }
}

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// Export both the client and the connection function
module.exports = prisma;
module.exports.connectWithRetry = connectWithRetry;
