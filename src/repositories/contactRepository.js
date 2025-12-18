/**
 * Contact Repository
 *
 * Data access layer for Contact entity using Prisma.
 */

const prisma = require('../config/prisma');

const contactRepository = {
  /**
   * Find contact by ID
   */
  async findById(id) {
    return prisma.contact.findUnique({
      where: { id },
    });
  },

  /**
   * Find contact by ID with relations
   */
  async findByIdWithRelations(id) {
    return prisma.contact.findUnique({
      where: { id },
      include: {
        property: {
          include: {
            user: {
              include: {
                agency: true,
              },
            },
          },
        },
      },
    });
  },

  /**
   * Find all contacts with filters and pagination
   */
  async findAll({ isActive = true, propertyId, search, skip = 0, take = 50 }) {
    const where = {
      ...(isActive !== undefined && { isActive }),
      ...(propertyId && { propertyId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        include: {
          property: true,
        },
        skip,
        take,
        orderBy: { id: 'desc' },
      }),
      prisma.contact.count({ where }),
    ]);

    return { contacts, total };
  },

  /**
   * Find contacts by property ID
   */
  async findByPropertyId(propertyId) {
    return prisma.contact.findMany({
      where: {
        propertyId,
        isActive: true,
      },
    });
  },

  /**
   * Create a new contact
   */
  async create(data) {
    return prisma.contact.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        propertyId: data.property_id,
      },
      include: {
        property: true,
      },
    });
  },

  /**
   * Create many contacts (batch)
   */
  async createMany(contactsData) {
    const contacts = contactsData.map((data) => ({
      name: data.name,
      phone: data.phone,
      email: data.email,
      propertyId: data.property_id,
    }));

    return prisma.contact.createMany({
      data: contacts,
    });
  },

  /**
   * Update a contact
   */
  async update(id, data) {
    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.property_id !== undefined) updateData.propertyId = data.property_id;
    if (data.is_active !== undefined) updateData.isActive = data.is_active;

    return prisma.contact.update({
      where: { id },
      data: updateData,
    });
  },

  /**
   * Soft delete a contact
   */
  async softDelete(id) {
    return prisma.contact.update({
      where: { id },
      data: { isActive: false },
    });
  },

  /**
   * Delete contacts by property ID (used when property is deleted)
   */
  async softDeleteByPropertyId(propertyId) {
    return prisma.contact.updateMany({
      where: { propertyId },
      data: { isActive: false },
    });
  },
};

module.exports = contactRepository;
