// controllers/agencyUserController.js

const userModel = require("../models/userModel");
const propertyModel = require("../models/propertyModel");
const taskModel = require("../models/taskModel");
const emailModel = require("../models/emailModel");


module.exports = {
  // ----- 自己（用户）信息管理 -----
  getMyUserDetail: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  },

  updateMyUserDetail: async (req, res, next) => {
    try {
      const user_id = req.user.user_id;
      const updatedUser = await userModel.updateUser(user_id, req.body);
      res
        .status(200)
        .json({ message: "User updated successfully", data: updatedUser });
    } catch (error) {
      next(error);
    }
  },

  // ----- 房产管理（仅操作本机构房产） -----
  listMyProperties: async (req, res, next) => {
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

  // ----- 任务管理（仅操作本机构任务） -----
  listMyTasks: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id)
        return res.status(403).json({ message: "No associated agency" });
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

  createTask: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id)
        return res.status(403).json({ message: "No associated agency" });
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
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id)
        return res.status(403).json({ message: "No associated agency" });
      const property = await propertyModel.getPropertyById(task.property_id);
      if (!property || property.agency_id !== user.agency_id) {
        return res
          .status(403)
          .json({ message: "Unauthorized to view this task" });
      }
      res.status(200).json(task);
    } catch (error) {
      next(error);
    }
  },

  updateTask: async (req, res, next) => {
    try {
      const taskId = req.params.id;
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id)
        return res.status(403).json({ message: "No associated agency" });
      const task = await taskModel.getTaskById(taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });
      const property = await propertyModel.getPropertyById(task.property_id);
      if (!property || property.agency_id !== user.agency_id) {
        return res
          .status(403)
          .json({ message: "Unauthorized to update this task" });
      }
      const updatedTask = await taskModel.updateTask(taskId, req.body);
      res
        .status(200)
        .json({ message: "Task updated successfully", data: updatedTask });
    } catch (error) {
      next(error);
    }
  },

  deleteTask: async (req, res, next) => {
    try {
      const taskId = req.params.id;
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id)
        return res.status(403).json({ message: "No associated agency" });
      const task = await taskModel.getTaskById(taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });
      const property = await propertyModel.getPropertyById(task.property_id);
      if (!property || property.agency_id !== user.agency_id) {
        return res
          .status(403)
          .json({ message: "Unauthorized to delete this task" });
      }
      const deletedTask = await taskModel.deleteTask(taskId);
      res
        .status(200)
        .json({ message: "Task deleted successfully", data: deletedTask });
    } catch (error) {
      next(error);
    }
  },

  // ----- 邮件管理 -----
    listEmails: async (req, res, next) => {
      try {
        const user = await userModel.getUserById(req.user.user_id);
        // 从数据库中获取所有邮件
        const emails = await emailModel.listEmails(user);
        res.status(200).json(emails);
      }
      catch (error) {
        next(error);
      }
    },
};
