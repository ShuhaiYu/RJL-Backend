// controllers/PropertyController.js
const propertyModel = require("../models/propertyModel");
const userModel = require("../models/userModel");
const agencyModel = require("../models/agencyModel");

module.exports = {
  // 创建房产：一般要求当前用户必须关联机构
  createProperty: async (req, res, next) => {
    try {
      // 1) 获取“请求用户”信息（谁在调用接口）
      const requestingUser = await userModel.getUserById(req.user.user_id);
      if (!requestingUser) {
        return res.status(403).json({ message: "Requesting user not found" });
      }

      // 2) 从前端 body 获取必要字段
      const { address, user_id } = req.body;
      if (!address) {
        return res.status(400).json({ message: "Address is required" });
      }

      // 3) 根据请求用户角色，确定要使用的 user_id
      let finalUserId = null;

      // 如果是 RJL admin / superuser => 可以指定 assignedUserId，但必须该用户有 agency_id
      if (
        requestingUser.role === "admin" ||
        requestingUser.role === "superuser"
      ) {
        if (!user_id) {
          return res
            .status(400)
            .json({ message: "Must provide 'assignedUserId' for property" });
        }
        // 查一下 assignedUser
        const assignedUser = await userModel.getUserById(user_id);
        if (!assignedUser) {
          return res.status(404).json({ message: "Assigned user not found" });
        }
        if (!assignedUser.agency_id) {
          return res
            .status(400)
            .json({ message: "Cannot assign property to user without agency" });
        }
        finalUserId = assignedUser.id;
      }
      // 如果是 agency-admin / agency-staff => 只能分配给同 agency
      else if (
        requestingUser.role === "agency-admin" ||
        requestingUser.role === "agency-user"
      ) {
        // 如果不需要自由指定，可以直接把 property 绑定到请求用户
        // finalUserId = requestingUser.id;

        // 如果想支持“给同 agency 下其他用户”：
        if (!user_id) {
          return res
            .status(400)
            .json({ message: "Must provide 'assignedUserId' for property" });
        }
        const assignedUser = await userModel.getUserById(user_id);
        if (!assignedUser) {
          return res.status(404).json({ message: "Assigned user not found" });
        }
        // 必须同 agency
        if (
          !assignedUser.agency_id ||
          assignedUser.agency_id !== requestingUser.agency_id
        ) {
          return res.status(403).json({
            message: "You can only assign property to users in your agency",
          });
        }

        finalUserId = assignedUser.id;
      } else {
        // 其他角色，如普通用户，禁止创建
        return res
          .status(403)
          .json({ message: "No permission to create property" });
      }

      // 4) 开始插入
      const newProperty = await propertyModel.createProperty({
        address,
        user_id: finalUserId,
      });

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
      res
        .status(200)
        .json({
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
      // 1) 拿请求用户
      const user = await userModel.getUserById(req.user.user_id);
      // 2) 拿搜索关键字
      const search = req.query.search || "";
      // 3) 在一条查询中得到房产 + 所属 agency
      const properties = await propertyModel.listProperties(user, search);

      // 4) 直接返回
      res.status(200).json(properties);
    } catch (error) {
      next(error);
    }
  },
};
