/**
 * Inspection Booking Service
 *
 * Business logic for admin booking management.
 */

const prisma = require('../config/prisma');
const inspectionBookingRepository = require('../repositories/inspectionBookingRepository');
const inspectionSlotRepository = require('../repositories/inspectionSlotRepository');
const inspectionNotificationService = require('./inspectionNotificationService');
const { NotFoundError, ValidationError, ConflictError, ForbiddenError } = require('../lib/errors');
const { REGION_LABELS, BOOKING_STATUS } = require('../config/constants');
const logger = require('../lib/logger');

const inspectionBookingService = {
  // ==================== Permission & Scope Methods ====================

  /**
   * Build inspection scope based on user role
   * Superuser/Admin: No restrictions
   * Agency Admin/User: Filter by agency_id
   */
  buildInspectionScope(requestingUser) {
    if (['superuser', 'admin'].includes(requestingUser.role)) {
      return {}; // No restrictions
    }
    // Agency admin and agency user - filter by agency
    return { agencyId: requestingUser.agency_id };
  },

  /**
   * Check if user can manage (confirm/reject/reschedule) bookings
   * Only superuser and admin can manage bookings
   */
  canManageBooking(requestingUser) {
    return ['superuser', 'admin'].includes(requestingUser.role);
  },

  /**
   * Validate manage permission and throw if not allowed
   */
  requireManagePermission(requestingUser, action = 'manage') {
    if (!this.canManageBooking(requestingUser)) {
      throw new ForbiddenError(`No permission to ${action} inspection bookings`);
    }
  },

  /**
   * Check if user can access a specific booking
   * Admin/superuser can access all, agency users can only access bookings for their agency's properties
   */
  canAccessBooking(requestingUser, booking) {
    if (['superuser', 'admin'].includes(requestingUser.role)) {
      return true;
    }
    // For agency users, check if the property belongs to their agency
    const propertyAgencyId = booking.property?.user?.agencyId || booking.property?.user?.agency?.id;
    return propertyAgencyId === requestingUser.agency_id;
  },

  // ==================== Booking Methods ====================

  /**
   * List all bookings with filters
   * For agency users, only returns bookings for their agency's properties
   */
  async listBookings(filters, requestingUser) {
    const scope = this.buildInspectionScope(requestingUser);
    const result = await inspectionBookingRepository.findAll(filters, scope);
    return {
      data: result.bookings.map((booking) => this.formatBooking(booking)),
      pagination: result.pagination,
    };
  },

  /**
   * Get booking by ID
   * For agency users, validates they have access to the booking
   */
  async getBookingById(id, requestingUser) {
    const scope = this.buildInspectionScope(requestingUser);
    const booking = await inspectionBookingRepository.findById(id, scope);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }
    return this.formatBookingDetail(booking);
  },

  /**
   * Confirm a booking (auto-rejects other pending bookings for the same property)
   * Only superuser/admin can confirm bookings
   */
  async confirmBooking(id, data, requestingUser) {
    // Permission check - only superuser/admin can confirm
    this.requireManagePermission(requestingUser, 'confirm');

    const booking = await inspectionBookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (booking.status !== 'pending') {
      throw new ValidationError(`Cannot confirm a booking with status: ${booking.status}`);
    }

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Confirm the selected booking
      const confirmed = await inspectionBookingRepository.updateStatusWithTx(tx, id, 'confirmed', requestingUser.user_id);

      // 2. Find other pending bookings for the same property
      const otherPending = await tx.inspectionBooking.findMany({
        where: {
          propertyId: booking.propertyId,
          status: 'pending',
          id: { not: id },
        },
        include: {
          slot: true,
        },
      });

      // 3. Auto-reject other pending bookings (without sending notifications)
      const autoRejected = [];
      for (const other of otherPending) {
        // Decrement slot booking count
        await tx.inspectionSlot.update({
          where: { id: other.slotId },
          data: { currentBookings: { decrement: 1 } },
        });

        // Update status to rejected
        await tx.inspectionBooking.update({
          where: { id: other.id },
          data: { status: 'rejected' },
        });

        autoRejected.push(other.id);
        logger.info('Auto-rejected booking', {
          bookingId: other.id,
          propertyId: booking.propertyId,
          confirmedBookingId: id,
        });
      }

      // 4. Update all incomplete tasks for this property to processing with inspection date
      // Construct inspection datetime from schedule date + slot start time
      const scheduleDate = booking.slot.schedule.scheduleDate;
      const dateStr = scheduleDate instanceof Date
        ? scheduleDate.toISOString().split('T')[0]
        : new Date(scheduleDate).toISOString().split('T')[0];
      const slotStartTime = booking.slot.startTime; // e.g., "14:30"
      const inspectionDateTime = new Date(`${dateStr}T${slotStartTime}:00`);

      const taskUpdateResult = await tx.task.updateMany({
        where: {
          propertyId: booking.propertyId,
          status: 'incomplete',
          isActive: true,
        },
        data: {
          status: 'processing',
          inspectionDate: inspectionDateTime,
          updatedAt: new Date(),
        },
      });

      logger.info('Updated tasks to processing after booking confirmation', {
        bookingId: id,
        propertyId: booking.propertyId,
        tasksUpdated: taskUpdateResult.count,
        inspectionDateTime: inspectionDateTime.toISOString(),
      });

      return { confirmed, autoRejectedCount: autoRejected.length, tasksUpdated: taskUpdateResult.count };
    });

    // Send confirmation emails to ALL recipients if requested
    if (data.send_notification) {
      try {
        // Fetch the updated booking with full relations for email
        const fullBooking = await inspectionBookingRepository.findById(id);
        await inspectionNotificationService.sendConfirmationToAllRecipients(fullBooking);
      } catch (error) {
        logger.error('Failed to send confirmation emails', { bookingId: id, error: error.message });
        // Don't fail the confirmation if email fails
      }
    }

    // Fetch and return the confirmed booking
    const finalBooking = await inspectionBookingRepository.findById(id);
    const formatted = this.formatBookingDetail(finalBooking);
    formatted.auto_rejected_count = result.autoRejectedCount;
    formatted.tasks_updated = result.tasksUpdated;

    return formatted;
  },

  /**
   * Reject a booking
   * Only superuser/admin can reject bookings
   */
  async rejectBooking(id, data, requestingUser) {
    // Permission check - only superuser/admin can reject
    this.requireManagePermission(requestingUser, 'reject');

    const booking = await inspectionBookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (booking.status !== 'pending') {
      throw new ValidationError(`Cannot reject a booking with status: ${booking.status}`);
    }

    // Decrement slot booking count
    await inspectionSlotRepository.decrementBookings(booking.slotId);

    const updated = await inspectionBookingRepository.updateStatus(id, 'rejected', requestingUser.user_id);

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
   * Only superuser/admin can reschedule bookings
   */
  async rescheduleBooking(id, data, requestingUser) {
    // Permission check - only superuser/admin can reschedule
    this.requireManagePermission(requestingUser, 'reschedule');

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
    // Determine booker info
    let bookedBy = null;
    if (booking.bookerType) {
      if (booking.bookerType === 'agencyUser' && booking.bookedByUser) {
        bookedBy = {
          type: 'agencyUser',
          type_label: 'Agency Staff',
          name: booking.bookedByUser.name,
          email: booking.bookedByUser.email,
          role: booking.bookedByUser.role,
        };
      } else if (booking.bookerType === 'contact') {
        bookedBy = {
          type: 'contact',
          type_label: 'Property Contact',
          name: booking.contactName,
          email: booking.contactEmail,
        };
      }
    }

    return {
      id: booking.id,
      status: booking.status,
      contact_name: booking.contactName,
      contact_phone: booking.contactPhone,
      contact_email: booking.contactEmail,
      booker_type: booking.bookerType,
      booked_by: bookedBy,
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
    // Determine booker info
    let bookedBy = null;
    if (booking.bookerType) {
      if (booking.bookerType === 'agencyUser' && booking.bookedByUser) {
        bookedBy = {
          type: 'agencyUser',
          type_label: 'Agency Staff',
          name: booking.bookedByUser.name,
          email: booking.bookedByUser.email,
          role: booking.bookedByUser.role,
        };
      } else if (booking.bookerType === 'contact') {
        bookedBy = {
          type: 'contact',
          type_label: 'Property Contact',
          name: booking.contactName,
          email: booking.contactEmail,
        };
      }
    }

    return {
      id: booking.id,
      status: booking.status,
      contact_name: booking.contactName,
      contact_phone: booking.contactPhone,
      contact_email: booking.contactEmail,
      booker_type: booking.bookerType,
      booked_by: bookedBy,
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
