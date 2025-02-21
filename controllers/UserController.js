// controllers/UserController.js
const userModel = require("../models/userModel");
const { getUserPermissions, createUserPermission } = require("../models/userPermissionModel"); // 从中间表查询权限
const { getPermissionId } = require("../models/permissionModel");
const bcrypt = require("bcrypt");


module.exports = {
  // 创建用户（注：权限判断在中间件或内部判断）
  // 2) Register a new user
  createUser: async (req, res, next) => {
    try {
      const { email, password, name, role, agency_id, permissions } = req.body;
      const existingUser = await userModel.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({
          message: "This email is already registered, please use another email",
        });
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);
      // Use provided name or fallback to email
      const finalName = name || email;
      const userRole = role || "user";

      // Create user in the database
      const newUser = await userModel.createUser({
        email,
        name: finalName,
        password: hashedPassword,
        role: userRole,
        agency_id: agency_id || null,
      });

      // If a permissions object is provided, iterate over it to assign permissions dynamically.
      // The permissions object is expected to have a format like:
      // { user: ["create", "read"], agency: ["read", "update"], ... }
      if (permissions && typeof permissions === "object") {
        for (const scope in permissions) {
          if (Array.isArray(permissions[scope])) {
            for (const permValue of permissions[scope]) {
              // Look up the permission id dynamically from the PERMISSION table
              const permissionId = await getPermissionId(permValue, scope);
              if (permissionId) {
                await createUserPermission(newUser.id, permissionId);
              }
            }
          }
        }
      }

      return res.status(201).json({
        message: "Registration successful",
        data: {
          id: newUser.id,
          email: newUser.email,
          role: newUser.role,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // 获取用户详情（附带权限信息）
  getUserDetail: async (req, res, next) => {
    try {
      const user_id = req.params.id;
      const user = await userModel.getUserById(user_id);
      if (!user) return res.status(404).json({ message: "User not found" });
      // 查询用户权限
      const permissions = await getUserPermissions(user_id);
      user.permissions = permissions;
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  },

  // 更新用户信息
  updateUser: async (req, res, next) => {
    try {
      const user_id = req.params.id;
      const updatedUser = await userModel.updateUser(user_id, req.body);
      res.status(200).json({ message: "User updated successfully", data: updatedUser });
    } catch (error) {
      next(error);
    }
  },

  // 列出所有用户（可能需要分页、筛选）
  listUsers: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      const users = await userModel.listUsers(user);
      res.status(200).json(users);
    } catch (error) {
      next(error);
    }
  },

  // 删除用户
  deleteUser: async (req, res, next) => {
    try {
      const user_id = req.params.id;
      await userModel.deleteUser(user_id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
};
