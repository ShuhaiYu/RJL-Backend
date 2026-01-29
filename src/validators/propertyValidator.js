/**
 * Property Validation Schemas
 */

const { z } = require('zod');
const { REGION } = require('../config/constants');

// Valid region values
const regionValues = Object.values(REGION);

// Create property schema
const createPropertySchema = z.object({
  address: z.string().min(1, 'Address is required').max(500, 'Address too long'),
  user_id: z.number().int().positive('Invalid user ID').optional(),
  region: z.enum(regionValues, { errorMap: () => ({ message: 'Region is required. Please select a valid region (EAST, SOUTH, WEST, NORTH, CENTRAL)' }) }),
});

// Update property schema
const updatePropertySchema = z.object({
  address: z.string().min(1).max(500).optional(),
  user_id: z.number().int().positive().optional().nullable(),
  is_active: z.boolean().optional(),
  region: z.enum(regionValues, { errorMap: () => ({ message: 'Invalid region' }) }).optional().nullable(),
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
  limit: z.coerce.number().int().positive().max(1000).optional().default(50),
  user_id: z.coerce.number().int().positive().optional(),
  region: z.enum(regionValues).optional(),
});

// Batch update region schema
const batchUpdateRegionSchema = z.object({
  property_ids: z.array(z.number().int().positive('Invalid property ID')).min(1, 'At least one property ID is required'),
  region: z.enum(regionValues, { errorMap: () => ({ message: 'Invalid region. Must be one of: EAST, SOUTH, WEST, NORTH, CENTRAL' }) }),
});

module.exports = {
  createPropertySchema,
  updatePropertySchema,
  propertyIdParamSchema,
  listPropertiesQuerySchema,
  batchUpdateRegionSchema,
};
