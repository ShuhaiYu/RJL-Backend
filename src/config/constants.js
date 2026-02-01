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

// Task Statuses (uppercase with underscores)
const TASK_STATUS = {
  UNKNOWN: 'UNKNOWN',
  INCOMPLETE: 'INCOMPLETE',
  PROCESSING: 'PROCESSING',
  DUE_SOON: 'DUE_SOON',
  EXPIRED: 'EXPIRED',
  COMPLETED: 'COMPLETED',
  HISTORY: 'HISTORY',
};

// Task Types
const TASK_TYPE = {
  SMOKE_ALARM: 'SMOKE_ALARM',
  GAS_ELECTRICITY: 'GAS_&_ELECTRICITY',
  SAFETY_CHECK: 'SAFETY_CHECK',
};

// VEU Project Types
const VEU_PROJECT_TYPE = {
  WATER_HEATER: 'water_heater',
  AIR_CONDITIONER: 'air_conditioner',
};

// Regions (区域)
const REGION = {
  EAST: 'EAST',
  SOUTH: 'SOUTH',
  WEST: 'WEST',
  NORTH: 'NORTH',
  CENTRAL: 'CENTRAL',
};

// Region Labels
const REGION_LABELS = {
  EAST: 'East',
  SOUTH: 'South',
  WEST: 'West',
  NORTH: 'North',
  CENTRAL: 'Central',
};

// Inspection Schedule Status
const SCHEDULE_STATUS = {
  PUBLISHED: 'published',
  CLOSED: 'closed',
};

// Inspection Booking Status
const BOOKING_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

// Notification Status
const NOTIFICATION_STATUS = {
  SENT: 'sent',
  DELIVERED: 'delivered',
  FAILED: 'failed',
};

// Repeat Frequencies
const REPEAT_FREQUENCY = {
  NONE: 'none',
  ONE_MONTH: '1 month',
  THREE_MONTHS: '3 months',
  SIX_MONTHS: '6 months',
  ONE_YEAR: '1 year',
  TWO_YEARS: '2 years',
  THREE_YEARS: '3 years',
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
  INSPECTION: 'inspection',
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
  REGION,
  REGION_LABELS,
  SCHEDULE_STATUS,
  BOOKING_STATUS,
  NOTIFICATION_STATUS,
  REPEAT_FREQUENCY,
  PERMISSION_SCOPE,
  PERMISSION_VALUE,
  PAGINATION,
  ERROR_CODES,
};
