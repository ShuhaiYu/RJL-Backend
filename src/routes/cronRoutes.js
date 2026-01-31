/**
 * Cron Routes
 *
 * API endpoints for Vercel Cron jobs.
 * These endpoints are protected by CRON_SECRET verification.
 */

const express = require('express');
const router = express.Router();
const cronController = require('../controllers/cronController');
const { verifyCronSecret } = require('../middlewares/cronAuth');

// Apply cron secret verification to all routes
router.use(verifyCronSecret);

// Daily tasks - runs at 04:00 Melbourne time
// Combines: task reminders + task status updates
router.get('/daily-tasks', cronController.runDailyTasks);

// Individual job endpoints (for manual triggering or separate scheduling)
router.get('/task-reminders', cronController.runTaskReminders);
router.get('/task-status-update', cronController.runTaskStatusUpdate);

module.exports = router;
