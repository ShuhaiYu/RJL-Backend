/**
 * Agency Validation Schemas
 */

const { z } = require('zod');

// Create agency schema
const createAgencySchema = z.object({
  agency_name: z.string().min(1, 'Agency name is required').max(255, 'Agency name too long'),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  logo: z.string().max(500).optional().nullable(),
  // Admin user details for auto-creation
  admin_email: z.string().email('Invalid admin email'),
  admin_name: z.string().min(1, 'Admin name is required').max(255),
  admin_password: z.string().min(8, 'Admin password must be at least 8 characters'),
});

// Update agency schema
const updateAgencySchema = z.object({
  agency_name: z.string().min(1).max(255).optional(),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  logo: z.string().max(500).optional().nullable(),
  is_active: z.boolean().optional(),
  veu_activated: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

// Agency ID param schema
const agencyIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid agency ID'),
});

// List agencies query schema
const listAgenciesQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

// Whitelist schemas
const addWhitelistSchema = z.object({
  email_address: z.string().email('Invalid email address'),
});

const whitelistIdParamSchema = z.object({
  agency_id: z.coerce.number().int().positive('Invalid agency ID'),
  whitelist_id: z.coerce.number().int().positive('Invalid whitelist ID'),
});

module.exports = {
  createAgencySchema,
  updateAgencySchema,
  agencyIdParamSchema,
  listAgenciesQuerySchema,
  addWhitelistSchema,
  whitelistIdParamSchema,
};
