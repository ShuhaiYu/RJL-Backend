/**
 * Email Validation Schemas
 */

const { z } = require('zod');

// Process email schema (for email listener/parser)
const processEmailSchema = z.object({
  subject: z.string().optional().nullable(),
  sender: z.string().optional().nullable(),
  textBody: z.string().min(1, 'Email body is required'),
  html: z.string().optional().nullable(),
  gmail_msgid: z.string().optional().nullable(),
});

// Email ID param schema
const emailIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid email ID'),
});

// List emails query schema
const listEmailsQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  property_id: z.coerce.number().int().positive().optional(),
  agency_id: z.coerce.number().int().positive().optional(),
});

// Sync emails query schema
const syncEmailsQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(365).optional().default(7),
});

module.exports = {
  processEmailSchema,
  emailIdParamSchema,
  listEmailsQuerySchema,
  syncEmailsQuerySchema,
};
