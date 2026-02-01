/**
 * System Settings Repository
 *
 * Data access layer for SystemSettings entity using Prisma.
 */

const prisma = require('../config/prisma');

const systemSettingsRepository = {
  /**
   * Get system settings (there should only be one row)
   */
  async get() {
    return prisma.systemSettings.findFirst();
  },

  /**
   * Get or create system settings
   */
  async getOrCreate() {
    let settings = await this.get();
    if (!settings) {
      settings = await prisma.systemSettings.create({
        data: {},
      });
    }
    return settings;
  },

  /**
   * Update system settings
   */
  async update(data) {
    const settings = await this.getOrCreate();

    const updateData = {};
    if (data.google_map_key !== undefined) updateData.googleMapKey = data.google_map_key;

    return prisma.systemSettings.update({
      where: { id: settings.id },
      data: updateData,
    });
  },

  /**
   * Get Google Maps API key
   */
  async getGoogleMapKey() {
    const settings = await this.get();
    return settings?.googleMapKey;
  },
};

module.exports = systemSettingsRepository;
