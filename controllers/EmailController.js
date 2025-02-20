// controllers/EmailController.js
const emailModel = require("../models/emailModel");
const propertyModel = require("../models/propertyModel");
const taskModel = require("../models/taskModel");
const contactModel = require("../models/contactModel");
const userModel = require("../models/userModel");

module.exports = {
  // 列出所有邮件
  listEmails: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      const emails = await emailModel.listEmails(user);
      res.status(200).json(emails);
    } catch (error) {
      next(error);
    }
  },

  // 根据邮件内容自动创建房产、任务、联系人（示例接口）
  createPropertyByEmail: async (req, res, next) => {
    try {
      const { subject, from, textBody, htmlBody } = req.body;
      if (!textBody) {
        return res.status(400).json({ message: "Missing textBody." });
      }

      // 示例：提取地址、联系人、电话等信息
      const addressRegex = /\b\d+[A-Za-z\/]*[\w'\- ]*?(?:,\s*)?[A-Za-z'\- ]+(?:,\s*)?(VIC|NSW|QLD|ACT|TAS|NT|WA)\s*\d{4}\b/gi;
      const matches = textBody.match(addressRegex) || [];
      const uniqueAddresses = [...new Set(matches.map(m => m.trim()))];

      if (uniqueAddresses.length === 0) {
        return res.status(200).json({
          message: "No address found in this email. Skip creation.",
          createdList: [],
        });
      }

      // 解析发件人信息（示例）
      let contactName = "Unknown Contact";
      let contactEmail = "N/A";
      const fromRegex = /^(.+?)\s*<(.*)>$/;
      const matchedFrom = (from || "").trim().match(fromRegex);
      if (matchedFrom) {
        contactName = matchedFrom[1].trim() || "Unknown Contact";
        contactEmail = matchedFrom[2].trim() || "N/A";
      } else if ((from || "").includes("@")) {
        contactEmail = from;
      }

      // 示例：电话提取
      const phoneRegex = /\b(?:\+61|0)(?:[23478])(?:[\s-]?\d){7,9}\b/g;
      const phoneMatches = textBody.match(phoneRegex) || [];
      const contactPhone = phoneMatches.length > 0 ? phoneMatches[0] : "N/A";

      const createdList = [];
      for (const address of uniqueAddresses) {
        // 检查房产是否已存在
        let property = await propertyModel.getPropertyByAddress(address);
        if (property && property.length > 0) {
          property = property[0];
        } else {
          property = await propertyModel.createProperty({ address, user_id: null });
        }

        // 创建任务（根据关键词自动判断任务类型）
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

        // 创建联系人
        const newContact = await contactModel.createContact({
          name: contactName,
          phone: contactPhone,
          email: contactEmail,
          task_id: newTask.id,
        });

        // 保存邮件记录
        const newEmail = await emailModel.createEmailRecord({
          subject: subject || "No Subject",
          sender: from || "Unknown Sender",
          email_body: textBody || "No Content",
          html: htmlBody || "",
          task_id: newTask.id,
          property_id: property.id,
        });

        createdList.push({
          propertyId: property.id,
          taskId: newTask.id,
          contactId: newContact.id,
          emailId: newEmail.id,
          address,
        });
      }

      return res.status(201).json({
        message: "Email processed successfully.",
        createdCount: createdList.length,
        createdList,
      });
    } catch (err) {
      next(err);
    }
  },
};
