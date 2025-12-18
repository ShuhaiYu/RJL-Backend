/**
 * Contact Service
 *
 * Business logic for Contact entity.
 */

const contactRepository = require('../repositories/contactRepository');
const propertyRepository = require('../repositories/propertyRepository');
const { NotFoundError, ForbiddenError } = require('../lib/errors');
const { USER_ROLES } = require('../config/constants');
const { createPagination } = require('../lib/response');

const contactService = {
  /**
   * Get contact by ID
   */
  async getContactById(id, requestingUser) {
    const contact = await contactRepository.findByIdWithRelations(id);
    if (!contact) {
      throw new NotFoundError('Contact');
    }

    // Check access
    if (!this.canAccessContact(requestingUser, contact)) {
      throw new ForbiddenError('Cannot access this contact');
    }

    return this.formatContact(contact);
  },

  /**
   * List contacts with filters
   */
  async listContacts(requestingUser, { search, page = 1, limit = 50, property_id }) {
    const skip = (page - 1) * limit;

    // Build filters based on role
    const filters = {
      isActive: true,
      skip,
      take: limit,
      search,
      propertyId: property_id,
    };

    const { contacts, total } = await contactRepository.findAll(filters);

    // Filter by access
    const accessibleContacts = [];
    for (const contact of contacts) {
      const fullContact = await contactRepository.findByIdWithRelations(contact.id);
      if (this.canAccessContact(requestingUser, fullContact)) {
        accessibleContacts.push(this.formatContact(fullContact));
      }
    }

    return {
      contacts: accessibleContacts,
      pagination: createPagination(page, limit, total),
    };
  },

  /**
   * Get contacts by property ID
   */
  async getContactsByPropertyId(propertyId, requestingUser) {
    const property = await propertyRepository.findByIdWithRelations(propertyId);
    if (!property) {
      throw new NotFoundError('Property');
    }

    if (!this.canAccessProperty(requestingUser, property)) {
      throw new ForbiddenError('Cannot access this property');
    }

    const contacts = await contactRepository.findByPropertyId(propertyId);
    return contacts.map(this.formatContact);
  },

  /**
   * Create a new contact
   */
  async createContact(data, requestingUser) {
    // Verify property access
    const property = await propertyRepository.findByIdWithRelations(data.property_id);
    if (!property) {
      throw new NotFoundError('Property');
    }

    if (!this.canAccessProperty(requestingUser, property)) {
      throw new ForbiddenError('Cannot create contact for this property');
    }

    const contact = await contactRepository.create(data);
    return contactRepository.findByIdWithRelations(contact.id);
  },

  /**
   * Update a contact
   */
  async updateContact(id, data, requestingUser) {
    const contact = await contactRepository.findByIdWithRelations(id);
    if (!contact) {
      throw new NotFoundError('Contact');
    }

    // Check access
    if (!this.canAccessContact(requestingUser, contact)) {
      throw new ForbiddenError('Cannot modify this contact');
    }

    // If changing property, verify access
    if (data.property_id && data.property_id !== contact.propertyId) {
      const newProperty = await propertyRepository.findByIdWithRelations(data.property_id);
      if (!newProperty) {
        throw new NotFoundError('Property');
      }
      if (!this.canAccessProperty(requestingUser, newProperty)) {
        throw new ForbiddenError('Cannot move contact to this property');
      }
    }

    await contactRepository.update(id, data);
    return contactRepository.findByIdWithRelations(id);
  },

  /**
   * Delete a contact (soft delete)
   */
  async deleteContact(id, requestingUser) {
    const contact = await contactRepository.findByIdWithRelations(id);
    if (!contact) {
      throw new NotFoundError('Contact');
    }

    // Check access
    if (!this.canAccessContact(requestingUser, contact)) {
      throw new ForbiddenError('Cannot delete this contact');
    }

    return contactRepository.softDelete(id);
  },

  /**
   * Check if user can access contact
   */
  canAccessContact(requestingUser, contact) {
    if (['superuser', 'admin'].includes(requestingUser.role)) return true;

    const property = contact.property;
    if (!property) return false;

    if (requestingUser.role === USER_ROLES.AGENCY_ADMIN) {
      return property.user?.agencyId === requestingUser.agency_id;
    }
    return property.userId === requestingUser.user_id;
  },

  /**
   * Check if user can access property
   */
  canAccessProperty(requestingUser, property) {
    if (['superuser', 'admin'].includes(requestingUser.role)) return true;
    if (requestingUser.role === USER_ROLES.AGENCY_ADMIN) {
      return property.user?.agencyId === requestingUser.agency_id;
    }
    return property.userId === requestingUser.user_id;
  },

  /**
   * Format contact for API response
   */
  formatContact(contact) {
    const formatted = {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      property_id: contact.propertyId,
      is_active: contact.isActive,
      created_at: contact.createdAt,
      updated_at: contact.updatedAt,
    };

    if (contact.property) {
      formatted.property = {
        id: contact.property.id,
        address: contact.property.address,
      };
    }

    return formatted;
  },
};

module.exports = contactService;
