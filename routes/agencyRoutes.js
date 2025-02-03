const express = require('express');
const router = express.Router();
const agencyController = require('../controllers/agencyController');
const authMiddleware = require('../middlewares/authMiddleware');

// 中介权限相关路由（需要判断是否role=agency）
router.post('/property', authMiddleware.requireAgency, agencyController.createProperty);

module.exports = router;
