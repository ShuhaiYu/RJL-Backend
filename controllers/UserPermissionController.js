const userPermissionModel = require('../models/userPermissionModel');

/**
 * PUT /users/:id/permissions
 * 更新指定用户的权限。
 * 请求体格式示例：
 * {
 *   permissions: {
 *     user: ["read", "update"],
 *     agency: ["read"],
 *     property: ["create", "read"],
 *     task: ["read", "update"],
 *     contact: ["read", "update"],
 *     email: ["read"]
 *   }
 * }
 */
async function updateUserPermissions(req, res, next) {
  const user_id = req.params.id;
  const { permissions } = req.body; // 预期格式：对象，每个键对应一个作用域，其值为权限数组
  
  if (!permissions || typeof permissions !== 'object') {
    return res.status(400).json({ message: 'Invalid permissions format' });
  }
  
  try {
    // 删除该用户原有的所有权限关联
    await userPermissionModel.deleteAllUserPermissions(user_id);
    
    // 遍历传入的每个权限作用域
    for (const scope in permissions) {
      if (Array.isArray(permissions[scope])) {
        for (const permValue of permissions[scope]) {
          // 查询 PERMISSION 表获取对应的权限 ID
          const permissionId = await userPermissionModel.getPermissionId(permValue, scope);
          if (permissionId) {
            // 插入用户与该权限的关联记录
            await userPermissionModel.createUserPermission(user_id, permissionId);
          }
        }
      }
    }
    
    // 查询更新后的权限数据，并返回给前端
    const updatedPermissions = await userPermissionModel.getUserPermissions(user_id);
    return res.status(200).json({
      message: 'User permissions updated successfully',
      permissions: updatedPermissions,
    });
  } catch (error) {
    console.error("Error updating user permissions:", error);
    next(error);
  }
}

module.exports = {
  updateUserPermissions,
};
