// controllers/adminController.js

const userModel = require("../models/userModel");
const agencyModel = require("../models/agencyModel");
const propertyModel = require("../models/propertyModel");
const taskModel = require("../models/taskModel");
const contactModel = require("../models/contactModel");
const { getUserPermissions } = require("../models/userPermissionModel");

module.exports = {
  // ----- User Management (No deletion) -----
  createUser: async (req, res, next) => {
    try {
      const { email, name, password, role, agency_id } = req.body;
      const newUser = await userModel.createUser({
        email,
        name,
        password,
        role,
        agency_id,
      });
      res
        .status(201)
        .json({ message: "User created successfully", data: newUser });
    } catch (error) {
      next(error);
    }
  },

  getUserDetail: async (req, res, next) => {
    try {
      const user_id = req.params.id;
      const user = await userModel.getUserById(user_id);
      // 获取用户权限
      const permissions = await getUserPermissions(user_id);
      // 将权限附加到用户对象中
      user.permissions = permissions;
      if (!user) return res.status(404).json({ message: "User not found" });
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  },

  updateUser: async (req, res, next) => {
    try {
      const user_id = req.params.id;
      const updatedUser = await userModel.updateUser(user_id, req.body);
      res
        .status(200)
        .json({ message: "User updated successfully", data: updatedUser });
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

  // ----- Agency Management (No deletion) -----
  createAgency: async (req, res, next) => {
    try {
      const { agency_name, address, phone, logo } = req.body;
      const newAgency = await agencyModel.createAgency({
        agency_name,
        address,
        phone,
        logo,
      });
      const newUser = await userModel.createUser({
        email: req.body.email,
        name: req.body.name,
        password: req.body.password,
        role: "agency-admin",
        agency_id: newAgency.id,
      });
      newAgency.newUser = newUser;
      res
        .status(201)
        .json({ message: "Agency created successfully", data: newAgency });
    } catch (error) {
      next(error);
    }
  },

  getAgencyDetail: async (req, res, next) => {
    try {
      const agencyId = req.params.id;
      const agency = await agencyModel.getAgencyByAgencyId(agencyId);
      if (!agency) return res.status(404).json({ message: "Agency not found" });
      res.status(200).json(agency);
    } catch (error) {
      next(error);
    }
  },

  updateAgency: async (req, res, next) => {
    try {
      const agencyId = req.params.id;
      const updatedAgency = await agencyModel.updateAgency(agencyId, req.body);
      res
        .status(200)
        .json({ message: "Agency updated successfully", data: updatedAgency });
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

  // ----- Property Management (No deletion) -----
  createProperty: async (req, res, next) => {
    try {
      const { name, address, agency_id } = req.body;
      const newProperty = await propertyModel.createProperty({
        name,
        address,
        agency_id,
      });
      res
        .status(201)
        .json({ message: "Property created successfully", data: newProperty });
    } catch (error) {
      next(error);
    }
  },

  getPropertyDetail: async (req, res, next) => {
    try {
      const propertyId = req.params.id;
      const property = await propertyModel.getPropertyById(propertyId);
      if (!property)
        return res.status(404).json({ message: "Property not found" });
      res.status(200).json(property);
    } catch (error) {
      next(error);
    }
  },

  updateProperty: async (req, res, next) => {
    try {
      const propertyId = req.params.id;
      const updatedProperty = await propertyModel.updateProperty(
        propertyId,
        req.body
      );
      res.status(200).json({
        message: "Property updated successfully",
        data: updatedProperty,
      });
    } catch (error) {
      next(error);
    }
  },

  listProperties: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      const properties = await propertyModel.listProperties(user);
      // add agency data
      for (let i = 0; i < properties.length; i++) {
        const user = await userModel.getUserById(properties[i].user_id);
        const agency = await agencyModel.getAgencyByAgencyId(user.agency_id);
        properties[i].agency = agency;
      }

      res.status(200).json(properties);
    } catch (error) {
      next(error);
    }
  },

  // ----- Task Management (No deletion) -----
  createTask: async (req, res, next) => {
    try {
      const {
        property_id,
        due_date,
        task_name,
        task_description,
        repeat_frequency,
      } = req.body;
      const newTask = await taskModel.createTask({
        property_id,
        due_date,
        task_name,
        task_description,
        repeat_frequency,
      });
      res
        .status(201)
        .json({ message: "Task created successfully", data: newTask });
    } catch (error) {
      next(error);
    }
  },

  getTaskDetail: async (req, res, next) => {
    try {
      const taskId = req.params.id;
      const task = await taskModel.getTaskById(taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });
      res.status(200).json(task);
    } catch (error) {
      next(error);
    }
  },

  updateTask: async (req, res, next) => {
    try {
      const taskId = req.params.id;
      const updatedTask = await taskModel.updateTask(taskId, req.body);
      res
        .status(200)
        .json({ message: "Task updated successfully", data: updatedTask });
    } catch (error) {
      next(error);
    }
  },

  listTasks: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      const tasks = await taskModel.listTasks(user);
      res.status(200).json(tasks);
    } catch (error) {
      next(error);
    }
  },

  listTodayTasks: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      const tasks = await taskModel.listTodayTasks(user);
      res.status(200).json(tasks);
    } catch (error) {
      next(error);
    }
  },

  // ----- Contact Management (No deletion) -----
  createContact: async (req, res, next) => {
    try {
      const { name, phone, email, task_id } = req.body;
      const newContact = await contactModel.createContact({
        name,
        phone,
        email,
        task_id,
      });
      res
        .status(201)
        .json({ message: "Contact created successfully", data: newContact });
    } catch (error) {
      next(error);
    }
  },

  getContactDetail: async (req, res, next) => {
    try {
      const contactId = req.params.id;
      const contact = await contactModel.getContactById(contactId);
      if (!contact)
        return res.status(404).json({ message: "Contact not found" });
      res.status(200).json(contact);
    } catch (error) {
      next(error);
    }
  },

  updateContact: async (req, res, next) => {
    try {
      const contactId = req.params.id;
      const updatedContact = await contactModel.updateContact(
        contactId,
        req.body
      );
      res.status(200).json({
        message: "Contact updated successfully",
        data: updatedContact,
      });
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
