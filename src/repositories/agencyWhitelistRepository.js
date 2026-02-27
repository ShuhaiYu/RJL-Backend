/**
 * Agency Whitelist Repository
 *
 * Data access layer for AgencyWhitelist entity using Prisma.
 */

const prisma = require('../config/prisma');

function normalizeEmailAddress(emailAddress) {
  if (!emailAddress || typeof emailAddress !== 'string') return null;
  const normalized = emailAddress.trim().toLowerCase();
  return normalized || null;
}

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
    const normalizedEmail = normalizeEmailAddress(emailAddress);
    if (!normalizedEmail) return null;

    return prisma.agencyWhitelist.findFirst({
      where: {
        agencyId,
        OR: [
          { emailAddress: normalizedEmail },
          {
            emailAddress: {
              equals: normalizedEmail,
              mode: 'insensitive',
            },
          },
        ],
      },
    });
  },

  /**
   * Find agency by whitelisted email
   */
  async findAgencyByEmail(emailAddress) {
    const normalizedEmail = normalizeEmailAddress(emailAddress);
    if (!normalizedEmail) return null;

    let entry = await prisma.agencyWhitelist.findFirst({
      where: {
        OR: [
          { emailAddress: normalizedEmail },
          {
            emailAddress: {
              equals: normalizedEmail,
              mode: 'insensitive',
            },
          },
        ],
      },
      include: {
        agency: true,
      },
    });

    if (!entry) {
      const entries = await prisma.agencyWhitelist.findMany({
        include: {
          agency: true,
        },
      });
      entry = entries.find((item) => normalizeEmailAddress(item.emailAddress) === normalizedEmail) || null;
    }

    return entry?.agency;
  },

  /**
   * Check if email is whitelisted for any agency
   */
  async isEmailWhitelisted(emailAddress) {
    const normalizedEmail = normalizeEmailAddress(emailAddress);
    if (!normalizedEmail) return false;

    const count = await prisma.agencyWhitelist.count({
      where: {
        OR: [
          { emailAddress: normalizedEmail },
          {
            emailAddress: {
              equals: normalizedEmail,
              mode: 'insensitive',
            },
          },
        ],
      },
    });

    if (count > 0) return true;

    const entries = await prisma.agencyWhitelist.findMany({
      select: { emailAddress: true },
    });
    return entries.some((entry) => normalizeEmailAddress(entry.emailAddress) === normalizedEmail);
  },

  /**
   * Create a new whitelist entry
   */
  async create(data) {
    const normalizedEmail = normalizeEmailAddress(data.email_address);
    if (!normalizedEmail) {
      throw new Error('Invalid whitelist email address');
    }

    return prisma.agencyWhitelist.create({
      data: {
        agencyId: data.agency_id,
        emailAddress: normalizedEmail,
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
