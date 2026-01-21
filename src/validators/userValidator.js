/**
 * User Validation Schemas
 */

const { z } = require('zod');
const { USER_ROLES } = require('../config/constants');
const { passwordSchema } = require('./authValidator');

// Valid roles array
const validRoles = Object.values(USER_ROLES);

// Create user schema
const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  password: passwordSchema,
  role: z.enum(validRoles, { errorMap: () => ({ message: 'Invalid role' }) }),
  agency_id: z.number().int().positive().optional().nullable(),
  permissions: z.array(z.object({
    permission_value: z.string(),
    permission_scope: z.string(),
  })).optional(),
});

// Update user schema
const updateUserSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  name: z.string().min(1).max(255).optional(),
  password: passwordSchema.optional(),
  role: z.enum(validRoles).optional(),
  agency_id: z.number().int().positive().optional().nullable(),
  is_active: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

// User ID param schema
const userIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid user ID'),
});

// List users query schema
const listUsersQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  role: z.enum(validRoles).optional(),
  agency_id: z.coerce.number().int().positive().optional(),
});

// Change password schema
const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Old password is required'),
  newPassword: passwordSchema,
});

module.exports = {
  createUserSchema,
  updateUserSchema,
  userIdParamSchema,
  listUsersQuerySchema,
  changePasswordSchema,
};
