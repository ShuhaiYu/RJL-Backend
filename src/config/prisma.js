/**
 * Prisma Client Singleton
 *
 * This file exports a single instance of the Prisma Client to be used throughout the application.
 * Using a singleton pattern prevents creating multiple database connections.
 */

const { PrismaClient } = require('@prisma/client');

// Create Prisma client with logging configuration based on environment
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'info', 'warn', 'error']
    : ['error'],
});

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = prisma;
