const systemSettingsModel = require("../models/systemSettingsModel");

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
