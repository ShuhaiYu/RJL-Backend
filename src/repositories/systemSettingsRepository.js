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
    if (data.email_host !== undefined) updateData.emailHost = data.email_host;
    if (data.google_map_key !== undefined) updateData.googleMapKey = data.google_map_key;
    if (data.imap_host !== undefined) updateData.imapHost = data.imap_host;
    if (data.imap_port !== undefined) updateData.imapPort = data.imap_port;
    if (data.imap_user !== undefined) updateData.imapUser = data.imap_user;
    if (data.imap_password !== undefined) updateData.imapPassword = data.imap_password;
    if (data.email_user !== undefined) updateData.emailUser = data.email_user;
    if (data.email_password !== undefined) updateData.emailPassword = data.email_password;

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

  /**
   * Get IMAP settings
   */
  async getImapSettings() {
    const settings = await this.get();
    if (!settings) return null;

    return {
      host: settings.imapHost,
      port: settings.imapPort,
      user: settings.imapUser,
      password: settings.imapPassword,
    };
  },

  /**
   * Get email settings
   */
  async getEmailSettings() {
    const settings = await this.get();
    if (!settings) return null;

    return {
      host: settings.emailHost,
      user: settings.emailUser,
      password: settings.emailPassword,
    };
  },
};

module.exports = systemSettingsRepository;
