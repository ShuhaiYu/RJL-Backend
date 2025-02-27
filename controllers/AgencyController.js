// controllers/AgencyController.js
const agencyModel = require("../models/agencyModel");
const userModel = require("../models/userModel");
const { createUserPermission } = require("../models/userPermissionModel"); // 从中间表查询权限
const { getPermissionId } = require("../models/permissionModel");
const bcrypt = require("bcrypt");

module.exports = {
  // 创建机构（创建机构管理员）
  createAgency: async (req, res, next) => {
    try {
      const {
        agency_name,
        address,
        phone,
        logo,
        // 下面是用户相关字段
        name,
        email,
        password,
      } = req.body;

      // 1. 创建Agency
      const newAgency = await agencyModel.createAgency({
        agency_name,
        address,
        phone,
        logo,
      });

      // 2. 创建一个默认的 "agency-admin" 用户
      //    a. Hash密码
      const hashedPassword = await bcrypt.hash(password, 10);

      //    b. 在 userModel.createUser(...) 中传入 agency_id = newAgency.id
      const agencyAdminUser = await userModel.createUser({
        email,
        name: name || email, // 若没传 name，就用 email
        password: hashedPassword,
        role: "agency-admin",
        agency_id: newAgency.id,
      });

      // 3. 分配默认权限
      // 如果你有更多角色的默认权限，可放在对象里
      const defaultRolePermissions = {
        "agency-admin": {
          user: ["create", "read", "update"],
          agency: ["read", "update"],
          property: ["create", "read", "update"],
          task: ["create", "read", "update"],
          contact: ["create", "read", "update"],
          role: [], // agency-admin typically不能管理角色
        },
      };

      // 遍历 "agency-admin" 角色的默认权限
      for (const scope in defaultRolePermissions["agency-admin"]) {
        // scope 例如 "user", "agency", "property", ...
        const perms = defaultRolePermissions["agency-admin"][scope];
        if (Array.isArray(perms)) {
          for (const permValue of perms) {
            // 根据 scope + permValue 查找 PERMISSION 表中的权限ID
            const permissionId = await getPermissionId(permValue, scope);
            if (permissionId) {
              // 创建 USER_PERMISSION 记录
              await createUserPermission(agencyAdminUser.id, permissionId);
            }
          }
        }
      }

      // 4. 返回响应
      res.status(201).json({
        message: "Agency created successfully, and agency-admin user created",
        data: {
          agency: newAgency,
          adminUser: {
            id: agencyAdminUser.id,
            email: agencyAdminUser.email,
            role: agencyAdminUser.role,
          },
        },
      });
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
      res
        .status(200)
        .json({ message: "Agency updated successfully", data: updatedAgency });
    } catch (error) {
      next(error);
    }
  },

  // 列出所有机构
  listAgencies: async (req, res, next) => {
    try {
      const search = req.query.search || "";
      const agencies = await agencyModel.listAgencies(search);
      
      res.status(200).json(agencies);
    } catch (error) {
      next(error);
    }
  },
};
