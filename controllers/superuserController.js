// controllers/superuserController.js

const userModel = require("../models/userModel");
const agencyModel = require("../models/agencyModel");
const propertyModel = require("../models/propertyModel");
const taskModel = require("../models/taskModel");
const contactModel = require("../models/contactModel");
const emailModel = require("../models/emailModel");

module.exports = {
  // ----- 用户管理 -----
  createUser: async (req, res, next) => {
    try {
      const { email, name, password, role, agency_id } = req.body;
      const newUser = await userModel.insertUser({
        email,
        name,
        password,
        role,
        agency_id,
      });
      // 为新用户分配权限（admin 新建的 agency-admin 用户权限）
      // 权限列表：agency (read:6, update:7), user (create:1, read:2, update:3),
      // property (create:9, read:10, update:11), task (create:13, read:14, update:15),
      // contact (create:17, read:18, update:19)
      const permissionIds = [6, 7, 1, 2, 3, 9, 10, 11, 13, 14, 15, 17, 18, 19];
      await Promise.all(
        permissionIds.map((permissionId) =>
          userModel.createUserPermission(newUser.id, permissionId)
        )
      );
      
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

  deleteUser: async (req, res, next) => {
    try {
      const user_id = req.params.id;
      const deletedUser = await userModel.deleteUser(user_id);
      res.status(200).json({
        message: "User (soft) deleted successfully",
        data: deletedUser,
      });
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
      const newAgency = await agencyModel.createAgency({
        agency_name,
        address,
        phone,
        logo,
      });
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

  deleteAgency: async (req, res, next) => {
    try {
      const agencyId = req.params.id;
      const deletedAgency = await agencyModel.deleteAgency(agencyId);
      res
        .status(200)
        .json({ message: "Agency deleted successfully", data: deletedAgency });
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

  deleteProperty: async (req, res, next) => {
    try {
      const propertyId = req.params.id;
      const deletedProperty = await propertyModel.deleteProperty(propertyId);
      res.status(200).json({
        message: "Property deleted successfully",
        data: deletedProperty,
      });
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

  deleteTask: async (req, res, next) => {
    try {
      const taskId = req.params.id;
      const deletedTask = await taskModel.deleteTask(taskId);
      res
        .status(200)
        .json({ message: "Task deleted successfully", data: deletedTask });
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

  listTodayTasks: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      const tasks = await taskModel.listTodayTasks(user);
      res.status(200).json(tasks);
    } catch (error) {
      next(error);
    }
  },

  // ----- 联系人管理 -----
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
      const updatedContact = await contactModel.updateContactDetail(
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

  deleteContact: async (req, res, next) => {
    try {
      const contactId = req.params.id;
      const deletedContact = await contactModel.deleteContact(contactId);
      res.status(200).json({
        message: "Contact deleted successfully",
        data: deletedContact,
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
        return res.status(400).json({ message: "Missing textBody." });
      }

      // 1) 定义地址正则
      const addressRegex =
        /\b\d+[A-Za-z\/]*[\w'\- ]*?(?:,\s*)?[A-Za-z'\- ]+(?:,\s*)?(VIC|NSW|QLD|ACT|TAS|NT|WA)\s*\d{4}\b/gi;

      // 2) 在正文中匹配所有地址
      const matches = textBody.match(addressRegex) || [];
      console.log("Address matches:", matches);

      // 3) 去重
      const uniqueAddresses = [...new Set(matches.map((m) => m.trim()))];
      console.log("Unique addresses:", uniqueAddresses);

      // 如果一个地址都没有，直接返回
      if (uniqueAddresses.length === 0) {
        return res.status(200).json({
          message: "No address found in this email. Skip creation.",
          createdList: [],
        });
      }

      // 4) 解析出联系人信息
      let contactName = "Unknown Contact";
      let contactEmail = "N/A";
      const fromRegex = /^(.+?)\s*<(.*)>$/;
      const matchedFrom = (from || "").trim().match(fromRegex);
      if (matchedFrom) {
        contactName = matchedFrom[1].trim() || "Unknown Contact";
        contactEmail = matchedFrom[2].trim() || "N/A";
      } else {
        if ((from || "").includes("@")) {
          contactEmail = from;
        }
      }

      // 电话正则示例
      const phoneRegex = /\b(?:\+61|0)(?:[23478])(?:[\s-]?\d){7,9}\b/g;
      const phoneMatches = textBody.match(phoneRegex) || [];
      const contactPhone = phoneMatches.length > 0 ? phoneMatches[0] : "N/A";

      // 5) 为每个地址循环处理
      const createdList = [];

      for (const address of uniqueAddresses) {
        // 新增：根据 contactEmail 在 user 表查找 userId
        let userId = null;
        if (contactEmail && contactEmail !== "N/A") {
          const existingUser = await userModel.getUserByEmail(contactEmail);
          if (existingUser) {
            userId = existingUser.id;
          }
        }

        // 检查该地址对应的房产是否存在
        let property;
        const existingProperty = await propertyModel.getPropertyByAddress(
          address
        );
        if (existingProperty && existingProperty.length > 0) {
          console.log(
            `Property already exists for address: ${address}. Creating task under existing property.`
          );
          property = existingProperty[0];
        } else {
          // 房产不存在则创建新的房产
          property = await propertyModel.createProperty({
            address,
            user_id: userId, // 如果没找到就是 null
          });
        }

        // 创建 Task（示例：如果正文包含关键词 "safety check"）
        let taskName = "Auto-Generated Task";
        let taskDescription = "No recognized task from email.";
        if (textBody.toLowerCase().includes("safety check")) {
          taskName = "Safety Check";
          taskDescription = "Mail indicates a safety check job.";
        }

        const newTask = await taskModel.createTask({
          property_id: property.id,
          due_date: null,
          task_name: taskName,
          task_description: taskDescription,
          type: "auto-generated",
          status: "unknown",
        });

        // 创建 Contact（联系人）
        const newContact = await contactModel.createContact({
          name: contactName,
          phone: contactPhone,
          email: contactEmail,
          task_id: newTask.id,
        });

        // 保存邮件到 Email 表
        const newEmail = await emailModel.createEmailRecord({
          subject: subject || "No Subject",
          sender: from || "Unknown Sender",
          email_body: textBody || "No Content",
          html: htmlBody || "",
          task_id: newTask.id,
          property_id: property.id,
        });

        // 记录结果
        createdList.push({
          propertyId: property.id,
          taskId: newTask.id,
          contactId: newContact.id,
          emailId: newEmail.id,
          address,
        });
      }

      // 6) 返回结果
      return res.status(201).json({
        message: "Email processed successfully.",
        createdCount: createdList.length,
        createdList,
      });
    } catch (err) {
      next(err);
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
