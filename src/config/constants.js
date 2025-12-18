/**
 * Application Constants
 *
 * Centralized constants to avoid magic strings and numbers throughout the codebase.
 */

// User Roles
const USER_ROLES = {
  SUPERUSER: 'superuser',
  ADMIN: 'admin',
  AGENCY_ADMIN: 'agency-admin',
  AGENCY_USER: 'agency-user',
};

// Task Statuses
const TASK_STATUS = {
  UNKNOWN: 'unknown',
  INCOMPLETE: 'incomplete',
  PROCESSING: 'processing',
  DUE_SOON: 'due soon',
  EXPIRED: 'expired',
  COMPLETED: 'completed',
  HISTORY: 'history',
};

// Task Types
const TASK_TYPE = {
  SMOKE_ALARM: 'smoke alarm',
  GAS_ELECTRIC: 'gas/electric',
  POOL_SAFETY: 'pool safety',
  UNKNOWN: 'unknown',
};

// VEU Project Types
const VEU_PROJECT_TYPE = {
  WATER_HEATER: 'water_heater',
  AIR_CONDITIONER: 'air_conditioner',
};

// Repeat Frequencies
const REPEAT_FREQUENCY = {
  NONE: 'none',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
};

// Permission Scopes
const PERMISSION_SCOPE = {
  USER: 'user',
  AGENCY: 'agency',
  PROPERTY: 'property',
  TASK: 'task',
  CONTACT: 'contact',
  EMAIL: 'email',
  VEU_PROJECT: 'veu_project',
  SETTING: 'setting',
};

// Permission Values
const PERMISSION_VALUE = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
};

// Pagination Defaults
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
};

// Error Codes
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
};

module.exports = {
  USER_ROLES,
  TASK_STATUS,
  TASK_TYPE,
  VEU_PROJECT_TYPE,
  REPEAT_FREQUENCY,
  PERMISSION_SCOPE,
  PERMISSION_VALUE,
  PAGINATION,
  ERROR_CODES,
};
