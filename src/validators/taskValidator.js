/**
 * Task Validation Schemas
 */

const { z } = require('zod');
const { TASK_STATUS, TASK_TYPE, REPEAT_FREQUENCY } = require('../config/constants');

const validStatuses = Object.values(TASK_STATUS);
const validTypes = Object.values(TASK_TYPE);
const validFrequencies = Object.values(REPEAT_FREQUENCY);

// Create task schema
const createTaskSchema = z.object({
  property_id: z.number().int().positive('Invalid property ID'),
  task_name: z.string().min(1, 'Task name is required').max(255, 'Task name too long'),
  task_description: z.string().optional().nullable(),
  due_date: z.string().datetime().optional().nullable(),
  inspection_date: z.string().datetime().optional().nullable(),
  repeat_frequency: z.enum(validFrequencies, { errorMap: () => ({ message: `Invalid repeat frequency. Must be one of: ${validFrequencies.join(', ')}` }) }).optional().default('none'),
  type: z.enum(validTypes, { errorMap: () => ({ message: `Invalid task type. Must be one of: ${validTypes.join(', ')}` }) }).optional().nullable(),
  status: z.enum(validStatuses, { errorMap: () => ({ message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }) }).optional().default('unknown'),
  free_check_available: z.boolean().optional().default(false),
});

// Create multiple tasks schema
const createTasksSchema = z.object({
  property_ids: z.array(z.number().int().positive()).min(1, 'At least one property ID is required'),
  task_name: z.string().min(1, 'Task name is required').max(255),
  task_description: z.string().optional().nullable(),
  due_date: z.string().datetime().optional().nullable(),
  inspection_date: z.string().datetime().optional().nullable(),
  repeat_frequency: z.enum(validFrequencies, { errorMap: () => ({ message: `Invalid repeat frequency. Must be one of: ${validFrequencies.join(', ')}` }) }).optional().default('none'),
  type: z.enum(validTypes, { errorMap: () => ({ message: `Invalid task type. Must be one of: ${validTypes.join(', ')}` }) }).optional().nullable(),
  status: z.enum(validStatuses, { errorMap: () => ({ message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }) }).optional().default('unknown'),
  free_check_available: z.boolean().optional().default(false),
});

// Update task schema
const updateTaskSchema = z.object({
  property_id: z.number().int().positive().optional(),
  task_name: z.string().min(1).max(255).optional(),
  task_description: z.string().optional().nullable(),
  due_date: z.string().datetime().optional().nullable(),
  inspection_date: z.string().datetime().optional().nullable(),
  repeat_frequency: z.enum(validFrequencies, { errorMap: () => ({ message: `Invalid repeat frequency. Must be one of: ${validFrequencies.join(', ')}` }) }).optional(),
  type: z.enum(validTypes, { errorMap: () => ({ message: `Invalid task type. Must be one of: ${validTypes.join(', ')}` }) }).optional().nullable(),
  status: z.enum(validStatuses, { errorMap: () => ({ message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }) }).optional(),
  is_active: z.boolean().optional(),
  free_check_available: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

// Task ID param schema
const taskIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid task ID'),
});

// List tasks query schema
const listTasksQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(1000).optional().default(50),
  property_id: z.coerce.number().int().positive().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
});

// Dashboard query schema
const dashboardQuerySchema = z.object({
  agency_id: z.coerce.number().int().positive().optional(),
});

module.exports = {
  createTaskSchema,
  createTasksSchema,
  updateTaskSchema,
  taskIdParamSchema,
  listTasksQuerySchema,
  dashboardQuerySchema,
};
