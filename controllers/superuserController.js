// controllers/superuserController.js

const userModel = require('../models/userModel');
const agencyModel = require('../models/agencyModel');
const propertyModel = require('../models/propertyModel');
const taskModel = require('../models/taskModel');
const contactModel = require('../models/contactModel');

module.exports = {
  // ----- 用户管理 -----
  createUser: async (req, res, next) => {
    try {
      const { email, name, password, role, agency_id } = req.body;
      const newUser = await userModel.insertUser({ email, name, password, role, agency_id });
      res.status(201).json({ message: 'User created successfully', data: newUser });
    } catch (error) {
      next(error);
    }
  },

  getUserDetail: async (req, res, next) => {
    try {
      const user_id = req.params.id;
      const user = await userModel.getUserById(user_id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  },

  updateUser: async (req, res, next) => {
    try {
      const user_id = req.params.id;
      const updatedUser = await userModel.updateUser(user_id, req.body);
      res.status(200).json({ message: 'User updated successfully', data: updatedUser });
    } catch (error) {
      next(error);
    }
  },

  deleteUser: async (req, res, next) => {
    try {
      const user_id = req.params.id;
      const deletedUser = await userModel.deleteUser(user_id);
      res.status(200).json({ message: 'User (soft) deleted successfully', data: deletedUser });
    } catch (error) {
      next(error);
    }
  },

  listUsers: async (req, res, next) => {
    try {
      const users = await userModel.listUsers(req.user);
      res.status(200).json(users);
    } catch (error) {
      next(error);
    }
  },

  // ----- 机构管理 -----
  createAgency: async (req, res, next) => {
    try {
      const { agency_name, address, phone, logo } = req.body;
      const newAgency = await agencyModel.createAgency({ agency_name, address, phone, logo });
      res.status(201).json({ message: 'Agency created successfully', data: newAgency });
    } catch (error) {
      next(error);
    }
  },

  getAgencyDetail: async (req, res, next) => {
    try {
      const agencyId = req.params.id;
      const agency = await agencyModel.getAgencyByAgencyId(agencyId);
      if (!agency) return res.status(404).json({ message: 'Agency not found' });
      res.status(200).json(agency);
    } catch (error) {
      next(error);
    }
  },

  updateAgency: async (req, res, next) => {
    try {
      const agencyId = req.params.id;
      const updatedAgency = await agencyModel.updateAgency(agencyId, req.body);
      res.status(200).json({ message: 'Agency updated successfully', data: updatedAgency });
    } catch (error) {
      next(error);
    }
  },

  deleteAgency: async (req, res, next) => {
    try {
      const agencyId = req.params.id;
      const deletedAgency = await agencyModel.deleteAgency(agencyId);
      res.status(200).json({ message: 'Agency deleted successfully', data: deletedAgency });
    } catch (error) {
      next(error);
    }
  },

  listAgencies: async (req, res, next) => {
    try {
      const agencies = await agencyModel.listAgencies();
      res.status(200).json(agencies);
    } catch (error) {
      next(error);
    }
  },

  // ----- 房产管理 -----
  createProperty: async (req, res, next) => {
    try {
      const { name, address, agency_id } = req.body;
      const newProperty = await propertyModel.createProperty({ name, address, agency_id });
      res.status(201).json({ message: 'Property created successfully', data: newProperty });
    } catch (error) {
      next(error);
    }
  },

  getPropertyDetail: async (req, res, next) => {
    try {
      const propertyId = req.params.id;
      const property = await propertyModel.getPropertyById(propertyId);
      if (!property) return res.status(404).json({ message: 'Property not found' });
      res.status(200).json(property);
    } catch (error) {
      next(error);
    }
  },

  updateProperty: async (req, res, next) => {
    try {
      const propertyId = req.params.id;
      const updatedProperty = await propertyModel.updateProperty(propertyId, req.body);
      res.status(200).json({ message: 'Property updated successfully', data: updatedProperty });
    } catch (error) {
      next(error);
    }
  },

  deleteProperty: async (req, res, next) => {
    try {
      const propertyId = req.params.id;
      const deletedProperty = await propertyModel.deleteProperty(propertyId);
      res.status(200).json({ message: 'Property deleted successfully', data: deletedProperty });
    } catch (error) {
      next(error);
    }
  },

  listProperties: async (req, res, next) => {
    try {
      const properties = await propertyModel.getAllProperties();
      res.status(200).json(properties);
    } catch (error) {
      next(error);
    }
  },

  // ----- 任务管理 -----
  createTask: async (req, res, next) => {
    try {
      const { property_id, due_date, task_name, task_description, repeat_frequency } = req.body;
      const newTask = await taskModel.createTask({ property_id, due_date, task_name, task_description, repeat_frequency });
      res.status(201).json({ message: 'Task created successfully', data: newTask });
    } catch (error) {
      next(error);
    }
  },

  getTaskDetail: async (req, res, next) => {
    try {
      const taskId = req.params.id;
      const task = await taskModel.getTaskById(taskId);
      if (!task) return res.status(404).json({ message: 'Task not found' });
      res.status(200).json(task);
    } catch (error) {
      next(error);
    }
  },

  updateTask: async (req, res, next) => {
    try {
      const taskId = req.params.id;
      const updatedTask = await taskModel.updateTask(taskId, req.body);
      res.status(200).json({ message: 'Task updated successfully', data: updatedTask });
    } catch (error) {
      next(error);
    }
  },

  deleteTask: async (req, res, next) => {
    try {
      const taskId = req.params.id;
      const deletedTask = await taskModel.deleteTask(taskId);
      res.status(200).json({ message: 'Task deleted successfully', data: deletedTask });
    } catch (error) {
      next(error);
    }
  },

  listTasks: async (req, res, next) => {
    try {
      const tasks = await taskModel.getAllTasks();
      res.status(200).json(tasks);
    } catch (error) {
      next(error);
    }
  },

  // ----- 联系人管理 -----
  createContact: async (req, res, next) => {
    try {
      const { name, phone, email, task_id } = req.body;
      const newContact = await contactModel.createContact({ name, phone, email, task_id });
      res.status(201).json({ message: 'Contact created successfully', data: newContact });
    } catch (error) {
      next(error);
    }
  },

  getContactDetail: async (req, res, next) => {
    try {
      const contactId = req.params.id;
      const contact = await contactModel.getContactById(contactId);
      if (!contact) return res.status(404).json({ message: 'Contact not found' });
      res.status(200).json(contact);
    } catch (error) {
      next(error);
    }
  },

  updateContact: async (req, res, next) => {
    try {
      const contactId = req.params.id;
      const updatedContact = await contactModel.updateContactDetail(contactId, req.body);
      res.status(200).json({ message: 'Contact updated successfully', data: updatedContact });
    } catch (error) {
      next(error);
    }
  },

  deleteContact: async (req, res, next) => {
    try {
      const contactId = req.params.id;
      const deletedContact = await contactModel.deleteContact(contactId);
      res.status(200).json({ message: 'Contact deleted successfully', data: deletedContact });
    } catch (error) {
      next(error);
    }
  },

  listContacts: async (req, res, next) => {
    try {
      const contacts = await contactModel.listContacts();
      res.status(200).json(contacts);
    } catch (error) {
      next(error);
    }
  },
};
