/**
 * Public Routes
 *
 * Routes that do not require authentication.
 * Used for customer-facing booking pages.
 */

const express = require('express');
const router = express.Router();
const publicBookingService = require('../services/publicBookingService');
const { sendSuccess } = require('../lib/response');
const {
  bookingTokenParamSchema,
  submitBookingSchema,
} = require('../validators/inspectionValidator');

/**
 * GET /public/booking/:token
 * Get booking page data
 */
router.get('/booking/:token', async (req, res, next) => {
  try {
    const { token } = bookingTokenParamSchema.parse(req.params);
    const data = await publicBookingService.getBookingPageData(token);
    sendSuccess(res, { data });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /public/booking/:token
 * Submit a booking
 */
router.post('/booking/:token', async (req, res, next) => {
  try {
    const { token } = bookingTokenParamSchema.parse(req.params);
    const bookingData = submitBookingSchema.parse(req.body);
    const result = await publicBookingService.submitBooking(token, bookingData);
    sendSuccess(res, {
      data: result.booking,
      message: result.message,
      statusCode: 201
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /public/booking/:token/status
 * Get booking status
 */
router.get('/booking/:token/status', async (req, res, next) => {
  try {
    const { token } = bookingTokenParamSchema.parse(req.params);
    const status = await publicBookingService.getBookingStatus(token);
    sendSuccess(res, { data: status });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
