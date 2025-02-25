// controllers/TaskController.js
const taskModel = require("../models/taskModel");
const propertyModel = require("../models/propertyModel");
const userModel = require("../models/userModel");

module.exports = {
  // 创建任务
  createTask: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id)
        return res.status(403).json({ message: "No associated agency" });
      const { property_id, due_date, task_name, task_description, repeat_frequency, status, type, agency_id } = req.body;
      const newTask = await taskModel.createTask({
        property_id,
        due_date,
        task_name,
        task_description,
        repeat_frequency,
        status,
        type,
        email_id: null,
        agency_id: agency_id || user.agency_id,
      });
      res.status(201).json({ message: "Task created successfully", data: newTask });
    } catch (error) {
      next(error);
    }
  },

  // 获取任务详情
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

  // 更新任务
  updateTask: async (req, res, next) => {
    try {
      const taskId = req.params.id;
      const updatedTask = await taskModel.updateTask(taskId, req.body);
      res.status(200).json({ message: "Task updated successfully", data: updatedTask });
    } catch (error) {
      next(error);
    }
  },

  // 列出所有任务（或仅列出今日任务）
  listTasks: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      const tasks = await taskModel.listTasks(user);
      res.status(200).json(tasks);
    } catch (error) {
      next(error);
    }
  },

  // 列出今日任务
  listTodayTasks: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      const tasks = await taskModel.listTodayTasks(user);
      res.status(200).json(tasks);
    } catch (error) {
      next(error);
    }
  },

  // 列出即将到期的任务和Processing状态的任务
  listAgencyTasks: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      const dueSoonTasks = await taskModel.listDueSoonTasks(user);
      const processingTasks = await taskModel.listProcessingTasks(user);
      res.status(200).json({
        dueSoon: dueSoonTasks,
        processing: processingTasks,
      });
    } catch (error) {
      next(error);
    }
    
  },

  // 删除任务（如果业务允许删除）
  deleteTask: async (req, res, next) => {
    try {
      const taskId = req.params.id;
      const deletedTask = await taskModel.deleteTask(taskId);
      res.status(200).json({ message: "Task deleted successfully", data: deletedTask });
    } catch (error) {
      next(error);
    }
  },
};
