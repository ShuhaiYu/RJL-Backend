// routes/agencyAdminRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const agencyAdminController = require('../controllers/agencyAdminController');

// All endpoints require token authentication
router.use(authMiddleware.authenticateToken);

// Personal user information management
router.get('/me', agencyAdminController.getMyUserDetail);
router.put('/me', agencyAdminController.updateMyUserDetail);

// Agency information management
router.get('/agency', agencyAdminController.getMyAgencyDetail);
router.put('/agency', agencyAdminController.updateMyAgencyDetail);

// Property management (only for properties of the current agency)
router.get('/properties', agencyAdminController.listMyProperties);
router.get('/properties/:id', agencyAdminController.getMyPropertyDetail);
router.post('/properties/create', agencyAdminController.createProperty);
router.put('/properties/:id', agencyAdminController.updateProperty);
router.delete('/properties/:id', agencyAdminController.deleteProperty);

// Task management (only for tasks under the current agency)
router.get('/tasks', agencyAdminController.listMyTasks);
router.get('/tasks/today', agencyAdminController.listTodayTasks);
router.get('/tasks/:id', agencyAdminController.getMyTaskDetail);
router.post('/tasks/create', agencyAdminController.createTask);
router.put('/tasks/:id', agencyAdminController.updateTask);
router.delete('/tasks/:id', agencyAdminController.deleteTask);

module.exports = router;
