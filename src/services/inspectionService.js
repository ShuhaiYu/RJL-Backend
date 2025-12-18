/**
 * Inspection Service
 *
 * Business logic for Inspection Config and Schedule entities.
 */

const inspectionConfigRepository = require('../repositories/inspectionConfigRepository');
const inspectionScheduleRepository = require('../repositories/inspectionScheduleRepository');
const inspectionSlotRepository = require('../repositories/inspectionSlotRepository');
const propertyRepository = require('../repositories/propertyRepository');
const contactRepository = require('../repositories/contactRepository');
const userRepository = require('../repositories/userRepository');
const { NotFoundError, ValidationError, ConflictError } = require('../lib/errors');
const { REGION, REGION_LABELS, SCHEDULE_STATUS } = require('../config/constants');

const inspectionService = {
  // ==================== Config Methods ====================

  /**
   * Get all region configs
   */
  async getAllConfigs() {
    const configs = await inspectionConfigRepository.findAll();

    // Return all regions, with defaults for unconfigured ones
    const allRegions = Object.values(REGION);
    const configMap = new Map(configs.map((c) => [c.region, c]));

    return allRegions.map((region) => {
      const config = configMap.get(region);
      if (config) {
        return this.formatConfig(config);
      }
      // Return default config for unconfigured regions
      return {
        region,
        region_label: REGION_LABELS[region],
        start_time: null,
        end_time: null,
        slot_duration: null,
        max_capacity: 1,
        is_active: false,
        is_configured: false,
      };
    });
  },

  /**
   * Get config by region
   */
  async getConfigByRegion(region) {
    const config = await inspectionConfigRepository.findByRegion(region);
    if (!config) {
      // Return default/empty config
      return {
        region,
        region_label: REGION_LABELS[region],
        start_time: null,
        end_time: null,
        slot_duration: null,
        max_capacity: 1,
        is_active: false,
        is_configured: false,
      };
    }
    return this.formatConfig(config);
  },

  /**
   * Update config by region (upsert)
   */
  async updateConfigByRegion(region, data) {
    // Validate region
    if (!Object.values(REGION).includes(region)) {
      throw new ValidationError('Invalid region');
    }

    const config = await inspectionConfigRepository.upsert(region, data);
    return this.formatConfig(config);
  },

  /**
   * Format config for API response
   */
  formatConfig(config) {
    return {
      id: config.id,
      region: config.region,
      region_label: REGION_LABELS[config.region],
      start_time: config.startTime,
      end_time: config.endTime,
      slot_duration: config.slotDuration,
      max_capacity: config.maxCapacity,
      is_active: config.isActive,
      is_configured: true,
      created_at: config.createdAt,
      updated_at: config.updatedAt,
    };
  },

  // ==================== Slot Generation Utilities ====================

  /**
   * Parse time string to minutes since midnight
   * @param {string} timeStr - Time in HH:MM format
   * @returns {number} Minutes since midnight
   */
  parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  },

  /**
   * Format minutes to time string
   * @param {number} minutes - Minutes since midnight
   * @returns {string} Time in HH:MM format
   */
  formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  },

  /**
   * Generate time slots based on config
   * @param {string} startTime - Start time in HH:MM format
   * @param {string} endTime - End time in HH:MM format
   * @param {number} slotDuration - Duration per slot in minutes
   * @param {number} maxCapacity - Max bookings per slot
   * @returns {Array} Array of slot objects
   */
  generateSlots(startTime, endTime, slotDuration, maxCapacity) {
    const slots = [];
    let current = this.parseTime(startTime);
    const end = this.parseTime(endTime);

    while (current + slotDuration <= end) {
      slots.push({
        startTime: this.formatTime(current),
        endTime: this.formatTime(current + slotDuration),
        maxCapacity,
        currentBookings: 0,
        isAvailable: true,
      });
      current += slotDuration;
    }

    return slots;
  },

  // ==================== Schedule Methods ====================

  /**
   * List schedules with filters
   */
  async listSchedules(filters) {
    const result = await inspectionScheduleRepository.findAll(filters);

    return {
      data: result.schedules.map((schedule) => this.formatSchedule(schedule)),
      pagination: result.pagination,
    };
  },

  /**
   * Get schedule by ID
   */
  async getScheduleById(id) {
    const schedule = await inspectionScheduleRepository.findById(id);
    if (!schedule) {
      throw new NotFoundError('Schedule not found');
    }
    return this.formatScheduleDetail(schedule);
  },

  /**
   * Create a new schedule
   */
  async createSchedule(data, userId) {
    // Validate region
    if (!Object.values(REGION).includes(data.region)) {
      throw new ValidationError('Invalid region');
    }

    // Check for existing schedule on the same date/region
    const existing = await inspectionScheduleRepository.findByRegionAndDate(
      data.region,
      data.schedule_date
    );
    if (existing) {
      throw new ConflictError('A schedule already exists for this region and date');
    }

    // Get config for region to use defaults
    const config = await inspectionConfigRepository.findByRegion(data.region);

    // Use provided values or defaults from config
    const startTime = data.start_time || (config?.startTime);
    const endTime = data.end_time || (config?.endTime);
    const slotDuration = data.slot_duration || (config?.slotDuration);
    const maxCapacity = data.max_capacity || (config?.maxCapacity) || 1;

    if (!startTime || !endTime || !slotDuration) {
      throw new ValidationError(
        `Time settings are required for ${data.region} region. Please configure the region first (set start_time, end_time, and slot_duration) before creating a schedule.`
      );
    }

    // Validate time settings
    const startMinutes = this.parseTime(startTime);
    const endMinutes = this.parseTime(endTime);

    if (endMinutes <= startMinutes) {
      throw new ValidationError(
        `Invalid time range: end_time (${endTime}) must be after start_time (${startTime})`
      );
    }

    if (slotDuration < 15) {
      throw new ValidationError(
        `Invalid slot duration: ${slotDuration} minutes is too short. Minimum is 15 minutes.`
      );
    }

    if (endMinutes - startMinutes < slotDuration) {
      throw new ValidationError(
        `Time range (${startTime} to ${endTime}) is too short for a ${slotDuration} minute slot. Please extend the time range or reduce slot duration.`
      );
    }

    // Generate slots
    const slots = this.generateSlots(startTime, endTime, slotDuration, maxCapacity);

    if (slots.length === 0) {
      throw new ValidationError(
        `Cannot generate time slots with current settings: ${startTime} to ${endTime}, ${slotDuration} min slots. Please check your time configuration.`
      );
    }

    // Create schedule with slots
    const schedule = await inspectionScheduleRepository.create(
      {
        ...data,
        start_time: startTime,
        end_time: endTime,
        slot_duration: slotDuration,
        max_capacity: maxCapacity,
        created_by: userId,
      },
      slots
    );

    return this.formatScheduleDetail(schedule);
  },

  /**
   * Update schedule
   */
  async updateSchedule(id, data) {
    const schedule = await inspectionScheduleRepository.findById(id);
    if (!schedule) {
      throw new NotFoundError('Schedule not found');
    }

    const updated = await inspectionScheduleRepository.update(id, data);
    return this.formatScheduleDetail(updated);
  },

  /**
   * Delete schedule (soft delete)
   */
  async deleteSchedule(id) {
    const schedule = await inspectionScheduleRepository.findById(id);
    if (!schedule) {
      throw new NotFoundError('Schedule not found');
    }

    await inspectionScheduleRepository.softDelete(id);
    return { message: 'Schedule deleted successfully' };
  },

  /**
   * Get properties for a schedule's region with recipient info
   */
  async getScheduleProperties(scheduleId) {
    const schedule = await inspectionScheduleRepository.findById(scheduleId);
    if (!schedule) {
      throw new NotFoundError('Schedule not found');
    }

    // Get properties in the same region
    const result = await propertyRepository.findAll({
      region: schedule.region,
      take: 1000, // Get all properties
    });

    // Process each property to get recipient info
    const propertiesWithRecipient = await Promise.all(
      result.properties.map(async (property) => {
        // Determine recipient: 1) Property contacts, 2) Agency users
        let recipient = null;
        let recipientType = null;

        // Try property contacts first
        const contacts = await contactRepository.findByPropertyId(property.id);
        const contactWithEmail = contacts?.find((c) => c.email);

        if (contactWithEmail) {
          recipient = {
            name: contactWithEmail.name,
            email: contactWithEmail.email,
          };
          recipientType = 'contact';
        } else {
          // Fallback: agency users
          const agencyId = property.user?.agency?.id || property.user?.agencyId;
          if (agencyId) {
            const agencyUsers = await userRepository.findByAgencyIdWithPriority(agencyId);
            const agencyUserWithEmail = agencyUsers.find((u) => u.email);
            if (agencyUserWithEmail) {
              recipient = {
                name: agencyUserWithEmail.name,
                email: agencyUserWithEmail.email,
                role: agencyUserWithEmail.role,
              };
              recipientType = 'agencyUser';
            }
          }
        }

        return {
          id: property.id,
          address: property.address,
          region: property.region,
          agency_id: property.user?.agency?.id,
          agency_name: property.user?.agency?.name,
          has_notification: schedule.notifications?.some(
            (n) => n.propertyId === property.id
          ),
          recipient,
          recipient_type: recipientType,
        };
      })
    );

    return propertiesWithRecipient;
  },

  /**
   * Format schedule for list view
   */
  formatSchedule(schedule) {
    return {
      id: schedule.id,
      region: schedule.region,
      region_label: REGION_LABELS[schedule.region],
      schedule_date: schedule.scheduleDate,
      start_time: schedule.startTime,
      end_time: schedule.endTime,
      slot_duration: schedule.slotDuration,
      max_capacity: schedule.maxCapacity,
      status: schedule.status,
      note: schedule.note,
      slots_count: schedule._count?.slots || 0,
      notifications_count: schedule._count?.notifications || 0,
      created_by: schedule.creator,
      created_at: schedule.createdAt,
    };
  },

  /**
   * Format schedule for detail view
   */
  formatScheduleDetail(schedule) {
    return {
      id: schedule.id,
      region: schedule.region,
      region_label: REGION_LABELS[schedule.region],
      schedule_date: schedule.scheduleDate,
      start_time: schedule.startTime,
      end_time: schedule.endTime,
      slot_duration: schedule.slotDuration,
      max_capacity: schedule.maxCapacity,
      status: schedule.status,
      note: schedule.note,
      created_by: schedule.creator,
      created_at: schedule.createdAt,
      updated_at: schedule.updatedAt,
      slots: schedule.slots?.map((slot) => ({
        id: slot.id,
        start_time: slot.startTime,
        end_time: slot.endTime,
        max_capacity: slot.maxCapacity,
        current_bookings: slot.currentBookings || slot._count?.bookings || 0,
        is_available: slot.isAvailable,
      })),
      notifications: schedule.notifications?.map((n) => ({
        id: n.id,
        property_id: n.propertyId,
        property_address: n.property?.address,
        contact_id: n.contactId,
        contact_name: n.contact?.name,
        recipient_email: n.recipientEmail,
        status: n.status,
        sent_at: n.sentAt,
      })),
    };
  },
};

module.exports = inspectionService;
