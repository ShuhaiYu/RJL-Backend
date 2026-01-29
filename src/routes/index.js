/**
 * Routes Index
 *
 * Exports all route modules.
 */

const authRoutes = require('./authRoutes');
const apiRoutes = require('./apiRoutes');
const publicRoutes = require('./publicRoutes');
const webhookRoutes = require('./webhookRoutes');

module.exports = {
  authRoutes,
  apiRoutes,
  publicRoutes,
  webhookRoutes,
};
