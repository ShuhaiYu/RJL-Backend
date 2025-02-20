// controllers/ContactController.js
const contactModel = require("../models/contactModel");
const userModel = require("../models/userModel");

module.exports = {
  // 创建联系人
  createContact: async (req, res, next) => {
    try {
      const { name, phone, email, task_id } = req.body;
      const newContact = await contactModel.createContact({ name, phone, email, task_id });
      res.status(201).json({ message: "Contact created successfully", data: newContact });
    } catch (error) {
      next(error);
    }
  },

  // 获取联系人详情
  getContactDetail: async (req, res, next) => {
    try {
      const contactId = req.params.id;
      const contact = await contactModel.getContactById(contactId);
      if (!contact) return res.status(404).json({ message: "Contact not found" });
      res.status(200).json(contact);
    } catch (error) {
      next(error);
    }
  },

  // 更新联系人信息
  updateContact: async (req, res, next) => {
    try {
      const contactId = req.params.id;
      const updatedContact = await contactModel.updateContact(contactId, req.body);
      res.status(200).json({ message: "Contact updated successfully", data: updatedContact });
    } catch (error) {
      next(error);
    }
  },

  // 列出所有联系人
  listContacts: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      
      const contacts = await contactModel.listContacts(user);
      res.status(200).json(contacts);
    } catch (error) {
      next(error);
    }
  },

  // 删除联系人（如果允许删除）
  deleteContact: async (req, res, next) => {
    try {
      const contactId = req.params.id;
      const deletedContact = await contactModel.deleteContact(contactId);
      res.status(200).json({ message: "Contact deleted successfully", data: deletedContact });
    } catch (error) {
      next(error);
    }
  },
};
