/**
 * Inspection Booking Service
 *
 * Business logic for admin booking management.
 */

const inspectionBookingRepository = require('../repositories/inspectionBookingRepository');
const inspectionSlotRepository = require('../repositories/inspectionSlotRepository');
const inspectionNotificationService = require('./inspectionNotificationService');
const { NotFoundError, ValidationError, ConflictError } = require('../lib/errors');
const { REGION_LABELS, BOOKING_STATUS } = require('../config/constants');
const logger = require('../lib/logger');

const inspectionBookingService = {
  /**
   * List all bookings with filters
   */
  async listBookings(filters) {
    const result = await inspectionBookingRepository.findAll(filters);
    return {
      data: result.bookings.map((booking) => this.formatBooking(booking)),
      pagination: result.pagination,
    };
  },

  /**
   * Get booking by ID
   */
  async getBookingById(id) {
    const booking = await inspectionBookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }
    return this.formatBookingDetail(booking);
  },

  /**
   * Confirm a booking
   */
  async confirmBooking(id, data, userId) {
    const booking = await inspectionBookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (booking.status !== 'pending') {
      throw new ValidationError(`Cannot confirm a booking with status: ${booking.status}`);
    }

    const updated = await inspectionBookingRepository.updateStatus(id, 'confirmed', userId);

    // Send confirmation email if requested
    if (data.send_notification) {
      try {
        await inspectionNotificationService.sendConfirmationEmail(updated);
      } catch (error) {
        logger.error('Failed to send confirmation email', { bookingId: id, error: error.message });
        // Don't fail the confirmation if email fails
      }
    }

    return this.formatBookingDetail(updated);
  },

  /**
   * Reject a booking
   */
  async rejectBooking(id, data, userId) {
    const booking = await inspectionBookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (booking.status !== 'pending') {
      throw new ValidationError(`Cannot reject a booking with status: ${booking.status}`);
    }

    // Decrement slot booking count
    await inspectionSlotRepository.decrementBookings(booking.slotId);

    const updated = await inspectionBookingRepository.updateStatus(id, 'rejected', userId);

    // Send rejection email if requested
    if (data.send_notification) {
      try {
        await inspectionNotificationService.sendRejectionEmail(updated);
      } catch (error) {
        logger.error('Failed to send rejection email', { bookingId: id, error: error.message });
        // Don't fail the rejection if email fails
      }
    }

    return this.formatBookingDetail(updated);
  },

  /**
   * Reschedule a booking to a different slot
   */
  async rescheduleBooking(id, data, userId) {
    const booking = await inspectionBookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (!['pending', 'confirmed'].includes(booking.status)) {
      throw new ValidationError(`Cannot reschedule a booking with status: ${booking.status}`);
    }

    // Check new slot availability
    const slotAvailable = await inspectionSlotRepository.checkAvailability(data.slot_id);
    if (!slotAvailable) {
      throw new ValidationError('The selected time slot is not available');
    }

    // Save old slot info for email
    const oldSlot = {
      startTime: booking.slot.startTime,
      endTime: booking.slot.endTime,
    };

    // Update slot counts
    await inspectionSlotRepository.decrementBookings(booking.slotId);
    await inspectionSlotRepository.incrementBookings(data.slot_id);

    // Update booking
    const updated = await inspectionBookingRepository.reschedule(id, data.slot_id, data.note);

    // Send reschedule email if requested
    if (data.send_notification) {
      try {
        await inspectionNotificationService.sendRescheduleEmail(updated, oldSlot);
      } catch (error) {
        logger.error('Failed to send reschedule email', { bookingId: id, error: error.message });
        // Don't fail the reschedule if email fails
      }
    }

    return this.formatBookingDetail(updated);
  },

  /**
   * Format booking for list view
   */
  formatBooking(booking) {
    return {
      id: booking.id,
      status: booking.status,
      contact_name: booking.contactName,
      contact_phone: booking.contactPhone,
      contact_email: booking.contactEmail,
      slot: {
        id: booking.slot.id,
        start_time: booking.slot.startTime,
        end_time: booking.slot.endTime,
      },
      schedule: booking.slot.schedule ? {
        id: booking.slot.schedule.id,
        region: booking.slot.schedule.region,
        region_label: REGION_LABELS[booking.slot.schedule.region],
        schedule_date: booking.slot.schedule.scheduleDate,
      } : null,
      property: booking.property ? {
        id: booking.property.id,
        address: booking.property.address,
      } : null,
      created_at: booking.createdAt,
    };
  },

  /**
   * Format booking for detail view
   */
  formatBookingDetail(booking) {
    return {
      id: booking.id,
      status: booking.status,
      contact_name: booking.contactName,
      contact_phone: booking.contactPhone,
      contact_email: booking.contactEmail,
      note: booking.note,
      slot: {
        id: booking.slot.id,
        start_time: booking.slot.startTime,
        end_time: booking.slot.endTime,
      },
      schedule: {
        id: booking.slot.schedule.id,
        region: booking.slot.schedule.region,
        region_label: REGION_LABELS[booking.slot.schedule.region],
        schedule_date: booking.slot.schedule.scheduleDate,
      },
      property: {
        id: booking.property.id,
        address: booking.property.address,
      },
      contact: booking.contact ? {
        id: booking.contact.id,
        name: booking.contact.name,
        email: booking.contact.email,
        phone: booking.contact.phone,
      } : null,
      confirmer: booking.confirmer,
      confirmed_at: booking.confirmedAt,
      created_at: booking.createdAt,
      updated_at: booking.updatedAt,
    };
  },
};

module.exports = inspectionBookingService;
