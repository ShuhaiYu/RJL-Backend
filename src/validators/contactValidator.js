/**
 * Contact Validation Schemas
 */

const { z } = require('zod');

// Create contact schema
const createContactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  phone: z.string().max(100).optional().nullable(),
  email: z.string().email('Invalid email format').optional().nullable(),
  property_id: z.number().int().positive('Invalid property ID'),
});

// Update contact schema
const updateContactSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  phone: z.string().max(100).optional().nullable(),
  email: z.string().email('Invalid email format').optional().nullable(),
  property_id: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

// Contact ID param schema
const contactIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid contact ID'),
});

// List contacts query schema
const listContactsQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  property_id: z.coerce.number().int().positive().optional(),
});

module.exports = {
  createContactSchema,
  updateContactSchema,
  contactIdParamSchema,
  listContactsQuerySchema,
};
