// controllers/agencyController.js
const { createAgency } = require('../models/agencyModel');
const { getAllProperties, getAllPropertiesByAgency, getPropertyById, createProperty, getPropertyByAddress, deleteProperty, updateProperty } = require('../models/propertyModel');
const { getAllTasks, getAllTasksByAgency, getTaskById, createTask, deleteTask, updateTask } = require('../models/taskModel');
const { getUserById } = require('../models/userModel');
const { createContact, getAllContacts, getContactById, updateContactDetail } = require('../models/contactModel');
const { createEmailRecord } = require('../models/emailModel');

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

  /**
   * POST /agency/create-property-by-email
   * @body {string} textBody - 邮件正文
   * @body {string} subject  - 邮件主题
   * @body {string} from     - 发件人（含名称与邮箱）
   */
  createPropertyByEmail: async (req, res, next) => {
    try {
      const { subject, from, textBody, htmlBody } = req.body;
      if (!textBody) {
        return res.status(400).json({ message: 'Missing textBody.' });
      }

      // 1) 定义地址正则
      //    以下只是示例，可根据实际情况改进
      const addressRegex = /\b\d+[A-Za-z\/]*[\w'\- ]*?(?:,\s*)?[A-Za-z'\- ]+(?:,\s*)?(VIC|NSW|QLD|ACT|TAS|NT|WA)\s*\d{4}\b/gi;

      // 2) 在正文中匹配所有地址
      const matches = textBody.match(addressRegex) || [];
      console.log('Address matches:', matches);

      // 3) 去重
      const uniqueAddresses = [...new Set(matches.map(m => m.trim()))];
      console.log('Unique addresses:', uniqueAddresses);

      // 如果一个地址都没有，直接返回，不创建任何东西
      if (uniqueAddresses.length === 0) {
        return res.status(200).json({
          message: 'No address found in this email. Skip creation.',
          createdList: []
        });
      }

      // 4) 解析出联系人信息 (from字段 + textBody 可能会用到)
      //    下面示例只演示发件人姓名和邮箱、电话
      let contactName = 'Unknown Contact';
      let contactEmail = 'N/A';
      const fromRegex = /^(.+?)\s*<(.*)>$/;
      const matchedFrom = (from || '').trim().match(fromRegex);
      if (matchedFrom) {
        contactName = matchedFrom[1].trim() || 'Unknown Contact';
        contactEmail = matchedFrom[2].trim() || 'N/A';
      } else {
        if ((from || '').includes('@')) {
          contactEmail = from;
        }
      }

      // 电话正则示例（澳洲号码）
      const phoneRegex = /\b(?:\+61|0)(?:[23478])(?:[\s-]?\d){7,9}\b/g;
      const phoneMatches = textBody.match(phoneRegex) || [];
      const contactPhone = phoneMatches.length > 0 ? phoneMatches[0] : 'N/A';

      // 5) 为每个地址循环处理
      const createdList = []; // 用来存放每个成功创建的 { propertyId, taskId, contactId, emailId } 信息

      for (const address of uniqueAddresses) {
        // 5.1 检查是否已存在
        const existingProperty = await getPropertyByAddress(address);
        if (existingProperty.length > 0) {
          console.log(`Property already exists for address: ${address}. Skip creation.`);
          continue; // 跳过
        }

        // 5.2 创建 Property
        const newProperty = await createProperty({
          name: 'Test Property', // 写死的 name 后续可替换
          address,
          agency_id: 8 // 写死的 agency_id 后续可替换
        });

        // 5.3 创建 Task（这里也可以基于正文来决定task_name/description）
        //     简单示例：
        let taskName = 'Auto-Generated Task';
        let taskDescription = 'No recognized task from email.';
        if (textBody.toLowerCase().includes('safety check')) {
          taskName = 'Safety Check';
          taskDescription = 'Mail indicates a safety check job.';
        }

        const newTask = await createTask({
          property_id: newProperty.id,
          due_date: null,
          task_name: taskName,
          task_description: taskDescription
        });

        // 5.4 创建 Contact（联系人），与 Task 关联
        const newContact = await createContact({
          name: contactName,
          phone: contactPhone,
          email: contactEmail,
          task_id: newTask.id
        });

        // 5.5 保存邮件到 Email 表
        const newEmail = await createEmailRecord({
          subject: subject || 'No Subject',
          sender: from || 'Unknown Sender',
          email_body: textBody || 'No Content',
          html: htmlBody || '',
          task_id: newTask.id
        });

        // 5.6 记录本次创建结果
        createdList.push({
          propertyId: newProperty.id,
          taskId: newTask.id,
          contactId: newContact.id,
          emailId: newEmail.id,
          address // 返回地址信息也可
        });
      }

      // 6) 返回结果
      return res.status(201).json({
        message: 'Email processed successfully.',
        createdCount: createdList.length,
        createdList
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
      // 如果是 agency 用户，则验证房产是否属于该机构
      if (req.user.role === 'agency') {
        const user = await getUserById(req.user.userId);
        const agency_id = user && user.agency_id;
        if (!agency_id || property.agency_id !== agency_id) {
          return res.status(403).json({ message: '无权访问该房产' });
        }
      }
      const updatedProperty = await updateProperty(propertyId, { name, address });
      res.status(200).json({
        message: '房产信息已更新',
        data: updatedProperty,
      });
    } catch (err) {
      next(err);
    }
  },

  // 删除房产
  deleteProperty: async (req, res, next) => {
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
      await deleteProperty(propertyId);
      res.status(200).json({ message: '房产已删除' });
    } catch (err) {
      next(err);
    }
  },

  // 更新任务信息
  updateTask: async (req, res, next) => {
    try {
      const taskId = req.params.id;
      const { due_date, task_name, task_description } = req.body;
      const task = await getTaskById(taskId);
      if (!task) {
        return res.status(404).json({ message: '任务不存在' });
      }
      // 如果是 agency 用户，则验证任务所属房产是否属于该机构
      if (req.user.role === 'agency') {
        const user = await getUserById(req.user.userId);
        const agency_id = user && user.agency_id;
        const property = await getPropertyById(property_id);
        if (!property || !agency_id || property.agency_id !== agency_id) {
          return res.status(403).json({ message: '无权访问该任务' });
        }
      }
      const updatedTask = await updateTask(taskId, { due_date, task_name, task_description });
      res.status(200).json({
        message: '任务信息已更新',
        data: updatedTask,
      });
    } catch (err) {
      next(err);
    }
  },

  // 删除任务
  deleteTask: async (req, res, next) => {
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
      await deleteTask(taskId);
      res.status(200).json({ message: '任务已删除' });
    } catch (err) {
      next(err);
    }
  },

  // 联系人信息
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

  // 更新联系人信息
  updateContact: async (req, res, next) => {
    try {
      const contactId = req.params.id;
      const { name, phone, email } = req.body;
      console.log('Updating contact:', contactId, name, phone, email);
      
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

  // 删除联系人
  deleteContact: async (req, res, next) => {
    try {
      const contactId = req.params.id;
      const contact = await getContactById(contactId);
      if (!contact) {
        return res.status(404).json({ message: '联系人不存在' });
      }
      await contact.destroy();
      res.status(200).json({ message: '联系人已删除' });
    } catch (err) {
      next(err);
    }
  },

  // 创建联系人
  createContact: async (req, res, next) => {
    try {
      const { name, phone, email, task_id } = req.body;
      const newContact = await createContact({ name, phone, email, task_id });
      res.status(201).json({
        message: '联系人创建成功',
        data: newContact,
      });
    } catch (err) {
      next(err);
    }
  },

};
