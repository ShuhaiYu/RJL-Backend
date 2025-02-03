const jwt = require('jsonwebtoken');
const { getPermissionsByRole } = require('../models/rolePermissionModel');

const SECRET_KEY = process.env.JWT_ACCESS_SECRET;

module.exports = {
  // 基础鉴权
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: '未提供 token' });
    }
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      req.user = decoded; // { userId, role, iat, exp }
      next();
    } catch (err) {
      return res.status(401).json({ message: '无效的 token' });
    }
  },

  // 需要管理员角色
  requireAdmin: async (req, res, next) => {
    try {
      // 先执行 authenticateToken
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: '需要管理员权限' });
      }
      // 如果还需要进一步验证权限，可以查 role_permission
      const permissions = await getPermissionsByRole(req.user.role);
      if (!permissions || !permissions.read_agency) {
        return res.status(403).json({ message: '管理员权限不足' });
      }

      next();
    } catch (err) {
      next(err);
    }
  },

  // 需要中介角色
  requireAgency: async (req, res, next) => {
    try {
      // 先执行 authenticateToken
      if (!req.user || req.user.role !== 'agency') {
        return res.status(403).json({ message: '需要中介权限' });
      }
      // 如果还需要进一步验证权限
      const permissions = await getPermissionsByRole(req.user.role);
      if (!permissions || !permissions.create_property) {
        return res.status(403).json({ message: '中介权限不足' });
      }

      next();
    } catch (err) {
      next(err);
    }
  },
};
