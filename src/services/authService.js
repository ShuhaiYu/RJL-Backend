/**
 * Auth Service
 *
 * Business logic for authentication.
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const userRepository = require('../repositories/userRepository');
const permissionRepository = require('../repositories/permissionRepository');
const systemSettingsRepository = require('../repositories/systemSettingsRepository');
const { UnauthorizedError, NotFoundError, ValidationError } = require('../lib/errors');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'fallback_access_secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret';
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '24h';
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

    // Store refresh token
    await userRepository.updateRefreshToken(user.id, refreshToken);

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

      // Verify token is still valid in database
      const user = await userRepository.findByRefreshToken(refreshToken);
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

    // Generate reset token (valid for 1 hour)
    const resetToken = jwt.sign({ user_id: user.id }, ACCESS_SECRET, { expiresIn: '1h' });
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;

    // Get email settings
    const emailSettings = await systemSettingsRepository.getEmailSettings();
    if (!emailSettings || !emailSettings.user) {
      throw new Error('Email settings not configured');
    }

    // Send email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailSettings.user,
        pass: emailSettings.password,
      },
    });

    await transporter.sendMail({
      from: emailSettings.user,
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
   */
  async resetPassword(token, newPassword) {
    try {
      const decoded = jwt.verify(token, ACCESS_SECRET);
      const user = await userRepository.findById(decoded.user_id);

      if (!user) {
        throw new NotFoundError('User');
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await userRepository.update(user.id, { password: hashedPassword });

      return { message: 'Password reset successfully' };
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        throw new ValidationError('Invalid or expired reset token');
      }
      throw error;
    }
  },

  /**
   * Change password (requires old password)
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
    await userRepository.update(userId, { password: hashedPassword });

    return { message: 'Password changed successfully' };
  },
};

module.exports = authService;
