// routes/apiRoutes.js
const express = require("express");
const router = express.Router();

// 中间件：所有后续接口需要 token 验证
const authMiddleware = require("../middlewares/authMiddleware");

// 资源控制器
const userController = require("../controllers/UserController");
const agencyController = require("../controllers/AgencyController");
const propertyController = require("../controllers/PropertyController");
const taskController = require("../controllers/TaskController");
const contactController = require("../controllers/ContactController");
const emailController = require("../controllers/EmailController");
const userPermissionController = require("../controllers/UserPermissionController");

// 邮件监听器route
router.post("/emails/process", emailController.createPropertyByEmail);

// 以下所有路由都需要通过 token 验证
router.use(authMiddleware.authenticateToken);

/* -------------------------------
   User Management Routes
   说明：管理所有用户的创建、查询、更新等操作，
   权限判断通过 userPermission 实现，而不再区分角色
--------------------------------- */
router.get(
  "/users",
  authMiddleware.requirePermission("read", "user"),
  userController.listUsers
);
router.get(
  "/users/:id",
  authMiddleware.requirePermission("read", "user"),
  userController.getUserDetail
);
router.post(
  "/users",
  authMiddleware.requirePermission("create", "user"),
  userController.createUser
);
router.put(
  "/users/:id",
  authMiddleware.requirePermission("update", "user"),
  userController.updateUser
);
router.put(
  "/users/:id/permissions",
  authMiddleware.requirePermission("update", "user"),
  userPermissionController.updateUserPermissions
);

/* -------------------------------
   Agency Management Routes
   说明：管理机构信息（创建、查询、更新）
--------------------------------- */
router.get(
  "/agencies",
  authMiddleware.requirePermission("read", "agency"),
  agencyController.listAgencies
);
router.get(
  "/agencies/:id",
  authMiddleware.requirePermission("read", "agency"),
  agencyController.getAgencyDetail
);
router.post(
  "/agencies",
  authMiddleware.requirePermission("create", "agency"),
  agencyController.createAgency
);
router.put(
  "/agencies/:id",
  authMiddleware.requirePermission("update", "agency"),
  agencyController.updateAgency
);

/* -------------------------------
   Property Management Routes
   说明：管理房产，创建、查询、更新房产。具体权限（例如仅限当前机构）由 controller 内部判断
--------------------------------- */
router.get(
  "/properties",
  authMiddleware.requirePermission("read", "property"),
  propertyController.listProperties
);
router.get(
  "/properties/:id",
  authMiddleware.requirePermission("read", "property"),
  propertyController.getPropertyDetail
);
router.post(
  "/properties",
  authMiddleware.requirePermission("create", "property"),
  propertyController.createProperty
);
router.put(
  "/properties/:id",
  authMiddleware.requirePermission("update", "property"),
  propertyController.updateProperty
);

/* -------------------------------
   Task Management Routes
   说明：管理任务的创建、查询、更新、删除操作
--------------------------------- */
router.get(
  "/tasks",
  authMiddleware.requirePermission("read", "task"),
  taskController.listTasks
);
router.get(
  "/tasks/today",
  authMiddleware.requirePermission("read", "task"),
  taskController.listTodayTasks
);
router.get(
  "/tasks/:id",
  authMiddleware.requirePermission("read", "task"),
  taskController.getTaskDetail
);
router.post(
  "/tasks",
  authMiddleware.requirePermission("create", "task"),
  taskController.createTask
);
router.put(
  "/tasks/:id",
  authMiddleware.requirePermission("update", "task"),
  taskController.updateTask
);
router.delete(
  "/tasks/:id",
  authMiddleware.requirePermission("delete", "task"),
  taskController.deleteTask
);

/* -------------------------------
   Contact Management Routes
   说明：管理联系人，支持查询、创建、更新（及删除，如允许）
--------------------------------- */
router.get(
  "/contacts",
  authMiddleware.requirePermission("read", "contact"),
  contactController.listContacts
);
router.get(
  "/contacts/:id",
  authMiddleware.requirePermission("read", "contact"),
  contactController.getContactDetail
);
router.post(
  "/contacts",
  authMiddleware.requirePermission("create", "contact"),
  contactController.createContact
);
router.put(
  "/contacts/:id",
  authMiddleware.requirePermission("update", "contact"),
  contactController.updateContact
);
router.delete(
  "/contacts/:id",
  authMiddleware.requirePermission("delete", "contact"),
  contactController.deleteContact
);

/* -------------------------------
   Email Management Routes
   说明：查询邮件记录；以及基于邮件内容自动生成房产、任务、联系人
--------------------------------- */
router.get(
  "/emails",
  authMiddleware.requirePermission("read", "email"),
  emailController.listEmails
);

module.exports = router;
