/**
 * Inspection Validation Schemas
 */

const { z } = require('zod');
const { REGION, SCHEDULE_STATUS, BOOKING_STATUS } = require('../config/constants');

// Valid region values
const regionValues = Object.values(REGION);
const scheduleStatusValues = Object.values(SCHEDULE_STATUS);
const bookingStatusValues = Object.values(BOOKING_STATUS);

// Time format regex (HH:MM)
const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

// ==================== Config Schemas ====================

// Region param schema
const regionParamSchema = z.object({
  region: z.enum(regionValues, { errorMap: () => ({ message: 'Invalid region' }) }),
});

// Update config schema
const updateConfigSchema = z.object({
  start_time: z.string().regex(timeRegex, 'Invalid time format (HH:MM)'),
  end_time: z.string().regex(timeRegex, 'Invalid time format (HH:MM)'),
  slot_duration: z.number().int().min(15, 'Minimum slot duration is 15 minutes').max(480, 'Maximum slot duration is 480 minutes'),
  max_capacity: z.number().int().min(1, 'Minimum capacity is 1').max(20, 'Maximum capacity is 20').optional(),
}).refine((data) => {
  // Validate end_time > start_time
  const [startHour, startMin] = data.start_time.split(':').map(Number);
  const [endHour, endMin] = data.end_time.split(':').map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  return endMinutes > startMinutes;
}, {
  message: 'End time must be after start time',
});

// ==================== Schedule Schemas ====================

// Create schedule schema
const createScheduleSchema = z.object({
  region: z.enum(regionValues, { errorMap: () => ({ message: 'Invalid region' }) }),
  schedule_date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  start_time: z.string().regex(timeRegex, 'Invalid time format (HH:MM)').optional(),
  end_time: z.string().regex(timeRegex, 'Invalid time format (HH:MM)').optional(),
  slot_duration: z.number().int().min(15).max(480).optional(),
  max_capacity: z.number().int().min(1).max(20).optional(),
  note: z.string().max(500).optional(),
});

// Update schedule schema
const updateScheduleSchema = z.object({
  status: z.enum(scheduleStatusValues).optional(),
  note: z.string().max(500).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

// Schedule ID param schema
const scheduleIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid schedule ID'),
});

// List schedules query schema
const listSchedulesQuerySchema = z.object({
  region: z.enum(regionValues).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  status: z.enum(scheduleStatusValues).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

// Send notification schema
const sendNotificationSchema = z.object({
  property_ids: z.array(z.number().int().positive()).min(1, 'At least one property must be selected'),
});

// ==================== Booking Schemas ====================

// List bookings query schema
const listBookingsQuerySchema = z.object({
  schedule_id: z.coerce.number().int().positive().optional(),
  property_id: z.coerce.number().int().positive().optional(),
  status: z.enum(bookingStatusValues).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

// Booking ID param schema
const bookingIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid booking ID'),
});

// Confirm booking schema
const confirmBookingSchema = z.object({
  note: z.string().max(500).optional(),
  send_notification: z.boolean().optional().default(true),
});

// Reject booking schema
const rejectBookingSchema = z.object({
  note: z.string().max(500).optional(),
  send_notification: z.boolean().optional().default(true),
});

// Reschedule booking schema
const rescheduleBookingSchema = z.object({
  slot_id: z.number().int().positive('Invalid slot ID'),
  note: z.string().max(500).optional(),
  send_notification: z.boolean().optional().default(true),
});

// ==================== Public Booking Schemas ====================

// Booking token param schema
const bookingTokenParamSchema = z.object({
  token: z.string().length(64, 'Invalid booking token'),
});

// Submit booking schema
const submitBookingSchema = z.object({
  slot_id: z.number().int().positive('Invalid slot ID'),
  contact_name: z.string().min(1, 'Contact name is required').max(255),
  contact_phone: z.string().max(100).optional(),
  contact_email: z.string().email('Invalid email format').max(255).optional(),
  note: z.string().max(500).optional(),
});

module.exports = {
  // Config
  regionParamSchema,
  updateConfigSchema,
  // Schedule
  createScheduleSchema,
  updateScheduleSchema,
  scheduleIdParamSchema,
  listSchedulesQuerySchema,
  sendNotificationSchema,
  // Booking
  listBookingsQuerySchema,
  bookingIdParamSchema,
  confirmBookingSchema,
  rejectBookingSchema,
  rescheduleBookingSchema,
  // Public
  bookingTokenParamSchema,
  submitBookingSchema,
};
