// routes/apiRoutes.js
const express = require('express');
const router = express.Router();


// 中间件：所有后续接口需要 token 验证
const authMiddleware = require('../middlewares/authMiddleware');

// 资源控制器
const userController = require('../controllers/UserController');
const agencyController = require('../controllers/AgencyController');
const propertyController = require('../controllers/PropertyController');
const taskController = require('../controllers/TaskController');
const contactController = require('../controllers/ContactController');
const emailController = require('../controllers/EmailController');


// 以下所有路由都需要通过 token 验证
router.use(authMiddleware.authenticateToken);

/* -------------------------------
   User Management Routes
   说明：管理所有用户的创建、查询、更新等操作，
   权限判断通过 userPermission 实现，而不再区分角色
--------------------------------- */
router.get('/users', userController.listUsers);
router.get('/users/:id', userController.getUserDetail);
router.post('/users', userController.createUser);
router.put('/users/:id', userController.updateUser);

/* -------------------------------
   Agency Management Routes
   说明：管理机构信息（创建、查询、更新）
--------------------------------- */
router.get('/agencies', agencyController.listAgencies);
router.get('/agencies/:id', agencyController.getAgencyDetail);
router.post('/agencies', agencyController.createAgency);
router.put('/agencies/:id', agencyController.updateAgency);

/* -------------------------------
   Property Management Routes
   说明：管理房产，创建、查询、更新房产。具体权限（例如仅限当前机构）由 controller 内部判断
--------------------------------- */
router.get('/properties', propertyController.listProperties);
router.get('/properties/:id', propertyController.getPropertyDetail);
router.post('/properties', propertyController.createProperty);
router.put('/properties/:id', propertyController.updateProperty);

/* -------------------------------
   Task Management Routes
   说明：管理任务的创建、查询、更新、删除操作
--------------------------------- */
router.get('/tasks', taskController.listTasks);
router.get('/tasks/today', taskController.listTodayTasks);
router.get('/tasks/:id', taskController.getTaskDetail);
router.post('/tasks', taskController.createTask);
router.put('/tasks/:id', taskController.updateTask);
router.delete('/tasks/:id', taskController.deleteTask);

/* -------------------------------
   Contact Management Routes
   说明：管理联系人，支持查询、创建、更新（及删除，如允许）
--------------------------------- */
router.get('/contacts', contactController.listContacts);
router.get('/contacts/:id', contactController.getContactDetail);
router.post('/contacts', contactController.createContact);
router.put('/contacts/:id', contactController.updateContact);
router.delete('/contacts/:id', contactController.deleteContact);

/* -------------------------------
   Email Management Routes
   说明：查询邮件记录；以及基于邮件内容自动生成房产、任务、联系人
--------------------------------- */
router.get('/emails', emailController.listEmails);
router.post('/emails/process', emailController.createPropertyByEmail);

module.exports = router;
