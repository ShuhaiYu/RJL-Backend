/**
 * VEU Project Validation Schemas
 */

const { z } = require('zod');
const { VEU_PROJECT_TYPE } = require('../config/constants');

const validTypes = Object.values(VEU_PROJECT_TYPE);

// Create VEU project schema
const createVeuProjectSchema = z.object({
  property_id: z.number().int().positive('Invalid property ID'),
  type: z.enum(validTypes, { errorMap: () => ({ message: 'Invalid VEU project type' }) }),
  is_completed: z.boolean().optional().default(false),
  price: z.number().positive().optional().nullable(),
  completed_by: z.string().max(255).optional().nullable(),
  note: z.string().optional().nullable(),
});

// Update VEU project schema
const updateVeuProjectSchema = z.object({
  type: z.enum(validTypes).optional(),
  is_completed: z.boolean().optional(),
  price: z.number().positive().optional().nullable(),
  completed_by: z.string().max(255).optional().nullable(),
  note: z.string().optional().nullable(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

// VEU project ID param schema
const veuProjectIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid VEU project ID'),
});

// List VEU projects query schema
const listVeuProjectsQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  property_id: z.coerce.number().int().positive().optional(),
  type: z.enum(validTypes).optional(),
  is_completed: z.coerce.boolean().optional(),
});

// File upload params schema
const fileUploadParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid VEU project ID'),
});

module.exports = {
  createVeuProjectSchema,
  updateVeuProjectSchema,
  veuProjectIdParamSchema,
  listVeuProjectsQuerySchema,
  fileUploadParamSchema,
};
