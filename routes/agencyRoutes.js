// routes/agencyRoutes.js
const express = require('express');
const router = express.Router();
const agencyController = require('../controllers/agencyController');
const { authenticateToken, requireAgencyOrAdmin } = require('../middlewares/authMiddleware');

// 不需要token验证的接口
router.post('/create-property-by-email', agencyController.createPropertyByEmail);

// 使用 authenticateToken 对所有接口进行 token 校验
router.use(authenticateToken);

// 房产相关路由
router.get('/properties', agencyController.listProperties);
router.get('/properties/:id', agencyController.getPropertyDetail);
router.put('/properties/:id', requireAgencyOrAdmin, agencyController.updateProperty);
router.delete('/properties/:id', requireAgencyOrAdmin, agencyController.deleteProperty);
router.post('/properties/create', requireAgencyOrAdmin, agencyController.createProperty);

// 任务相关路由
router.get('/tasks', agencyController.listTasks);
router.get('/tasks/today', agencyController.listTodayTasks);
router.get('/tasks/:id', agencyController.getTaskDetail);
router.put('/tasks/:id', agencyController.updateTask);
router.delete('/tasks/:id', agencyController.deleteTask);
router.post('/tasks/create', agencyController.createTask);

// 联系人相关路由
router.get('/contacts', agencyController.listContacts);
router.get('/contacts/:id', agencyController.getContactDetail);
router.put('/contacts/:id', agencyController.updateContact);
router.delete('/contacts/:id', agencyController.deleteContact);
router.post('/contacts/create', agencyController.createContact);

module.exports = router;
