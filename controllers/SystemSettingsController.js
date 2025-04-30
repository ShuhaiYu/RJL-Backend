const systemSettingsModel = require("../models/systemSettingsModel")
const agencyModel = require("../models/agencyModel");
const propertyModel = require("../models/propertyModel");
const taskModel = require("../models/taskModel");
const contactModel = require("../models/contactModel");

const dayjs = require("dayjs");

exports.getSettings = async (req, res, next) => {
  try {
    const settings = await systemSettingsModel.getSystemSettings();
    res.status(200).json(settings);
  } catch (error) {
    next(error);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    // 只允许超级管理员更新，此处可以通过中间件验证权限
    const fields = req.body; // 如 { email_api_key, google_map_key }
    const updated = await systemSettingsModel.updateSystemSettings(fields);
    res.status(200).json({ message: "Settings updated successfully", data: updated });
  } catch (error) {
    next(error);
  }
};

exports.dataImport = async (req, res, next) => {
  try {
    const file = req.file;
    const data = await systemSettingsModel.importData(file);

    const uniqueAgencyNames = [...new Set(data.map((item) => item.Customer).filter(Boolean))];
    const agencyMap = await agencyModel.getActiveAgencyIdsByNames(uniqueAgencyNames);

    for (const [index, item] of data.entries()) {
      const agencyName = item.Customer;
      if (!agencyName) {
        return res.status(401).json({ message: `Agency not found for customer at row ${index + 1}` });
      }

      const agencyId = agencyMap[agencyName];
      if (!agencyId) {
        return res.status(404).json({ message: `Agency [${agencyName}] not found` });
      }
      item.agency_id = agencyId;
    }

    const tasksToInsert = [];
    const errors = [];

    for (const [index, item] of data.entries()) {
      const rawStatus = item.Status?.toLowerCase() || "";
      const address = item["Job Address"];
      const jobNumber = item["Job Number"];
      // const jobType = item["Job Type"] || "";
      const schedule = item.Schedule || "";
      const notes = item.Notes || "";
      const description = item.Description || "";
      const agencyId = item.agency_id;

      if (!["unassigned", "complete"].includes(rawStatus)) continue;
      if (!address) {
        errors.push(`Missing Job Address [${jobNumber}]`);
        continue;
      }

      const property = await propertyModel.findOrCreateProperty(agencyId, address);
      const propertyId = property.id;

      const contactList = [];
      if (item["Job Contact"]) {
        contactList.push({
          name: item["Job Contact"],
          phone: item["Job Contact Mobile"] || "",
          email: item["Job Contact Phone"] || "",
        });
      }
      if (item["Site Contact"]) {
        contactList.push({
          name: item["Site Contact"],
          phone: item["Site Contact Mobile"] || "",
          email: item["Site Contact Phone"] || "",
        });
      }

      // 遍历并尝试插入联系人（根据 phone + property_id 判重）
      for (const contact of contactList) {
        if (!contact.phone) continue; // 无 phone 忽略（可按需调整为用 email 判重）

        const exists = await contactModel.getContactByPhoneAndProperty(contact.phone, propertyId);
        if (!exists) {
          await contactModel.createContact({
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
            property_id: propertyId,
          });
        }
      }

      const existing = await taskModel.getTaskByNameAndProperty(jobNumber, propertyId);
      if (existing) continue;

      const scheduleMatch = schedule.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/g);
      const inspectionDate = scheduleMatch?.[0] ? dayjs(scheduleMatch[0]).toISOString() : null;

      const noteMatch = notes.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
      const fallbackDate = scheduleMatch?.[1] || scheduleMatch?.[0] || null;
      const baseDate = noteMatch?.[0] || fallbackDate;

      const typeSet = new Set();
      // const lower = jobType.toLowerCase();
      // if (lower.includes("safety check")) {
      //   typeSet.add("SMOKE ALARM");
      //   typeSet.add("GAS & ELECTRICITY");
      // } else {
      //   if (lower.includes("smoke")) typeSet.add("SMOKE ALARM");
      //   if (lower.includes("gas")) typeSet.add("GAS & ELECTRICITY");
      // }

      const lower = description.toLowerCase();
      typeSet.add("GAS & ELECTRICITY");
      if (lower.includes("smoke")) typeSet.add("SMOKE ALARM");

      for (const type of typeSet) {
        const repeat = type === "SMOKE ALARM" ? "1 year" : "2 years";

        let dueDate = null;
        if (rawStatus === "complete") {
          if (!baseDate) {
            errors.push(`Missing complete date [${jobNumber}]`);
            continue;
          }
          dueDate = repeat === "1 year"
            ? dayjs(baseDate).add(1, "year").toISOString()
            : dayjs(baseDate).add(2, "year").toISOString();
        }

        let status = "INCOMPLETE";
        if (rawStatus === "complete") {
          status = "COMPLETED";
        } else if (inspectionDate && rawStatus === "unassigned") {
          status = "PROCESSING";
        }

        tasksToInsert.push({
          property_id: propertyId,
          agency_id: agencyId,
          task_name: jobNumber,
          task_description: description,
          inspection_date: inspectionDate,
          due_date: dueDate,
          repeat_frequency: repeat,
          type,
          status,
        });
      }
    }

    if (tasksToInsert.length > 0) {
      await taskModel.createTasks(tasksToInsert);
    }

    res.status(200).json({ message: "Import completed", created: tasksToInsert.length, errors });
  } catch (error) {
    next(error);
  }
};
