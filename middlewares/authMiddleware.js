const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.JWT_ACCESS_SECRET;

module.exports = {
  // 基础鉴权中间件：验证 token 并将 payload 存入 req.user
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      // decoded 应该包含 permissions 字段，如：
      // { user_id, role, permissions: [{ permission_value, permission_scope }, ...], iat, exp }
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  },

  /**
   * 适配新权限结构的权限校验中间件
   * @param {string} requiredValue - 需要的操作权限，如 'create', 'read'
   * @param {string} requiredScope - 权限作用域，如 'user', 'agency'
   */
  requirePermission: (requiredValue, requiredScope) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(403).json({ message: 'Unauthorized' });
      }
      
      const permissions = req.user.permissions;
      
      // 检查权限结构是否符合预期
      if (!permissions || typeof permissions !== 'object') {
        return res.status(403).json({ message: 'Invalid permissions format in token' });
      }
      
      // 获取对应作用域的权限列表
      const scopePermissions = permissions[requiredScope];
      if (!Array.isArray(scopePermissions)) {
        return res.status(403).json({ message: `No permissions scope: ${requiredScope}` });
      }
      
      // 检查是否拥有所需权限
      if (!scopePermissions.includes(requiredValue)) {
        return res.status(403).json({
          message: `Missing permission: ${requiredScope}.${requiredValue}`
        });
      }
      
      next();
    };
  }
};
