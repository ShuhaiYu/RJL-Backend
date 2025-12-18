/**
 * Agency Whitelist Repository
 *
 * Data access layer for AgencyWhitelist entity using Prisma.
 */

const prisma = require('../config/prisma');

const agencyWhitelistRepository = {
  /**
   * Find whitelist entry by ID
   */
  async findById(id) {
    return prisma.agencyWhitelist.findUnique({
      where: { id },
      include: {
        agency: true,
      },
    });
  },

  /**
   * Find all whitelist entries for an agency
   */
  async findByAgencyId(agencyId) {
    return prisma.agencyWhitelist.findMany({
      where: { agencyId },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Find whitelist entry by email and agency
   */
  async findByEmailAndAgency(emailAddress, agencyId) {
    return prisma.agencyWhitelist.findFirst({
      where: {
        emailAddress,
        agencyId,
      },
    });
  },

  /**
   * Find agency by whitelisted email
   */
  async findAgencyByEmail(emailAddress) {
    const entry = await prisma.agencyWhitelist.findFirst({
      where: { emailAddress },
      include: {
        agency: true,
      },
    });
    return entry?.agency;
  },

  /**
   * Check if email is whitelisted for any agency
   */
  async isEmailWhitelisted(emailAddress) {
    const count = await prisma.agencyWhitelist.count({
      where: { emailAddress },
    });
    return count > 0;
  },

  /**
   * Create a new whitelist entry
   */
  async create(data) {
    return prisma.agencyWhitelist.create({
      data: {
        agencyId: data.agency_id,
        emailAddress: data.email_address,
      },
      include: {
        agency: true,
      },
    });
  },

  /**
   * Delete a whitelist entry
   */
  async delete(id) {
    return prisma.agencyWhitelist.delete({
      where: { id },
    });
  },

  /**
   * Delete all whitelist entries for an agency
   */
  async deleteByAgencyId(agencyId) {
    return prisma.agencyWhitelist.deleteMany({
      where: { agencyId },
    });
  },
};

module.exports = agencyWhitelistRepository;
