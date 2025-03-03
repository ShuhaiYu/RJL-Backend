// controllers/EmailController.js
const emailModel = require("../models/emailModel");
const propertyModel = require("../models/propertyModel");
const taskModel = require("../models/taskModel");
const contactModel = require("../models/contactModel");
const userModel = require("../models/userModel");
const agencyModel = require("../models/agencyModel");

const axios = require("axios");
const { getSystemSettings } = require("../models/systemSettingsModel");

async function formatAddress(address) {
  try {
    const settings = await getSystemSettings();
    if (!settings || !settings.google_map_key) {
      throw new Error("Google Map Key not configured");
    }
    const key = settings.google_map_key;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address
    )}&key=${key}`;
    const response = await axios.get(url);
    if (response.data.status === "OK") {
      // 返回格式化后的地址，取第一个结果
      return response.data.results[0].formatted_address;
    } else {
      throw new Error(response.data.status);
    }
  } catch (error) {
    console.error("formatAddress error:", error);
    return address; // 出错时返回原地址
  }
}

// test
// formatAddress("123 Main St, Melbourne VIC 3000").then(console.log);

/**
 * 从邮件正文中提取“租客”信息（tenantName / tenantPhone）
 * 兼容以下多种格式：
 *
 * 1) 块状：
 *    1st Tenant:
 *    Name: Yuwei Zeng
 *    Phone: 0434 643 145
 *
 * 2) 单行：
 *    Dikshu KAKKAR (Tenant) - 0466326000
 *
 * 3) 单行：
 *    Tenant Jason May (m) 0411 702 488
 *
 * 如果检测到多处，只返回第一个。若没找到，则返回 { tenantName: "", tenantPhone: "" }。
 */
function extractTenantInfo(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let tenantName = "";
  let tenantPhone = "";

  // ============ 第1步：尝试解析块状 "Tenant:" / "Name:" / "Phone:" 格式 ============

  // 状态机：先找到包含 "tenant:" 行 -> inTenantBlock=true
  // 然后若 inTenantBlock 时发现 "Name:" 就解析名字；发现 "Phone:" 就解析电话
  // 若找到一行既不是 Name 也不是 Phone，就结束
  let inTenantBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 找到 "Tenant:" 或 "tenant:" 行，进入 tenantBlock
    // 注意：有些可能是 "1st Tenant:"，所以用 includes 而不是 exact match
    if (!inTenantBlock && line.toLowerCase().includes("tenant:")) {
      inTenantBlock = true;
      continue;
    }

    if (inTenantBlock) {
      const nameMatch = line.match(/^Name:\s*(.*)$/i);
      if (nameMatch) {
        tenantName = nameMatch[1].trim();
        continue;
      }

      const phoneMatch = line.match(/^Phone:\s*(.*)$/i);
      if (phoneMatch) {
        // 去掉空格
        const rawPhone = phoneMatch[1].replace(/\s+/g, "");
        tenantPhone = rawPhone.trim();
        // 这里不 break，因为可能还在继续
        continue;
      }

      // 如果遇到既不是 Name 也不是 Phone，则结束 tenantBlock
      // 以免后续误解析到别的内容
      break;
    }
  }

  // 如果“块状”解析已经拿到 tenantPhone，就直接返回
  if (tenantPhone) {
    return { tenantName, tenantPhone };
  }

  // ============ 第2步：若没在块状解析到，就看看有没有单行包含 "tenant" + phone ============

  // 常见形式：
  // - "Dikshu KAKKAR (Tenant) - 0466326000"
  // - "Tenant Jason May (m) 0411 702 488"
  //
  // 我们先定义一个能匹配澳洲手机的正则(含空格)：/(\+61|0) ?4\d(?:[ \-]?\d){6,}/
  // 例如 "0466 326 000", "0411 702 488"
  const phoneRegex = /(\+61|0)\s?4\d(?:[ \-]?\d){6,}/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();

    // 如果这行包含 "tenant" 且能匹配手机，就进行解析
    if (line.includes("tenant")) {
      const phoneMatch = lines[i].match(phoneRegex);
      if (phoneMatch) {
        // 把空格去掉
        tenantPhone = phoneMatch[0].replace(/\s+/g, "");

        // 剩余部分当作 name
        // 先去掉 phone
        let namePart = lines[i].replace(phoneRegex, "").trim();

        // 再去掉一些噪音字符, 比如 " - "
        // 以及 "(Tenant)"、"tenant"
        // 这里给出一个示例做法
        namePart = namePart
          .replace(/-+/g, "")
          .replace(/\(tenant\)/i, "")
          .trim();

        // 如果有 "tenant" 这个词，也去掉
        namePart = namePart.replace(/tenant/gi, "").trim();

        tenantName = namePart || "Unknown";
        break;
      }
    }
  }

  // 返回结果
  return { tenantName, tenantPhone };
}

module.exports = {
  // 示例：列出所有邮件
  listEmails: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      const emails = await emailModel.listEmails(user);
      res.status(200).json(emails);
    } catch (error) {
      next(error);
    }
  },

  // 根据邮件内容自动创建房产、任务、联系人
  createPropertyByEmail: async (req, res, next) => {
    try {
      const { subject, from, textBody, htmlBody } = req.body;
      if (!textBody) {
        return res.status(400).json({ message: "Missing textBody." });
      }

      // 1) 判断是否在白名单或用户本身
      let user = null;
      let senderEmail = null;

      // 解析发件人
      const fromRegex = /^(.+?)\s*<(.*)>$/;
      const matchedFrom = (from || "").trim().match(fromRegex);
      if (matchedFrom) {
        senderEmail = matchedFrom[2].trim().toLowerCase();
      } else if ((from || "").includes("@")) {
        senderEmail = from.trim().toLowerCase();
      }

      // 如果没有 senderEmail，就直接跳过
      if (!senderEmail) {
        return res.status(200).json({
          message: "No sender email found. Skip creation.",
          createdList: [],
        });
      }

      // 1.1 看看是不是系统用户
      user = await userModel.getUserByEmail(senderEmail);

      let agency = null;
      if (user) {
        // 如果是系统用户，则拿 user 对应的 agency
        agency = await agencyModel.getAgencyByUserId(user.id);
      } else {
        // 如果不是系统用户，则看是不是在 agency 白名单
        agency = await agencyModel.getAgencyByWhiteListEmail(senderEmail);
      }

      // 如果既不是用户也不在白名单，则跳过
      if (!agency) {
        return res.status(200).json({
          message: "Email not in any agency whitelist. Skip creation.",
          createdList: [],
        });
      }

      // 如果 user 不存在，但 agency 存在 => 走“绑定 agency-admin账号”
      if (!user) {
        // 查找这个 agency 下是否有“agency-admin”角色
        const agencyAdmins = await userModel.getUsersByAgencyIdAndRole(
          agency.id,
          "agency-admin"
        );

        if (agencyAdmins.length > 0) {
          // 选第一个 agency-admin（或者根据业务逻辑选特定优先级）
          user = agencyAdmins[0];
        } else {
          // 如果确实找不到 agency-admin
          // 你可以再找别的角色（like 'admin'）或干脆报错
          return res.status(200).json({
            message:
              "No agency-admin user found for this agency. Cannot bind property to user_id.",
            createdList: [],
          });
        }
      }

      // 2) 提取地址
      const addressRegex =
        /\b\d+[A-Za-z\/]*[\w'\- ]*?(?:,\s*)?[A-Za-z'\- ]+(?:,\s*)?(VIC|NSW|QLD|ACT|TAS|NT|WA)\s*\d{4}\b/gi;
      const matches = textBody.match(addressRegex) || [];
      const uniqueAddresses = [...new Set(matches.map((m) => m.trim()))];

      if (uniqueAddresses.length === 0) {
        return res.status(200).json({
          message: "No address found in this email. Skip creation.",
          createdList: [],
        });
      }

      // 3) 解析联系人
      // ============ 解析租客信息 ============
      const { tenantName, tenantPhone } = extractTenantInfo(textBody);

      // 如果确实找到了一个租客电话
      console.log("Parsed tenant info:", { tenantName, tenantPhone });

      // 4) 开始对每个地址创建 property + tasks + ...
      const createdList = [];

      for (const address of uniqueAddresses) {
        // 先格式化地址
        const formattedAddress = await formatAddress(address);

        // 查或创建 Property
        let property = await propertyModel.getPropertyByAddress(
          formattedAddress
        );
        if (property && property.length > 0) {
          property = property[0];
        } else {
          property = await propertyModel.createProperty({
            address: formattedAddress,
            user_id: user ? user.id : null,
            agency_id: agency.id, // 新增
          });
        }

        // 5) 关键词 => tasksToCreate
        const textLower = textBody.toLowerCase();
        let tasksToCreate = [];

        let hasTask = false;
        if (textLower.includes("smoke")) {
          tasksToCreate.push({ name: "smoke alarm", repeatYears: 1 });
          hasTask = true;
        }
        if (textLower.includes("electric")) {
          if (textLower.includes("gas")) {
            tasksToCreate.push({ name: "gas & electric", repeatYears: 2 });
          } else {
            tasksToCreate.push({ name: "electric", repeatYears: 2 });
          }
          hasTask = true;
        }

        if (!hasTask && textLower.includes("safety check")) {
          tasksToCreate.push({ name: "smoke alarm", repeatYears: 1 });
          tasksToCreate.push({ name: "gas & electric", repeatYears: 2 });
        }

        const addressRecord = {
          address: formattedAddress,
          property,
          tasks: [],
          emails: [],
          contacts: [],
          warning: null, // 如果 property.user_id 对应的 agency != agency.id, 这里给warning
        };

        // 6) 如果 property.user_id 存在, 找出 propertyUser 对应 agency
        //    如果 != 传入的 agency.id => warning
        if (property.user_id) {
          const propUserAgency = await agencyModel.getAgencyByUserId(
            property.user_id
          );
          if (propUserAgency && propUserAgency.id !== agency.id) {
            addressRecord.warning = `Property belongs to agency ${propUserAgency.agency_name}, but email is from agency ${agency.agency_name}`;
          }
        }

        for (const t of tasksToCreate) {
          const repeatFrequencyStr =
            t.repeatYears === 1
              ? "1 year"
              : t.repeatYears > 1
              ? `${t.repeatYears} years`
              : null;

          // 先 createTask
          const newTask = await taskModel.createTask({
            property_id: property.id,
            due_date: null,
            task_name: t.name,
            task_description: `Auto-created from email: ${subject || ""}`,
            repeat_frequency: repeatFrequencyStr,
            type: t.name,
            status: "INCOMPLETE",
            email_id: null, // 之后更新
            agency_id: agency.id, // 新增
          });

          // 收集
          addressRecord.tasks.push(newTask);

          // 7) 插入 tenantContacts

          // create or get contact
          const existingContact =
            await contactModel.getContactByPhoneAndProperty(
              tenantPhone,
              property.id
            );
          // 这里 email 为空, 仅匹配 property
          // 也可以搞 getContactByPhoneAndProperty?
          if (!existingContact) {
            const newContact = await contactModel.createContact({
              name: tenantName || "Unknown",
              phone: tenantPhone,
              email: "",
              property_id: property.id,
            });
            addressRecord.contacts.push(newContact);
          } else {
            addressRecord.contacts.push(existingContact);
          }
        }

        // 全部任务创建完后，再创建一条 Email
        // 在插入之前先查重
        const existingEmail = await emailModel.getEmailByUniqueKey(
          subject || "No Subject",
          from || "Unknown Sender",
          property.id
        );

        let usedEmail = existingEmail;
        if (!existingEmail) {
          // 不存在 => 创建
          usedEmail = await emailModel.createEmailRecord({
            subject: subject || "No Subject",
            sender: from || "Unknown Sender",
            email_body: textBody,
            html: htmlBody || "",
            property_id: property.id,
            agency_id: agency.id,
          });
        }

        // 批量 updateTaskEmailId，把同一个 emailId 塞给所有新Task
        for (const newTask of addressRecord.tasks) {
          await taskModel.updateTaskEmailId(newTask.id, usedEmail.id);
        }

        createdList.push(addressRecord);
      }

      return res.status(201).json({
        message: "Email processed successfully",
        agency: agency.agency_name, // 记录是谁发
        createdCount: createdList.length,
        createdList,
      });
    } catch (error) {
      next(error);
    }
  },
};
