/**
 * Property Validation Schemas
 */

const { z } = require('zod');

// Create property schema
const createPropertySchema = z.object({
  address: z.string().min(1, 'Address is required').max(500, 'Address too long'),
  user_id: z.number().int().positive('Invalid user ID').optional(),
});

// Update property schema
const updatePropertySchema = z.object({
  address: z.string().min(1).max(500).optional(),
  user_id: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

// Property ID param schema
const propertyIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid property ID'),
});

// List properties query schema
const listPropertiesQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  user_id: z.coerce.number().int().positive().optional(),
});

module.exports = {
  createPropertySchema,
  updatePropertySchema,
  propertyIdParamSchema,
  listPropertiesQuerySchema,
};
