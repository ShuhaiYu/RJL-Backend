/**
 * Contact Controller
 *
 * HTTP layer for Contact endpoints. Delegates business logic to contactService.
 */

const contactService = require('../services/contactService');
const { sendSuccess } = require('../lib/response');

module.exports = {
  /**
   * Create a new contact
   * POST /api/contacts
   */
  createContact: async (req, res, next) => {
    try {
      const contact = await contactService.createContact(req.body, req.user);

      sendSuccess(res, {
        statusCode: 201,
        message: 'Contact created successfully',
        data: contactService.formatContact(contact),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get contact by ID
   * GET /api/contacts/:id
   */
  getContactDetail: async (req, res, next) => {
    try {
      const contact = await contactService.getContactById(
        parseInt(req.params.id, 10),
        req.user
      );

      sendSuccess(res, {
        data: contact,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update a contact
   * PUT /api/contacts/:id
   */
  updateContact: async (req, res, next) => {
    try {
      const contact = await contactService.updateContact(
        parseInt(req.params.id, 10),
        req.body,
        req.user
      );

      sendSuccess(res, {
        message: 'Contact updated successfully',
        data: contactService.formatContact(contact),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List contacts
   * GET /api/contacts
   */
  listContacts: async (req, res, next) => {
    try {
      const { search, page, limit, property_id } = req.query;
      const result = await contactService.listContacts(req.user, {
        search,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 50,
        property_id: property_id ? parseInt(property_id, 10) : undefined,
      });

      sendSuccess(res, {
        data: result.contacts,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete a contact (soft delete)
   * DELETE /api/contacts/:id
   */
  deleteContact: async (req, res, next) => {
    try {
      await contactService.deleteContact(parseInt(req.params.id, 10), req.user);

      sendSuccess(res, {
        message: 'Contact deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },
};
