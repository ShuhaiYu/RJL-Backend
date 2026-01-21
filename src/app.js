/**
 * RJL Backend Application Entry Point
 *
 * Refactored version using Prisma ORM, service layer, and structured logging.
 */

require('dotenv').config();

// Validate environment variables before initializing the app
const { validateEnv } = require('./config/validateEnv');
validateEnv();

const express = require('express');
const cors = require('cors');

const app = express();

// Import routes
const { authRoutes, apiRoutes, publicRoutes } = require('./routes');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

// Import logger
const logger = require('./lib/logger');

// Import Prisma client for connection management
const prisma = require('./config/prisma');

// ==================== MIDDLEWARE ====================

// Parse JSON request bodies
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// CORS configuration
if (!process.env.CORS_ORIGIN) {
  throw new Error('CORS_ORIGIN environment variable is required');
}
app.use(cors({
  origin: process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Request logging (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    logger.request(req);
    next();
  });
}

// ==================== ROUTES ====================

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'RJL Backend API is running',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Health check with database connection test
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }
});

// Authentication routes
app.use('/auth', authRoutes);

// API routes
app.use('/api', apiRoutes);

// Public routes (no authentication required)
app.use('/public', publicRoutes);

// ==================== ERROR HANDLING ====================

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ==================== BACKGROUND JOBS ====================

// Only start background jobs if not in test environment
if (process.env.NODE_ENV !== 'test') {
  // Import job modules
  const { setupCronJobs, startImapListener } = require('./jobs');

  // Setup cron jobs
  setupCronJobs();

  // Start email listener (optional, can be disabled via env)
  if (process.env.ENABLE_EMAIL_LISTENER !== 'false') {
    startImapListener().catch((error) => {
      logger.error('Failed to start email listener', { error: error.message });
    });
  }
}

// ==================== SERVER STARTUP ====================

const PORT = process.env.PORT || 3000;

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  try {
    // Stop email listener if running
    if (process.env.NODE_ENV !== 'test' && process.env.ENABLE_EMAIL_LISTENER !== 'false') {
      const { stopImapListener } = require('./jobs');
      stopImapListener();
    }

    await prisma.$disconnect();
    logger.info('Database connection closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error: error.message });
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`, {
      environment: process.env.NODE_ENV || 'development',
      port: PORT,
    });
  });
}

module.exports = app;
