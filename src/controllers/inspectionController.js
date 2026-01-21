/**
 * Inspection Controller
 *
 * HTTP handlers for Inspection Config and Schedule endpoints.
 */

const inspectionService = require('../services/inspectionService');
const inspectionNotificationService = require('../services/inspectionNotificationService');
const inspectionBookingService = require('../services/inspectionBookingService');
const { sendSuccess } = require('../lib/response');
const { ValidationError } = require('../lib/errors');
const logger = require('../lib/logger');
const {
  regionParamSchema,
  updateConfigSchema,
  createScheduleSchema,
  createBatchScheduleSchema,
  updateScheduleSchema,
  scheduleIdParamSchema,
  listSchedulesQuerySchema,
  sendNotificationSchema,
  listBookingsQuerySchema,
  bookingIdParamSchema,
  confirmBookingSchema,
  rejectBookingSchema,
  rescheduleBookingSchema,
} = require('../validators/inspectionValidator');

const inspectionController = {
  // ==================== Config Endpoints ====================

  /**
   * GET /api/inspection/config
   * Get all region configs
   */
  async getAllConfigs(req, res, next) {
    try {
      const configs = await inspectionService.getAllConfigs();
      sendSuccess(res, { data: configs });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/inspection/config/:region
   * Get config by region
   */
  async getConfigByRegion(req, res, next) {
    try {
      const { region } = regionParamSchema.parse(req.params);
      const config = await inspectionService.getConfigByRegion(region);
      sendSuccess(res, { data: config });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/inspection/config/:region
   * Update config by region
   */
  async updateConfigByRegion(req, res, next) {
    try {
      const { region } = regionParamSchema.parse(req.params);
      const data = updateConfigSchema.parse(req.body);
      const config = await inspectionService.updateConfigByRegion(region, data);
      sendSuccess(res, {
        message: 'Config updated successfully',
        data: config,
      });
    } catch (error) {
      next(error);
    }
  },

  // ==================== Schedule Endpoints ====================

  /**
   * GET /api/inspection/schedules
   * List schedules
   */
  async listSchedules(req, res, next) {
    try {
      const filters = listSchedulesQuerySchema.parse(req.query);
      const result = await inspectionService.listSchedules(filters, req.user);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/inspection/schedules
   * Create schedule
   */
  async createSchedule(req, res, next) {
    try {
      const data = createScheduleSchema.parse(req.body);
      const schedule = await inspectionService.createSchedule(data, req.user);
      sendSuccess(res, {
        message: 'Schedule created successfully',
        data: schedule,
      }, 201);
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/inspection/schedules/batch
   * Create multiple schedules for multiple dates
   * Optionally sends notifications to selected recipients immediately
   */
  async createBatchSchedule(req, res, next) {
    try {
      const data = createBatchScheduleSchema.parse(req.body);
      const { selected_recipients, ...scheduleData } = data;
      const result = await inspectionService.createMultipleSchedules(
        scheduleData,
        req.user,
        selected_recipients
      );
      sendSuccess(res, {
        message: `Schedules created: ${result.created.length} success, ${result.skipped.length} skipped, ${result.failed.length} failed`,
        data: result,
      }, 201);
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/inspection/preview-recipients/:region
   * Preview recipients by region before creating schedules
   */
  async previewRecipientsByRegion(req, res, next) {
    try {
      const { region } = regionParamSchema.parse(req.params);
      const preview = await inspectionService.previewRecipientsByRegion(region, req.user);
      sendSuccess(res, { data: preview });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/inspection/schedules/:id
   * Get schedule detail
   */
  async getScheduleDetail(req, res, next) {
    try {
      const { id } = scheduleIdParamSchema.parse(req.params);
      const schedule = await inspectionService.getScheduleById(id, req.user);
      sendSuccess(res, { data: schedule });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/inspection/schedules/:id
   * Update schedule
   */
  async updateSchedule(req, res, next) {
    try {
      const { id } = scheduleIdParamSchema.parse(req.params);
      const data = updateScheduleSchema.parse(req.body);
      const schedule = await inspectionService.updateSchedule(id, data, req.user);
      sendSuccess(res, {
        message: 'Schedule updated successfully',
        data: schedule,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/inspection/schedules/:id
   * Delete schedule
   */
  async deleteSchedule(req, res, next) {
    try {
      const { id } = scheduleIdParamSchema.parse(req.params);
      const result = await inspectionService.deleteSchedule(id, req.user);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/inspection/schedules/:id/properties
   * Get properties for schedule
   */
  async getScheduleProperties(req, res, next) {
    try {
      const { id } = scheduleIdParamSchema.parse(req.params);
      const properties = await inspectionService.getScheduleProperties(id, req.user);
      sendSuccess(res, { data: properties });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/inspection/schedules/:id/notify
   * Send notifications
   * Returns immediately (202 Accepted) and processes emails in background
   */
  async sendNotifications(req, res, next) {
    try {
      const { id } = scheduleIdParamSchema.parse(req.params);
      const { property_ids } = sendNotificationSchema.parse(req.body);

      // Respond immediately to prevent timeout
      sendSuccess(res, {
        message: 'Notification emails are being sent in the background',
        data: {
          schedule_id: id,
          property_count: property_ids.length,
          status: 'processing',
        },
      }, 202); // 202 Accepted

      // Process emails in background (non-blocking)
      inspectionNotificationService.sendNotifications(id, property_ids)
        .then((result) => {
          logger.info('Background email sending completed', {
            scheduleId: id,
            success: result.success.length,
            failed: result.failed.length,
            skipped: result.skipped.length,
          });
        })
        .catch((error) => {
          logger.error('Background email sending failed', {
            scheduleId: id,
            error: error.message,
            stack: error.stack,
          });
        });
    } catch (error) {
      next(error);
    }
  },

  // ==================== Booking Endpoints ====================

  /**
   * GET /api/inspection/bookings
   * List bookings
   */
  async listBookings(req, res, next) {
    try {
      console.log('[listBookings] req.user:', JSON.stringify(req.user));
      console.log('[listBookings] req.query:', JSON.stringify(req.query));
      const filters = listBookingsQuerySchema.parse(req.query);
      console.log('[listBookings] filters parsed:', JSON.stringify(filters));
      const result = await inspectionBookingService.listBookings(filters, req.user);
      console.log('[listBookings] result count:', result.data?.length);
      sendSuccess(res, result);
    } catch (error) {
      console.error('[listBookings] error:', error.message, error.stack);
      next(error);
    }
  },

  /**
   * GET /api/inspection/bookings/:id
   * Get booking detail
   */
  async getBookingDetail(req, res, next) {
    try {
      const { id } = bookingIdParamSchema.parse(req.params);
      const booking = await inspectionBookingService.getBookingById(id, req.user);
      sendSuccess(res, { data: booking });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/inspection/bookings/:id/confirm
   * Confirm booking
   */
  async confirmBooking(req, res, next) {
    try {
      const { id } = bookingIdParamSchema.parse(req.params);
      const data = confirmBookingSchema.parse(req.body);
      const booking = await inspectionBookingService.confirmBooking(id, data, req.user);
      sendSuccess(res, {
        message: 'Booking confirmed successfully',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/inspection/bookings/:id/reject
   * Reject booking
   */
  async rejectBooking(req, res, next) {
    try {
      const { id } = bookingIdParamSchema.parse(req.params);
      const data = rejectBookingSchema.parse(req.body);
      const booking = await inspectionBookingService.rejectBooking(id, data, req.user);
      sendSuccess(res, {
        message: 'Booking rejected',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/inspection/bookings/:id/reschedule
   * Reschedule booking
   */
  async rescheduleBooking(req, res, next) {
    try {
      const { id } = bookingIdParamSchema.parse(req.params);
      const data = rescheduleBookingSchema.parse(req.body);
      const booking = await inspectionBookingService.rescheduleBooking(id, data, req.user);
      sendSuccess(res, {
        message: 'Booking rescheduled successfully',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = inspectionController;
