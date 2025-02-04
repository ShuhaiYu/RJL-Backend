// controllers/agencyController.js
const { createAgency } = require('../models/agencyModel');
const { 
  createProperty, 
  getPropertyById, 
  getAllProperties, 
  getAllPropertiesByAgency 
} = require('../models/propertyModel');
const { 
  createTask, 
  getTaskById, 
  getAllTasks, 
  getAllTasksByAgency 
} = require('../models/taskModel');
const { getUserById } = require('../models/userModel');

module.exports = {
  // 创建机构（已实现）
  createAgency: async (req, res, next) => {
    try {
      const { agency_name, email, password, address, phone, logo } = req.body;
      const result = await createAgency({ agency_name, email, password, address, phone, logo });
      res.status(201).json({
        message: 'Agency created successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  // 列出所有房产（admin查询所有，agency仅查询自己）
  listProperties: async (req, res, next) => {
    try {
      if (req.user.role === 'admin') {
        const properties = await getAllProperties();
        return res.status(200).json(properties);
      } else if (req.user.role === 'agency') {
        // 查询用户记录以获得 agency_id
        const user = await getUserById(req.user.userId);
        const agency_id = user && user.agency_id;
        if (!agency_id) {
          return res.status(403).json({ message: '当前用户没有关联机构' });
        }
        const properties = await getAllPropertiesByAgency(agency_id);
        return res.status(200).json(properties);
      } else {
        return res.status(403).json({ message: '无权访问' });
      }
    } catch (err) {
      next(err);
    }
  },

  // 获取单个房产详情
  getPropertyDetail: async (req, res, next) => {
    try {
      const propertyId = req.params.id;
      const property = await getPropertyById(propertyId);
      if (!property) {
        return res.status(404).json({ message: '房产不存在' });
      }
      // 如果是 agency 用户，则验证房产是否属于该机构
      if (req.user.role === 'agency') {
        const user = await getUserById(req.user.userId);
        const agency_id = user && user.agency_id;
        if (!agency_id || property.agency_id !== agency_id) {
          return res.status(403).json({ message: '无权访问该房产' });
        }
      }
      res.status(200).json(property);
    } catch (err) {
      next(err);
    }
  },

  // 创建房产（如果是 agency 用户，自动归属当前机构；admin 可通过参数指定 agency_id）
  createProperty: async (req, res, next) => {
    try {
      const { name, address, agency_id } = req.body;
      let finalAgencyId = agency_id;
      if (req.user.role === 'agency') {
        const user = await getUserById(req.user.userId);
        if (!user || !user.agency_id) {
          return res.status(403).json({ message: '当前用户没有关联机构' });
        }
        finalAgencyId = user.agency_id;
      }
      const newProperty = await createProperty({ name, address, agency_id: finalAgencyId });
      res.status(201).json({
        message: '房产创建成功',
        data: newProperty,
      });
    } catch (err) {
      next(err);
    }
  },

  // 列出所有任务（admin查询所有，agency仅查询自己机构下任务）
  listTasks: async (req, res, next) => {
    try {
      if (req.user.role === 'admin') {
        const tasks = await getAllTasks();
        return res.status(200).json(tasks);
      } else if (req.user.role === 'agency') {
        const user = await getUserById(req.user.userId);
        const agency_id = user && user.agency_id;
        if (!agency_id) {
          return res.status(403).json({ message: '当前用户没有关联机构' });
        }
        const tasks = await getAllTasksByAgency(agency_id);
        return res.status(200).json(tasks);
      } else {
        return res.status(403).json({ message: '无权访问' });
      }
    } catch (err) {
      next(err);
    }
  },

  // 获取任务详情
  getTaskDetail: async (req, res, next) => {
    try {
      const taskId = req.params.id;
      const task = await getTaskById(taskId);
      if (!task) {
        return res.status(404).json({ message: '任务不存在' });
      }
      // 如果是 agency 用户，则验证任务所属房产是否属于该机构
      if (req.user.role === 'agency') {
        const user = await getUserById(req.user.userId);
        const agency_id = user && user.agency_id;
        const property = await getPropertyById(task.property_id);
        if (!property || !agency_id || property.agency_id !== agency_id) {
          return res.status(403).json({ message: '无权访问该任务' });
        }
      }
      res.status(200).json(task);
    } catch (err) {
      next(err);
    }
  },

  // 创建任务（需要验证任务所属房产归属当前机构；admin 可指定 property_id 属于哪个机构）
  createTask: async (req, res, next) => {
    try {
      const { property_id, due_date, task_name, task_description } = req.body;
      // 如果是 agency 用户，需要验证该房产是否属于当前机构
      if (req.user.role === 'agency') {
        const user = await getUserById(req.user.userId);
        const agency_id = user && user.agency_id;
        const property = await getPropertyById(property_id);
        if (!property || !agency_id || property.agency_id !== agency_id) {
          return res.status(403).json({ message: '无权为该房产创建任务' });
        }
      }
      const newTask = await createTask({ property_id, due_date, task_name, task_description });
      res.status(201).json({
        message: '任务创建成功',
        data: newTask,
      });
    } catch (err) {
      next(err);
    }
  },
};
