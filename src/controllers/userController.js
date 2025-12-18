/**
 * User Controller
 *
 * HTTP layer for User endpoints. Delegates business logic to userService.
 */

const userService = require('../services/userService');
const { sendSuccess } = require('../lib/response');

module.exports = {
  /**
   * Create a new user
   * POST /api/users
   */
  createUser: async (req, res, next) => {
    try {
      const user = await userService.createUser(req.body, req.user);

      sendSuccess(res, {
        statusCode: 201,
        message: 'User created successfully',
        data: userService.formatUser(user),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get user by ID
   * GET /api/users/:id
   */
  getUserDetail: async (req, res, next) => {
    try {
      const user = await userService.getUserById(parseInt(req.params.id, 10), req.user);

      sendSuccess(res, {
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update a user
   * PUT /api/users/:id
   */
  updateUser: async (req, res, next) => {
    try {
      const user = await userService.updateUser(
        parseInt(req.params.id, 10),
        req.body,
        req.user
      );

      sendSuccess(res, {
        message: 'User updated successfully',
        data: userService.formatUser(user),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List users
   * GET /api/users
   */
  listUsers: async (req, res, next) => {
    try {
      const { search, page, limit, role, agency_id } = req.query;
      const result = await userService.listUsers(req.user, {
        search,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 50,
        role,
        agency_id: agency_id ? parseInt(agency_id, 10) : undefined,
      });

      sendSuccess(res, {
        data: result.users,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete a user (soft delete)
   * DELETE /api/users/:id
   */
  deleteUser: async (req, res, next) => {
    try {
      await userService.deleteUser(parseInt(req.params.id, 10), req.user);

      sendSuccess(res, {
        statusCode: 200,
        message: 'User deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },
};
