/**
 * Auth Service
 *
 * Business logic for authentication.
 */

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/userRepository');
const permissionRepository = require('../repositories/permissionRepository');
const resendEmailService = require('./resendEmailService');
const { UnauthorizedError, NotFoundError, ValidationError } = require('../lib/errors');

// Validate required environment variables
if (!process.env.JWT_ACCESS_SECRET) {
  throw new Error('JWT_ACCESS_SECRET environment variable is required');
}
if (!process.env.JWT_REFRESH_SECRET) {
  throw new Error('JWT_REFRESH_SECRET environment variable is required');
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '1h';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '7d';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const authService = {
  /**
   * Login user
   */
  async login(email, password) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Get user permissions
    const permissions = await permissionRepository.findByUserId(user.id);
    const permissionsMap = permissions.reduce((acc, perm) => {
      const scope = perm.permissionScope;
      if (!acc[scope]) acc[scope] = [];
      acc[scope].push(perm.permissionValue);
      return acc;
    }, {});

    // Generate tokens
    const tokenPayload = {
      user_id: user.id,
      role: user.role,
      agency_id: user.agencyId,
      permissions: permissionsMap,
    };

    const accessToken = jwt.sign(tokenPayload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
    const refreshToken = jwt.sign({ user_id: user.id }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });

    // Store hashed refresh token (like reset tokens)
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await userRepository.updateRefreshToken(user.id, refreshTokenHash);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        agency_id: user.agencyId,
        permissions: permissionsMap,
      },
    };
  },

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, REFRESH_SECRET);

      // Hash the provided token to compare with stored hash
      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      // Verify token is still valid in database
      const user = await userRepository.findByRefreshToken(refreshTokenHash);
      if (!user || user.id !== decoded.user_id) {
        throw new UnauthorizedError('Invalid refresh token');
      }

      if (!user.isActive) {
        throw new UnauthorizedError('Account is deactivated');
      }

      // Get user permissions
      const permissions = await permissionRepository.findByUserId(user.id);
      const permissionsMap = permissions.reduce((acc, perm) => {
        const scope = perm.permissionScope;
        if (!acc[scope]) acc[scope] = [];
        acc[scope].push(perm.permissionValue);
        return acc;
      }, {});

      // Generate new access token
      const tokenPayload = {
        user_id: user.id,
        role: user.role,
        agency_id: user.agencyId,
        permissions: permissionsMap,
      };

      const accessToken = jwt.sign(tokenPayload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });

      return { accessToken };
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Invalid or expired refresh token');
      }
      throw error;
    }
  },

  /**
   * Logout user
   */
  async logout(userId) {
    await userRepository.updateRefreshToken(userId, null);
    return { message: 'Logged out successfully' };
  },

  /**
   * Send password reset email
   */
  async forgotPassword(email) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      // Don't reveal if user exists
      return { message: 'If the email exists, a reset link has been sent' };
    }

    // Generate secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    // Store SHA256 hash of token in database
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    // Token expires in 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Store hashed token in database
    await userRepository.updateResetToken(user.id, resetTokenHash, expiresAt);

    // Send plain token in URL (user gets this, we store the hash)
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;

    // Send email via Resend
    await resendEmailService.sendEmail({
      to: email,
      subject: 'Password Reset Request',
      html: `
        <h1>Password Reset</h1>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="${resetUrl}">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    });

    return { message: 'If the email exists, a reset link has been sent' };
  },

  /**
   * Reset password with token
   * Also invalidates all existing sessions by clearing refresh token
   */
  async resetPassword(token, newPassword) {
    // Hash the provided token to compare with stored hash
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find user by hashed token (also checks expiration)
    const user = await userRepository.findByResetToken(resetTokenHash);

    if (!user) {
      throw new ValidationError('Invalid or expired reset token');
    }

    // Update password and clear refresh token to invalidate existing sessions
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await userRepository.update(user.id, {
      password: hashedPassword,
      refresh_token: null,
    });

    // Clear the reset token
    await userRepository.clearResetToken(user.id);

    return { message: 'Password reset successfully' };
  },

  /**
   * Change password (requires old password)
   * Also invalidates all existing sessions by clearing refresh token
   */
  async changePassword(userId, oldPassword, newPassword) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    const validPassword = await bcrypt.compare(oldPassword, user.password);
    if (!validPassword) {
      throw new ValidationError('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear refresh token to invalidate existing sessions
    await userRepository.update(userId, {
      password: hashedPassword,
      refresh_token: null,
    });

    return { message: 'Password changed successfully. Please log in again.' };
  },
};

module.exports = authService;
