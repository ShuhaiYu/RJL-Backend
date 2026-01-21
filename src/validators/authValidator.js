/**
 * Authentication Validation Schemas
 */

const { z } = require('zod');

// Simple password schema - minimum 8 characters
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters');

// Login schema
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

// Refresh token schema
const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// Forgot password schema
const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

// Reset password schema
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: passwordSchema,
});

// Change password schema
const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Old password is required'),
  newPassword: passwordSchema,
});

module.exports = {
  passwordSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
};
