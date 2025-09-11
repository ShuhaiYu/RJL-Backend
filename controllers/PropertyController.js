// controllers/PropertyController.js
const propertyModel = require("../models/propertyModel");
const userModel = require("../models/userModel");
const agencyModel = require("../models/agencyModel");
const veuProjectModel = require("../models/veuProjectModel");

module.exports = {
  // 创建房产：一般要求当前用户必须关联机构
  createProperty: async (req, res, next) => {
    try {
      const requestingUser = await userModel.getUserById(req.user.user_id);
      if (!requestingUser) {
        return res.status(403).json({ message: "Requesting user not found" });
      }

      const { address, user_id } = req.body;
      if (!address) {
        return res.status(400).json({ message: "Address is required" });
      }

      let finalUserId = null;
      let assignedUser = null;

      if (requestingUser.role === "admin" || requestingUser.role === "superuser") {
        if (!user_id) {
          return res.status(400).json({ message: "Must provide 'assignedUserId' for property" });
        }
        assignedUser = await userModel.getUserById(user_id);
        if (!assignedUser) {
          return res.status(404).json({ message: "Assigned user not found" });
        }
        // ✅ 管理员允许分配给“无 agency 的用户”（后面会强制创建 VEU）
        finalUserId = assignedUser.id;
      } else if (
        requestingUser.role === "agency-admin" ||
        requestingUser.role === "agency-user"
      ) {
        if (!user_id) {
          return res.status(400).json({ message: "Must provide 'assignedUserId' for property" });
        }
        assignedUser = await userModel.getUserById(user_id);
        if (!assignedUser) {
          return res.status(404).json({ message: "Assigned user not found" });
        }
        if (!assignedUser.agency_id || assignedUser.agency_id !== requestingUser.agency_id) {
          return res.status(403).json({
            message: "You can only assign property to users in your agency",
          });
        }
        finalUserId = assignedUser.id;
      } else {
        return res.status(403).json({ message: "No permission to create property" });
      }

      // 重复校验（同一用户+同一地址）
      const existing = await propertyModel.getPropertyByAddress(address);
      if (existing.length > 0 && existing.some((p) => p.user_id === finalUserId)) {
        return res.status(409).json({ message: "Property already exists for this user" });
      }

      // 创建房产
      const newProperty = await propertyModel.createProperty({
        address,
        user_id: finalUserId,
      });

      // ✅ 是否需要自动创建 VEU：无 agency ⇒ 必建；有 agency ⇒ agency.veu_activated=true 才建
      let shouldCreateVeu = false;
      if (!assignedUser?.agency_id) {
        shouldCreateVeu = true;
      } else {
        const agency = await agencyModel.getAgencyById(assignedUser.agency_id);
        if (agency?.veu_activated === true) {
          shouldCreateVeu = true;
        }
      }

      if (shouldCreateVeu) {
        await veuProjectModel.createVeuProjectsForProperty(newProperty.id);
      }

      return res.status(201).json({
        message: "Property created successfully",
        data: newProperty,
      });
    } catch (error) {
      next(error);
    }
  },

  // 获取房产详情
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

  // 更新房产信息
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

  // 列出房产：可能需要根据当前用户或机构过滤
  listProperties: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      const search = req.query.search || "";
      const properties = await propertyModel.listProperties(user, search);
      res.status(200).json(properties);
    } catch (error) {
      next(error);
    }
  },

  // 删除房产
  deleteProperty: async (req, res, next) => {
    try {
      const propertyId = req.params.id;
      await propertyModel.deleteProperty(propertyId);
      res.status(200).json({ message: "Property deleted successfully" });
    } catch (error) {
      next(error);
    }
  },
};
