// routes/agencyUserRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const agencyUserController = require('../controllers/agencyUserController');

// All endpoints require token authentication
router.use(authMiddleware.authenticateToken);

// Property management (only properties of the current agency)
router.get('/properties', agencyUserController.listMyProperties);


// Task management (only tasks under the current agency)
router.get('/tasks', agencyUserController.listMyTasks);
router.post('/tasks/create', agencyUserController.createTask);
router.get('/tasks/today', agencyUserController.listTodayTasks);
router.get('/tasks/:id', agencyUserController.getTaskDetail);
router.put('/tasks/:id', agencyUserController.updateTask);
router.delete('/tasks/:id', agencyUserController.deleteTask);

// Contact management (only contacts under the current agency)
router.get('/emails', agencyUserController.listEmails);

module.exports = router;
