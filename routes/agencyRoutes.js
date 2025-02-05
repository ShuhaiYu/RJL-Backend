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
router.post('/properties/create', agencyController.createProperty);

// 任务相关路由
router.get('/tasks', agencyController.listTasks);
router.get('/tasks/:id', agencyController.getTaskDetail);
router.post('/tasks/create', agencyController.createTask);

module.exports = router;
