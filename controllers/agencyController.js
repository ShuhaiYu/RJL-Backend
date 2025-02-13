// controllers/agencyController.js

const { 
  createAgency: modelCreateAgency, 
  getAgencyByAgencyId, 
  listAgencies: modelListAgencies, 
  updateAgency, 
  deleteAgency 
} = require('../models/agencyModel');

const { 
  createProperty: modelCreateProperty, 
  getPropertyById, 
  getAllProperties, 
  getAllPropertiesByAgency, 
  getPropertyByAddress, 
  updateProperty: modelUpdateProperty, 
  deleteProperty: modelDeleteProperty 
} = require('../models/propertyModel');

const { 
  createTask: modelCreateTask, 
  getTaskById, 
  getAllTasks, 
  getAllTasksByAgency, 
  updateTask: modelUpdateTask, 
  deleteTask: modelDeleteTask 
} = require('../models/taskModel');

const { getUserById } = require('../models/userModel');

const { 
  createContact: modelCreateContact, 
  getAllContacts, 
  getContactById, 
  updateContactDetail, 
  deleteContact: modelDeleteContact 
} = require('../models/contactModel');

const { createEmailRecord } = require('../models/emailModel');

module.exports = {
  // ========= 机构相关 =========

  // 列出所有机构（供 admin 使用）
  listAgencies: async (req, res, next) => {
    try {
      const agencies = await modelListAgencies();
      res.status(200).json(agencies);
    } catch (err) {
      next(err);
    }
  },

  // 获取单个机构详情
  getAgencyDetail: async (req, res, next) => {
    try {
      const agencyId = req.params.id;
      const agency = await getAgencyByAgencyId(agencyId);
      if (!agency) {
        return res.status(404).json({ message: '中介不存在' });
      }
      res.status(200).json(agency);
    } catch (err) {
      next(err);
    }
  },

  // 创建机构（仅创建机构记录，用户创建逻辑在其它流程处理）
  createAgency: async (req, res, next) => {
    try {
      const { agency_name, email, password, address, phone, logo } = req.body;
      const result = await modelCreateAgency({ agency_name, email, password, address, phone, logo });
      res.status(201).json({
        message: 'Agency created successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  // 更新机构（例如冻结/解冻机构账号，通过修改 is_active 字段）
  updateAgency: async (req, res, next) => {
    try {
      const agencyId = req.params.id;
      // 客户端通过请求体传入 is_active（true/false）
      const { is_active } = req.body;
      // 调用模型层的 updateAgency 更新机构信息，此处假设字段名为 is_active
      const updatedAgency = await updateAgency(agencyId, { is_active: is_active });
      res.status(200).json({
        message: 'Agency status updated successfully',
        data: updatedAgency,
      });
    } catch (err) {
      next(err);
    }
  },

  // 删除机构（如果需要删除机构记录）
  deleteAgency: async (req, res, next) => {
    try {
      const agencyId = req.params.id;
      const deletedAgency = await deleteAgency(agencyId);
      res.status(200).json({
        message: 'Agency deleted successfully',
        data: deletedAgency,
      });
    } catch (err) {
      next(err);
    }
  },

  // ========= 房产相关 =========

  // 列出房产
  // admin/superuser 可查询所有激活房产，agency 仅查询自己机构下的房产
  listProperties: async (req, res, next) => {
    try {
      if (req.user.role === 'admin' || req.user.role === 'superuser') {
        const properties = await getAllProperties();
        return res.status(200).json(properties);
      } else if (req.user.role === 'agency') {
        const user = await getUserById(req.user.user_id);
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

  // 获取单个房产详情（同时返回关联的任务、邮件、联系人、机构信息）
  getPropertyDetail: async (req, res, next) => {
    try {
      const propertyId = req.params.id;
      const property = await getPropertyById(propertyId);
      if (!property) {
        return res.status(404).json({ message: '房产不存在' });
      }
      // 若当前用户是 agency，则验证该房产是否属于当前机构
      if (req.user.role === 'agency') {
        const user = await getUserById(req.user.user_id);
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

  // 创建房产
  // 若当前用户为 agency，则自动归属当前机构；admin 可通过请求体指定 agency_id
  createProperty: async (req, res, next) => {
    try {
      const { name, address, agency_id } = req.body;
      let finalAgencyId = agency_id;
      if (req.user.role === 'agency') {
        const user = await getUserById(req.user.user_id);
        if (!user || !user.agency_id) {
          return res.status(403).json({ message: '当前用户没有关联机构' });
        }
        finalAgencyId = user.agency_id;
      }
      const newProperty = await modelCreateProperty({ name, address, agency_id: finalAgencyId });
      res.status(201).json({
        message: '房产创建成功',
        data: newProperty,
      });
    } catch (err) {
      next(err);
    }
  },

  // 更新房产信息
  updateProperty: async (req, res, next) => {
    try {
      const propertyId = req.params.id;
      const { name, address } = req.body;
      const property = await getPropertyById(propertyId);
      if (!property) {
        return res.status(404).json({ message: '房产不存在' });
      }
      if (req.user.role === 'agency') {
        const user = await getUserById(req.user.user_id);
        const agency_id = user && user.agency_id;
        if (!agency_id || property.agency_id !== agency_id) {
          return res.status(403).json({ message: '无权访问该房产' });
        }
      }
      const updatedProperty = await modelUpdateProperty(propertyId, { name, address });
      res.status(200).json({
        message: '房产信息已更新',
        data: updatedProperty,
      });
    } catch (err) {
      next(err);
    }
  },

  // 删除房产（软删除：将 is_active 置为 false）
  deleteProperty: async (req, res, next) => {
    try {
      const propertyId = req.params.id;
      const property = await getPropertyById(propertyId);
      if (!property) {
        return res.status(404).json({ message: '房产不存在' });
      }
      if (req.user.role === 'agency') {
        const user = await getUserById(req.user.user_id);
        const agency_id = user && user.agency_id;
        if (!agency_id || property.agency_id !== agency_id) {
          return res.status(403).json({ message: '无权访问该房产' });
        }
      }
      const deletedProperty = await modelDeleteProperty(propertyId);
      res.status(200).json({ message: '房产已删除', data: deletedProperty });
    } catch (err) {
      next(err);
    }
  },

  // ========= 任务相关 =========

  // 列出任务
  // admin/superuser 查询所有激活任务，agency 查询其所属机构下的任务
  listTasks: async (req, res, next) => {
    try {
      if (req.user.role === 'admin' || req.user.role === 'superuser') {
        const tasks = await getAllTasks();
        return res.status(200).json(tasks);
      } else if (req.user.role === 'agency') {
        const user = await getUserById(req.user.user_id);
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
      if (req.user.role === 'agency') {
        const user = await getUserById(req.user.user_id);
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

  // 创建任务
  // 若当前用户为 agency，则验证房产归属；admin 可指定 property_id
  createTask: async (req, res, next) => {
    try {
      const { property_id, due_date, task_name, task_description } = req.body;
      if (req.user.role === 'agency') {
        const user = await getUserById(req.user.user_id);
        const agency_id = user && user.agency_id;
        const property = await getPropertyById(property_id);
        if (!property || !agency_id || property.agency_id !== agency_id) {
          return res.status(403).json({ message: '无权为该房产创建任务' });
        }
      }
      const newTask = await modelCreateTask({ property_id, due_date, task_name, task_description });
      res.status(201).json({
        message: '任务创建成功',
        data: newTask,
      });
    } catch (err) {
      next(err);
    }
  },

  // 更新任务
  updateTask: async (req, res, next) => {
    try {
      const taskId = req.params.id;
      const { due_date, task_name, task_description, repeat_frequency } = req.body;
      const task = await getTaskById(taskId);
      if (!task) {
        return res.status(404).json({ message: '任务不存在' });
      }
      if (req.user.role === 'agency') {
        const user = await getUserById(req.user.user_id);
        const agency_id = user && user.agency_id;
        const property = await getPropertyById(task.property_id);
        if (!property || !agency_id || property.agency_id !== agency_id) {
          return res.status(403).json({ message: '无权访问该任务' });
        }
      }
      const updatedTask = await modelUpdateTask(taskId, { due_date, task_name, task_description, repeat_frequency });
      res.status(200).json({
        message: '任务信息已更新',
        data: updatedTask,
      });
    } catch (err) {
      next(err);
    }
  },

  // 删除任务（软删除：将 is_active 置为 false）
  deleteTask: async (req, res, next) => {
    try {
      const taskId = req.params.id;
      const task = await getTaskById(taskId);
      if (!task) {
        return res.status(404).json({ message: '任务不存在' });
      }
      if (req.user.role === 'agency') {
        const user = await getUserById(req.user.user_id);
        const agency_id = user && user.agency_id;
        const property = await getPropertyById(task.property_id);
        if (!property || !agency_id || property.agency_id !== agency_id) {
          return res.status(403).json({ message: '无权访问该任务' });
        }
      }
      const deletedTask = await modelDeleteTask(taskId);
      res.status(200).json({ message: '任务已删除', data: deletedTask });
    } catch (err) {
      next(err);
    }
  },

  // ========= 联系人相关 =========

  // 列出联系人
  listContacts: async (req, res, next) => {
    try {
      const contacts = await getAllContacts();
      res.status(200).json(contacts);
    } catch (err) {
      next(err);
    }
  },

  // 获取联系人详情
  getContactDetail: async (req, res, next) => {
    try {
      const contactId = req.params.id;
      const contact = await getContactById(contactId);
      if (!contact) {
        return res.status(404).json({ message: '联系人不存在' });
      }
      res.status(200).json(contact);
    } catch (err) {
      next(err);
    }
  },

  // 创建联系人
  createContact: async (req, res, next) => {
    try {
      const { name, phone, email, task_id } = req.body;
      const newContact = await modelCreateContact({ name, phone, email, task_id });
      res.status(201).json({
        message: '联系人创建成功',
        data: newContact,
      });
    } catch (err) {
      next(err);
    }
  },

  // 更新联系人
  updateContact: async (req, res, next) => {
    try {
      const contactId = req.params.id;
      const { name, phone, email } = req.body;
      const contact = await getContactById(contactId);
      if (!contact) {
        return res.status(404).json({ message: '联系人不存在' });
      }
      const updatedContact = await updateContactDetail(contactId, { name, phone, email });
      res.status(200).json({
        message: '联系人信息已更新',
        data: updatedContact,
      });
    } catch (err) {
      next(err);
    }
  },

  // 删除联系人（软删除）
  deleteContact: async (req, res, next) => {
    try {
      const contactId = req.params.id;
      const contact = await getContactById(contactId);
      if (!contact) {
        return res.status(404).json({ message: '联系人不存在' });
      }
      const deletedContact = await modelDeleteContact(contactId);
      res.status(200).json({ message: '联系人已删除', data: deletedContact });
    } catch (err) {
      next(err);
    }
  },

  // ========= 通过邮件创建房产及相关记录 =========

  // 此接口根据邮件内容自动解析地址、联系人等信息创建房产、任务、联系人、邮件记录
  createPropertyByEmail: async (req, res, next) => {
    try {
      const { subject, from, textBody, htmlBody } = req.body;
      if (!textBody) {
        return res.status(400).json({ message: 'Missing textBody.' });
      }

      // 1) 定义地址正则（示例，按需调整）
      const addressRegex = /\b\d+[A-Za-z\/]*[\w'\- ]*?(?:,\s*)?[A-Za-z'\- ]+(?:,\s*)?(VIC|NSW|QLD|ACT|TAS|NT|WA)\s*\d{4}\b/gi;
      const matches = textBody.match(addressRegex) || [];
      const uniqueAddresses = [...new Set(matches.map(m => m.trim()))];

      if (uniqueAddresses.length === 0) {
        return res.status(200).json({
          message: 'No address found in this email. Skip creation.',
          createdList: []
        });
      }

      // 2) 从发件人信息解析联系人（简单示例）
      let contactName = 'Unknown Contact';
      let contactEmail = 'N/A';
      const fromRegex = /^(.+?)\s*<(.*)>$/;
      const matchedFrom = (from || '').trim().match(fromRegex);
      if (matchedFrom) {
        contactName = matchedFrom[1].trim() || 'Unknown Contact';
        contactEmail = matchedFrom[2].trim() || 'N/A';
      } else if ((from || '').includes('@')) {
        contactEmail = from;
      }
      const phoneRegex = /\b(?:\+61|0)(?:[23478])(?:[\s-]?\d){7,9}\b/g;
      const phoneMatches = textBody.match(phoneRegex) || [];
      const contactPhone = phoneMatches.length > 0 ? phoneMatches[0] : 'N/A';

      const createdList = [];

      for (const address of uniqueAddresses) {
        const existingProperty = await getPropertyByAddress(address);
        if (existingProperty.length > 0) {
          console.log(`Property already exists for address: ${address}. Skip creation.`);
          continue;
        }

        // 创建房产（此处 agency_id 固定示例，实际可根据业务传参）
        const newProperty = await modelCreateProperty({
          name: 'Test Property',
          address,
          agency_id: 8
        });

        // 创建任务，简单示例：根据邮件内容判断任务名称/描述
        let taskName = 'Auto-Generated Task';
        let taskDescription = 'No recognized task from email.';
        if (textBody.toLowerCase().includes('safety check')) {
          taskName = 'Safety Check';
          taskDescription = 'Mail indicates a safety check job.';
        }
        const newTask = await modelCreateTask({
          property_id: newProperty.id,
          due_date: null,
          task_name: taskName,
          task_description: taskDescription
        });

        // 创建联系人，与任务关联
        const newContact = await modelCreateContact({
          name: contactName,
          phone: contactPhone,
          email: contactEmail,
          task_id: newTask.id
        });

        // 保存邮件记录
        const newEmail = await createEmailRecord({
          subject: subject || 'No Subject',
          sender: from || 'Unknown Sender',
          email_body: textBody || 'No Content',
          html: htmlBody || '',
          task_id: newTask.id
        });

        createdList.push({
          propertyId: newProperty.id,
          taskId: newTask.id,
          contactId: newContact.id,
          emailId: newEmail.id,
          address
        });
      }

      return res.status(201).json({
        message: 'Email processed successfully.',
        createdCount: createdList.length,
        createdList
      });
    } catch (err) {
      next(err);
    }
  },
};
