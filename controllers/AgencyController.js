// controllers/AgencyController.js
const agencyModel = require("../models/agencyModel");

module.exports = {
  // 创建机构（创建机构后可能需要额外操作：如创建机构管理员）
  createAgency: async (req, res, next) => {
    try {
      const { agency_name, address, phone, logo } = req.body;
      const newAgency = await agencyModel.createAgency({ agency_name, address, phone, logo });
      res.status(201).json({ message: "Agency created successfully", data: newAgency });
    } catch (error) {
      next(error);
    }
  },

  // 获取机构详情
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

  // 更新机构信息
  updateAgency: async (req, res, next) => {
    try {
      const agencyId = req.params.id;
      const updatedAgency = await agencyModel.updateAgency(agencyId, req.body);
      res.status(200).json({ message: "Agency updated successfully", data: updatedAgency });
    } catch (error) {
      next(error);
    }
  },

  // 列出所有机构
  listAgencies: async (req, res, next) => {
    try {
      const agencies = await agencyModel.listAgencies();
      res.status(200).json(agencies);
    } catch (error) {
      next(error);
    }
  },
};
