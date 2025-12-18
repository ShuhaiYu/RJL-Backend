/**
 * Auth Controller
 *
 * HTTP layer for authentication endpoints. Delegates business logic to authService.
 */

const authService = require('../services/authService');
const { sendSuccess, sendError } = require('../lib/response');

module.exports = {
  /**
   * Login
   * POST /auth/login
   */
  login: async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);

      sendSuccess(res, {
        message: 'Login successful',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Refresh access token
   * POST /auth/refresh-token
   */
  refreshToken: async (req, res, next) => {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refreshToken(refreshToken);

      sendSuccess(res, {
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Forgot password - send reset email
   * POST /auth/forgot-password
   */
  forgotPassword: async (req, res, next) => {
    try {
      const { email } = req.body;
      const result = await authService.forgotPassword(email);

      sendSuccess(res, {
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Reset password with token
   * POST /auth/reset-password
   */
  resetPassword: async (req, res, next) => {
    try {
      const { token, newPassword } = req.body;
      const result = await authService.resetPassword(token, newPassword);

      sendSuccess(res, {
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Change password (requires authentication)
   * POST /auth/change-password
   */
  changePassword: async (req, res, next) => {
    try {
      const { oldPassword, newPassword } = req.body;
      const result = await authService.changePassword(
        req.user.user_id,
        oldPassword,
        newPassword
      );

      sendSuccess(res, {
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Logout - revoke refresh token
   * POST /auth/logout
   */
  logout: async (req, res, next) => {
    try {
      const result = await authService.logout(req.user.user_id);

      sendSuccess(res, {
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get current user information
   * GET /auth/me
   */
  getCurrentUser: async (req, res, next) => {
    try {
      const userService = require('../services/userService');
      const user = await userService.getUserById(req.user.user_id, req.user);

      sendSuccess(res, {
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },
};
