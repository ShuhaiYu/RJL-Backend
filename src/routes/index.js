/**
 * Routes Index
 *
 * Exports all route modules.
 */

const authRoutes = require('./authRoutes');
const apiRoutes = require('./apiRoutes');
const publicRoutes = require('./publicRoutes');
const webhookRoutes = require('./webhookRoutes');
const cronRoutes = require('./cronRoutes');

module.exports = {
  authRoutes,
  apiRoutes,
  publicRoutes,
  webhookRoutes,
  cronRoutes,
};
