// controllers/agencyWhitelistController.js
const agencyWhitelistModel = require("../models/agencyWhitelistModel");
const agencyModel = require("../models/agencyModel"); // 假设也有这个 model，用来验证 agency 是否存在
const userModel = require("../models/userModel");
const { use } = require("../routes/apiRoutes");

/**
 * GET /agencies/:agencyId/whitelist
 * 获取某个 agency 的所有白名单记录
 */
async function getAgencyWhitelist(req, res, next) {
  try {
    const { agencyId } = req.params;
    const requestingUser = await userModel.getUserById(req.user.user_id);

    // 如果需要检查 agency 是否存在，可以调用 agencyModel 或者看项目习惯
    const agency = await agencyModel.getAgencyByAgencyId(parseInt(agencyId, 10), requestingUser);
    if (!agency) {
      return res.status(404).json({ message: "Agency not found" });
    }

    const rows = await agencyWhitelistModel.getWhitelistByAgencyId(agencyId);
    res.status(200).json(rows);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /agencies/:agencyId/whitelist
 * 新增一条白名单记录
 */
async function createAgencyWhitelist(req, res, next) {
  try {
    const { agencyId } = req.params;
    const { email_address } = req.body;

    if (!email_address) {
      return res.status(400).json({ message: "email_address is required" });
    }

    // 也可验证 agency 存在
    // const agency = await agencyModel.getAgencyById(agencyId);
    // if (!agency) {
    //   return res.status(404).json({ message: "Agency not found" });
    // }

    const newRow = await agencyWhitelistModel.createWhitelistEntry(
      agencyId,
      email_address
    );
    res.status(201).json(newRow);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /agencies/:agencyId/whitelist/:whitelistId
 * 更新某条白名单记录
 */
async function updateAgencyWhitelist(req, res, next) {
  try {
    const { agencyId, whitelistId } = req.params;
    const { email_address } = req.body;

    if (!email_address) {
      return res.status(400).json({ message: "email_address is required" });
    }

    // 先查旧数据(可选，看需要)
    const oldRow = await agencyWhitelistModel.getWhitelistEntryById(whitelistId);
    if (!oldRow) {
      return res.status(404).json({ message: "Whitelist entry not found" });
    }
    if (String(oldRow.agency_id) !== String(agencyId)) {
      return res
        .status(400)
        .json({ message: "Whitelist entry does not belong to this agency" });
    }

    const updatedRow = await agencyWhitelistModel.updateWhitelistEntry(
      whitelistId,
      email_address
    );
    if (!updatedRow) {
      return res.status(404).json({ message: "Whitelist entry not found" });
    }
    res.status(200).json(updatedRow);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /agencies/:agencyId/whitelist/:whitelistId
 * 删除某条白名单记录
 */
async function deleteAgencyWhitelist(req, res, next) {
  try {
    const { agencyId, whitelistId } = req.params;

    // 先查旧数据(可选，看需要)
    const oldRow = await agencyWhitelistModel.getWhitelistEntryById(whitelistId);
    if (!oldRow) {
      return res.status(404).json({ message: "Whitelist entry not found" });
    }
    if (String(oldRow.agency_id) !== String(agencyId)) {
      return res
        .status(400)
        .json({ message: "Whitelist entry does not belong to this agency" });
    }

    const success = await agencyWhitelistModel.deleteWhitelistEntry(whitelistId);
    if (!success) {
      return res.status(404).json({ message: "Whitelist entry not found" });
    }
    res.status(204).send(); // or res.status(200).json({ message: "Deleted" });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAgencyWhitelist,
  createAgencyWhitelist,
  updateAgencyWhitelist,
  deleteAgencyWhitelist,
};
