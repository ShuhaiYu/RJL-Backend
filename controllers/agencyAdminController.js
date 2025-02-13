// controllers/agencyAdminController.js

const userModel = require('../models/userModel');
const agencyModel = require('../models/agencyModel');
const propertyModel = require('../models/propertyModel');
const taskModel = require('../models/taskModel');
const { get } = require('../routes/adminRoutes');

module.exports = {
  // ----- 自己（用户）信息管理 -----
  getMyUserDetail: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  },

  updateMyUserDetail: async (req, res, next) => {
    try {
      const user_id = req.user.user_id;
      const updatedUser = await userModel.updateUser(user_id, req.body);
      res.status(200).json({ message: 'User updated successfully', data: updatedUser });
    } catch (error) {
      next(error);
    }
  },

  // ----- 自己所属机构管理 -----
  getMyAgencyDetail: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id) return res.status(404).json({ message: 'Agency not found' });
      const agency = await agencyModel.getAgencyByAgencyId(user.agency_id);
      if (!agency) return res.status(404).json({ message: 'Agency not found' });
      res.status(200).json(agency);
    } catch (error) {
      next(error);
    }
  },

  updateMyAgencyDetail: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id) return res.status(404).json({ message: 'Agency not found' });
      const updatedAgency = await agencyModel.updateAgency(user.agency_id, req.body);
      res.status(200).json({ message: 'Agency updated successfully', data: updatedAgency });
    } catch (error) {
      next(error);
    }
  },

  // ----- 房产管理（仅管理本机构下的房产） -----
  listMyProperties: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id) return res.status(403).json({ message: 'No associated agency' });
      const properties = await propertyModel.listProperties(user);
      res.status(200).json(properties);
    } catch (error) {
      next(error);
    }
  },

  getMyPropertyDetail: async (req, res, next) => {
    try {
      const propertyId = req.params.id;
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id) return res.status(403).json({ message: 'No associated agency' });
      const property = await propertyModel.getPropertyById(propertyId);
      res.status(200).json(property);
    } catch (error) {
      next(error);
    }
  },

  createProperty: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id) return res.status(403).json({ message: 'No associated agency' });
      const { name, address } = req.body;
      const newProperty = await propertyModel.createProperty({ name, address, agency_id: user.agency_id });
      res.status(201).json({ message: 'Property created successfully', data: newProperty });
    } catch (error) {
      next(error);
    }
  },

  updateProperty: async (req, res, next) => {
    try {
      const propertyId = req.params.id;
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id) return res.status(403).json({ message: 'No associated agency' });
      const property = await propertyModel.getPropertyById(propertyId);
      if (!property || property.agency_id !== user.agency_id) {
        return res.status(403).json({ message: 'Unauthorized to update this property' });
      }
      const updatedProperty = await propertyModel.updateProperty(propertyId, req.body);
      res.status(200).json({ message: 'Property updated successfully', data: updatedProperty });
    } catch (error) {
      next(error);
    }
  },

  deleteProperty: async (req, res, next) => {
    try {
      const propertyId = req.params.id;
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id) return res.status(403).json({ message: 'No associated agency' });
      const property = await propertyModel.getPropertyById(propertyId);
      if (!property || property.agency_id !== user.agency_id) {
        return res.status(403).json({ message: 'Unauthorized to delete this property' });
      }
      const deletedProperty = await propertyModel.deleteProperty(propertyId);
      res.status(200).json({ message: 'Property deleted successfully', data: deletedProperty });
    } catch (error) {
      next(error);
    }
  },

  // ----- 任务管理（仅管理本机构下的任务） -----
  listMyTasks: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id) return res.status(403).json({ message: 'No associated agency' });
      const tasks = await taskModel.listTasks(user);
      res.status(200).json(tasks);
    } catch (error) {
      next(error);
    }
  },

  getMyTaskDetail: async (req, res, next) => {
    try {
      const taskId = req.params.id;
      const task = await taskModel.getTaskById(taskId);
      res.status(200).json(task);
    } catch (error) {
      next(error);
    }
  },

  createTask: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id) return res.status(403).json({ message: 'No associated agency' });
      const { property_id, due_date, task_name, task_description, repeat_frequency } = req.body;
      // 检查该房产是否属于本机构
      const property = await propertyModel.getPropertyById(property_id);
      if (!property || property.agency_id !== user.agency_id) {
        return res.status(403).json({ message: 'Unauthorized to create task for this property' });
      }
      const newTask = await taskModel.createTask({ property_id, due_date, task_name, task_description, repeat_frequency });
      res.status(201).json({ message: 'Task created successfully', data: newTask });
    } catch (error) {
      next(error);
    }
  },

  updateTask: async (req, res, next) => {
    try {
      const taskId = req.params.id;
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id) return res.status(403).json({ message: 'No associated agency' });
      const task = await taskModel.getTaskById(taskId);
      if (!task) return res.status(404).json({ message: 'Task not found' });
      const property = await propertyModel.getPropertyById(task.property_id);
      if (!property || property.agency_id !== user.agency_id) {
        return res.status(403).json({ message: 'Unauthorized to update this task' });
      }
      const updatedTask = await taskModel.updateTask(taskId, req.body);
      res.status(200).json({ message: 'Task updated successfully', data: updatedTask });
    } catch (error) {
      next(error);
    }
  },

  deleteTask: async (req, res, next) => {
    try {
      const taskId = req.params.id;
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id) return res.status(403).json({ message: 'No associated agency' });
      const task = await taskModel.getTaskById(taskId);
      if (!task) return res.status(404).json({ message: 'Task not found' });
      const property = await propertyModel.getPropertyById(task.property_id);
      if (!property || property.agency_id !== user.agency_id) {
        return res.status(403).json({ message: 'Unauthorized to delete this task' });
      }
      const deletedTask = await taskModel.deleteTask(taskId);
      res.status(200).json({ message: 'Task deleted successfully', data: deletedTask });
    } catch (error) {
      next(error);
    }
  },
};
