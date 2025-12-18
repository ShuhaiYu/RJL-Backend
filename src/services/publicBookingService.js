/**
 * Public Booking Service
 *
 * Business logic for public booking endpoints (no authentication required).
 */

const inspectionNotificationRepository = require('../repositories/inspectionNotificationRepository');
const inspectionBookingRepository = require('../repositories/inspectionBookingRepository');
const inspectionSlotRepository = require('../repositories/inspectionSlotRepository');
const { generateBookingToken, getTokenExpiryDate, isTokenExpired } = require('../lib/tokenGenerator');
const { NotFoundError, ValidationError, ConflictError } = require('../lib/errors');
const { REGION_LABELS } = require('../config/constants');

const publicBookingService = {
  /**
   * Get booking page data by token
   */
  async getBookingPageData(token) {
    // Find notification by token
    const notification = await inspectionNotificationRepository.findByToken(token);
    if (!notification) {
      throw new NotFoundError('Invalid or expired booking link');
    }

    // Check if already booked
    const existingBooking = await inspectionBookingRepository.findByToken(token);
    if (existingBooking) {
      // Return booking status
      return {
        already_booked: true,
        booking: this.formatBooking(existingBooking),
      };
    }

    // Check schedule is still active
    if (notification.schedule.status !== 'published' || !notification.schedule.isActive) {
      throw new ValidationError('This inspection schedule is no longer available');
    }

    // Check schedule date is in the future
    const scheduleDate = new Date(notification.schedule.scheduleDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (scheduleDate < today) {
      throw new ValidationError('This inspection date has passed');
    }

    // Get available slots
    const availableSlots = notification.schedule.slots.filter(
      (slot) => slot.isAvailable && slot.currentBookings < (slot.maxCapacity || 1)
    );

    return {
      already_booked: false,
      property: {
        address: notification.property.address,
      },
      schedule: {
        id: notification.schedule.id,
        region: notification.schedule.region,
        region_label: REGION_LABELS[notification.schedule.region],
        schedule_date: notification.schedule.scheduleDate,
      },
      contact: {
        name: notification.contact?.name || null,
        phone: this.maskPhone(notification.contact?.phone),
        email: this.maskEmail(notification.recipientEmail),
      },
      available_slots: availableSlots.map((slot) => ({
        id: slot.id,
        start_time: slot.startTime,
        end_time: slot.endTime,
        available_spots: slot.maxCapacity - slot.currentBookings,
      })),
    };
  },

  /**
   * Submit a booking
   */
  async submitBooking(token, data) {
    // Find notification by token
    const notification = await inspectionNotificationRepository.findByToken(token);
    if (!notification) {
      throw new NotFoundError('Invalid or expired booking link');
    }

    // Check if already booked
    const existingBooking = await inspectionBookingRepository.findByToken(token);
    if (existingBooking) {
      throw new ConflictError('A booking has already been made with this link');
    }

    // Validate slot
    const slotAvailable = await inspectionSlotRepository.checkAvailability(data.slot_id);
    if (!slotAvailable) {
      throw new ValidationError('This time slot is no longer available');
    }

    // Create booking
    const booking = await inspectionBookingRepository.create({
      slot_id: data.slot_id,
      property_id: notification.propertyId,
      contact_id: notification.contactId,
      contact_name: data.contact_name,
      contact_phone: data.contact_phone || null,
      contact_email: data.contact_email || null,
      note: data.note || null,
      booking_token: token,
      token_expires_at: getTokenExpiryDate(),
      status: 'pending',
    });

    // Increment slot booking count
    await inspectionSlotRepository.incrementBookings(data.slot_id);

    return this.formatBookingConfirmation(booking);
  },

  /**
   * Get booking status by token
   */
  async getBookingStatus(token) {
    const booking = await inspectionBookingRepository.findByToken(token);
    if (!booking) {
      // Check if notification exists but no booking
      const notification = await inspectionNotificationRepository.findByToken(token);
      if (notification) {
        return { status: 'not_booked' };
      }
      throw new NotFoundError('Invalid booking link');
    }

    return {
      status: booking.status,
      booking: this.formatBooking(booking),
    };
  },

  /**
   * Mask phone number for privacy
   */
  maskPhone(phone) {
    if (!phone) return null;
    if (phone.length <= 4) return '****';
    return phone.slice(0, 3) + '*'.repeat(phone.length - 6) + phone.slice(-3);
  },

  /**
   * Mask email for privacy
   */
  maskEmail(email) {
    if (!email) return null;
    const [localPart, domain] = email.split('@');
    if (!domain) return email;
    const maskedLocal = localPart.length <= 2
      ? '*'.repeat(localPart.length)
      : localPart[0] + '*'.repeat(localPart.length - 2) + localPart.slice(-1);
    return `${maskedLocal}@${domain}`;
  },

  /**
   * Format booking for API response
   */
  formatBooking(booking) {
    return {
      id: booking.id,
      status: booking.status,
      contact_name: booking.contactName,
      slot: {
        start_time: booking.slot.startTime,
        end_time: booking.slot.endTime,
      },
      schedule: {
        region: booking.slot.schedule.region,
        region_label: REGION_LABELS[booking.slot.schedule.region],
        schedule_date: booking.slot.schedule.scheduleDate,
      },
      property: {
        address: booking.property.address,
      },
      note: booking.note,
      created_at: booking.createdAt,
    };
  },

  /**
   * Format booking confirmation response
   */
  formatBookingConfirmation(booking) {
    const scheduleDate = new Date(booking.slot.schedule.scheduleDate).toLocaleDateString('en-AU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return {
      success: true,
      message: 'Your booking has been submitted successfully',
      booking: {
        id: booking.id,
        status: booking.status,
        property_address: booking.property.address,
        schedule_date: scheduleDate,
        time_slot: `${booking.slot.startTime} - ${booking.slot.endTime}`,
        contact_name: booking.contactName,
      },
    };
  },
};

module.exports = publicBookingService;
