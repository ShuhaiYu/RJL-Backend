// routes/apiRoutes.js
const express = require("express");
const router = express.Router();

// 中间件：所有后续接口需要 token 验证
const authMiddleware = require("../middlewares/authMiddleware");
// 载入 multer 中间件
const createUpload = require("../middlewares/upload");
// 资源控制器
const userController = require("../controllers/UserController");
const agencyController = require("../controllers/AgencyController");
const propertyController = require("../controllers/PropertyController");
const taskController = require("../controllers/TaskController");
const contactController = require("../controllers/ContactController");
const emailController = require("../controllers/EmailController");
const userPermissionController = require("../controllers/UserPermissionController");
const taskFileController = require("../controllers/TaskFileController");
const systemController = require("../controllers/SystemSettingsController");
const veuProjectController = require("../controllers/veuProjectController");
// const veuProjectFileController = require("../controllers/veuProjectFileController");
const {
  getAgencyWhitelist,
  createAgencyWhitelist,
  updateAgencyWhitelist,
  deleteAgencyWhitelist,
} = require("../controllers/agencyWhitelistController");
const { syncPastEmails } = require("../controllers/EmailSyncController");

// 邮件监听器route
router.post("/emails/process", emailController.createPropertyByEmail);

// 以下所有路由都需要通过 token 验证
router.use(authMiddleware.authenticateToken);

// Dashboard
router.get("/dashboard", taskController.getDashboard);

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
router.delete(
  "/users/:id",
  authMiddleware.requirePermission("delete", "user"),
  userController.deleteUser
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
router.put(
  "/agencies/veu-active/:id",
  authMiddleware.requirePermission("update", "agency"),
  agencyController.activateVeuProject
);

/* -------------------------------
   Agency WhiteList Management Routes
   说明：管理机构白名单，例如创建、查询、更新白名单
--------------------------------- */
router.get(
  "/agencies/:agencyId/whitelist",
  authMiddleware.requirePermission("read", "agency"),
  getAgencyWhitelist
);
router.post(
  "/agencies/:agencyId/whitelist",
  createAgencyWhitelist
);
router.put(
  "/agencies/:agencyId/whitelist/:whitelistId",
  authMiddleware.requirePermission("update", "agency"),
  updateAgencyWhitelist
);
router.delete(
  "/agencies/:agencyId/whitelist/:whitelistId",
  authMiddleware.requirePermission("delete", "agency"),
  deleteAgencyWhitelist
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
router.delete(
  "/properties/:id",
  authMiddleware.requirePermission("delete", "property"),
  propertyController.deleteProperty
);
router.get(
  "/properties/:propertyId/veu-projects",
  authMiddleware.requirePermission("read", "veu_project"),
  veuProjectController.listByProperty
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
  "/tasks/agency-lists",
  authMiddleware.requirePermission("read", "task"),
  taskController.listAgencyTasks
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

// 创建上传接口
const taskFileUpload = createUpload([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);
router.post(
  "/tasks/:taskId/files",
  taskFileUpload.single("file"),
  taskFileController.uploadTaskFile
);

// 获取文件列表接口
router.get("/tasks/:taskId/files", taskFileController.getTaskFiles);

// 删除文件接口
router.delete(
  "/tasks/:taskId/files/:fileId",
  taskFileController.deleteTaskFile
);

// 获取预签名URL
router.get(
  "/tasks/:taskId/files/:fileId/download",
  taskFileController.getFileSignedUrl
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
  // authMiddleware.requirePermission("read", "email"),
  emailController.listEmails
);

router.post("/emails/sync", syncPastEmails);

/* -------------------------------
   VEU Project Routes
   说明： VEU Project 相关接口
--------------------------------- */
router.put(
  "/veu-projects/:id",
  authMiddleware.requirePermission("update", "veu_project"),
  veuProjectController.updateById
);

/* -------------------------------
   VEU Project Files
   说明：与任务文件相同的上传白名单
--------------------------------- */
// const veuFileUpload = createUpload([
//   "application/pdf",
//   "image/jpeg",
//   "image/jpg",
//   "image/png",
// ]);

// router.get(
//   "/veu-projects/:projectId/files",
//   authMiddleware.requirePermission("read", "veu_project"),
//   veuProjectFileController.listFiles
// );

/* -------------------------------
   System Setting Routes
   说明：管理系统设置，例如api等
--------------------------------- */
router.get(
  "/settings",
  authMiddleware.requirePermission("read", "setting"),
  systemController.getSettings
);

router.get(
  "/google-map-key",
  systemController.getGoogleMapKey
);

router.put(
  "/settings",
  authMiddleware.requirePermission("update", "setting"),
  systemController.updateSettings
);

// 创建上传接口
const dataImportUpload = createUpload([
  "text/csv",
]);
router.post(
  "/data-import",
  dataImportUpload.single("csv_file"),
  systemController.dataImport
);

module.exports = router;
