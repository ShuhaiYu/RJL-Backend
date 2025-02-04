const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middlewares/authMiddleware');

// 管理员专属路由示例（需要先通过 authMiddleware 判断是否是admin角色）
router.get('/agencies', authMiddleware.requireAdmin, adminController.getAgencies);
router.get('/agencies/:id', authMiddleware.requireAdmin, adminController.getAgencyDetail);
router.post('/agencies/create', authMiddleware.requireAdmin, adminController.createAgency);
router.post('/agencies/:id/close', authMiddleware.requireAdmin, adminController.closeAgency);
router.post('/agencies/:id/unfreeze', authMiddleware.requireAdmin, adminController.unfreezeAgency);

module.exports = router;
