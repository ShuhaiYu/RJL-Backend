// controllers/PropertyController.js
const propertyModel = require("../models/propertyModel");
const userModel = require("../models/userModel");
const agencyModel = require("../models/agencyModel");

module.exports = {
  // 创建房产：一般要求当前用户必须关联机构
  createProperty: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      if (!user || !user.agency_id)
        return res.status(403).json({ message: "No associated agency" });
      const { address } = req.body;
      const newProperty = await propertyModel.createProperty({
        address,
        user_id: user.id,
      });
      res.status(201).json({ message: "Property created successfully", data: newProperty });
    } catch (error) {
      next(error);
    }
  },

  // 获取房产详情
  getPropertyDetail: async (req, res, next) => {
    try {
      const propertyId = req.params.id;
      const property = await propertyModel.getPropertyById(propertyId);
      if (!property) return res.status(404).json({ message: "Property not found" });
      res.status(200).json(property);
    } catch (error) {
      next(error);
    }
  },

  // 更新房产信息
  updateProperty: async (req, res, next) => {
    try {
      const propertyId = req.params.id;
      const updatedProperty = await propertyModel.updateProperty(propertyId, req.body);
      res.status(200).json({ message: "Property updated successfully", data: updatedProperty });
    } catch (error) {
      next(error);
    }
  },

  // 列出房产：可能需要根据当前用户或机构过滤
  listProperties: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      const properties = await propertyModel.listProperties(user);
      // 如有需要，可以把机构信息附加到返回数据中
      for (let i = 0; i < properties.length; i++) {
        const owner = await userModel.getUserById(properties[i].user_id);
        const agency = await agencyModel.getAgencyByAgencyId(owner.agency_id);
        properties[i].agency = agency;
      }
      res.status(200).json(properties);
    } catch (error) {
      next(error);
    }
  },
};
