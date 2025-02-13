const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.JWT_ACCESS_SECRET;

module.exports = {
  // 基础鉴权中间件：验证 token 并将 payload 存入 req.user
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: '未提供 token' });
    }
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      // decoded 应该包含 permissions 字段，如：
      // { user_id, role, permissions: [{ permission_value, permission_scope }, ...], iat, exp }
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ message: '无效的 token' });
    }
  },

  /**
   * 通用权限校验中间件
   * 要求用户必须拥有指定的权限，权限信息直接从 token 的 payload 中获取
   *
   * @param {string} requiredValue - 必须的权限值，例如 'create'
   * @param {string} requiredScope - 必须的权限作用域，例如 'user'
   * @returns {Function} Express 中间件函数
   *
   * 使用示例：
   *   router.post('/users/create',
   *     authenticateToken,
   *     requirePermission('create', 'user'),
   *     controller.createUser);
   */
  requirePermission: (requiredValue, requiredScope) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(403).json({ message: '未授权' });
      }
      const permissions = req.user.permissions;
      if (!permissions || !Array.isArray(permissions)) {
        return res.status(403).json({ message: 'Token 中缺少权限信息' });
      }
      const hasPermission = permissions.some(
        (p) =>
          p.permission_value === requiredValue &&
          p.permission_scope === requiredScope
      );
      if (!hasPermission) {
        return res
          .status(403)
          .json({ message: `缺少权限: ${requiredValue} ${requiredScope}` });
      }
      next();
    };
  },
};
