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
      const result = await inspectionService.listSchedules(filters);
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
      const schedule = await inspectionService.createSchedule(data, req.user.user_id);
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
   */
  async createBatchSchedule(req, res, next) {
    try {
      const data = createBatchScheduleSchema.parse(req.body);
      const result = await inspectionService.createMultipleSchedules(data, req.user.user_id);
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
      const preview = await inspectionService.previewRecipientsByRegion(region);
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
      const schedule = await inspectionService.getScheduleById(id);
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
      const schedule = await inspectionService.updateSchedule(id, data);
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
      const result = await inspectionService.deleteSchedule(id);
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
      const properties = await inspectionService.getScheduleProperties(id);
      sendSuccess(res, { data: properties });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/inspection/schedules/:id/notify
   * Send notifications
   */
  async sendNotifications(req, res, next) {
    try {
      const { id } = scheduleIdParamSchema.parse(req.params);
      const { property_ids } = sendNotificationSchema.parse(req.body);
      const result = await inspectionNotificationService.sendNotifications(id, property_ids);
      sendSuccess(res, {
        message: `Notifications sent: ${result.success.length} success, ${result.failed.length} failed, ${result.skipped.length} skipped`,
        data: result,
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
      const filters = listBookingsQuerySchema.parse(req.query);
      const result = await inspectionBookingService.listBookings(filters);
      sendSuccess(res, result);
    } catch (error) {
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
      const booking = await inspectionBookingService.getBookingById(id);
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
      const booking = await inspectionBookingService.confirmBooking(id, data, req.user.id);
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
      const booking = await inspectionBookingService.rejectBooking(id, data, req.user.id);
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
      const booking = await inspectionBookingService.rescheduleBooking(id, data, req.user.id);
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
