/**
 * Routes Index
 *
 * Exports all route modules.
 */

const authRoutes = require('./authRoutes');
const apiRoutes = require('./apiRoutes');

module.exports = {
  authRoutes,
  apiRoutes,
};
