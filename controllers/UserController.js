// controllers/UserController.js
const userModel = require("../models/userModel");
const { getUserPermissions } = require("../models/userPermissionModel");

module.exports = {
  // 创建用户（注：权限判断在中间件或内部判断）
  createUser: async (req, res, next) => {
    try {
      const { email, name, password, role, agency_id } = req.body;
      // 创建用户
      const newUser = await userModel.createUser({ email, name, password, role, agency_id });
      res.status(201).json({ message: "User created successfully", data: newUser });
    } catch (error) {
      next(error);
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
