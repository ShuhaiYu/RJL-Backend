/**
 * Public Booking Service
 *
 * Business logic for public booking endpoints (no authentication required).
 */

const prisma = require('../config/prisma');
const inspectionNotificationRepository = require('../repositories/inspectionNotificationRepository');
const inspectionBookingRepository = require('../repositories/inspectionBookingRepository');
const inspectionSlotRepository = require('../repositories/inspectionSlotRepository');
const inspectionScheduleRepository = require('../repositories/inspectionScheduleRepository');
const { generateBookingToken, getTokenExpiryDate, isTokenExpired } = require('../lib/tokenGenerator');
const { NotFoundError, ValidationError, ConflictError } = require('../lib/errors');
const { REGION_LABELS } = require('../config/constants');

const publicBookingService = {
  /**
   * Get booking page data by token (multi-date support)
   * Returns all future scheduled dates for the property's region
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

    // Get the region from the notification's schedule
    const region = notification.schedule.region;

    // Fetch ALL future published schedules for this region
    const futureSchedules = await inspectionScheduleRepository.findFutureByRegion(region);

    // Filter out invalid schedules and format for response
    const schedulesWithSlots = futureSchedules
      .filter((schedule) => {
        // Schedule must be active and published
        if (schedule.status !== 'published' || !schedule.isActive) return false;
        // Schedule date must be in the future
        const scheduleDate = new Date(schedule.scheduleDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return scheduleDate >= today;
      })
      .map((schedule) => {
        // Get available slots
        const availableSlots = schedule.slots.filter(
          (slot) => slot.isAvailable && slot.currentBookings < (slot.maxCapacity || 1)
        );

        return {
          id: schedule.id,
          schedule_date: schedule.scheduleDate,
          slots: availableSlots.map((slot) => ({
            id: slot.id,
            start_time: slot.startTime,
            end_time: slot.endTime,
            available_spots: slot.maxCapacity - slot.currentBookings,
          })),
        };
      })
      .filter((schedule) => schedule.slots.length > 0); // Only include schedules with available slots

    if (schedulesWithSlots.length === 0) {
      throw new ValidationError('No available inspection dates at this time');
    }

    // Determine booker info from notification
    let bookerInfo = {
      type: notification.recipientType || 'contact',
      name: null,
      email: this.maskEmail(notification.recipientEmail),
    };

    if (notification.recipientType === 'contact' && notification.contact) {
      bookerInfo.name = notification.contact.name;
      bookerInfo.phone = this.maskPhone(notification.contact.phone);
    } else if (notification.recipientType === 'agencyUser' && notification.user) {
      bookerInfo.name = notification.user.name;
      bookerInfo.role = notification.user.role;
    }

    return {
      already_booked: false,
      property: {
        id: notification.property.id,
        address: notification.property.address,
      },
      region: {
        code: region,
        label: REGION_LABELS[region],
      },
      // Legacy single-schedule support (for backwards compatibility)
      schedule: {
        id: notification.schedule.id,
        region: notification.schedule.region,
        region_label: REGION_LABELS[notification.schedule.region],
        schedule_date: notification.schedule.scheduleDate,
      },
      // New multi-date support
      schedules: schedulesWithSlots,
      // Booker information
      booker: bookerInfo,
      // Legacy contact field (for backwards compatibility)
      contact: {
        name: notification.contact?.name || notification.user?.name || null,
        phone: this.maskPhone(notification.contact?.phone),
        email: this.maskEmail(notification.recipientEmail),
      },
      // Legacy single-date slots (first schedule's slots for backwards compatibility)
      available_slots: schedulesWithSlots[0]?.slots || [],
    };
  },

  /**
   * Submit a booking (records who made the booking)
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

    // Check if the property already has processing tasks (inspection already scheduled)
    const processingTask = await prisma.task.findFirst({
      where: {
        propertyId: notification.propertyId,
        status: 'processing',
        isActive: true,
      },
    });

    if (processingTask) {
      throw new ConflictError('An inspection has already been scheduled for this property');
    }

    // Determine booker information from the notification
    const bookerType = notification.recipientType || 'contact';
    const bookedByUserId = notification.recipientType === 'agencyUser' ? notification.userId : null;
    const contactId = notification.recipientType === 'contact' ? notification.contactId : null;

    // Create booking with booker info
    const booking = await inspectionBookingRepository.create({
      slot_id: data.slot_id,
      property_id: notification.propertyId,
      contact_id: contactId,
      booked_by_user_id: bookedByUserId,
      booker_type: bookerType,
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
