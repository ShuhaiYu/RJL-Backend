/**
 * Routes Index
 *
 * Exports all route modules.
 */

const authRoutes = require('./authRoutes');
const apiRoutes = require('./apiRoutes');
const publicRoutes = require('./publicRoutes');

module.exports = {
  authRoutes,
  apiRoutes,
  publicRoutes,
};
