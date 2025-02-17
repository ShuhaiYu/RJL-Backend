// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const adminController = require('../controllers/adminController');

// All endpoints require token authentication
router.use(authMiddleware.authenticateToken);

// User management (no deletion)
router.get('/users', adminController.listUsers);
router.get('/users/:id', adminController.getUserDetail);
router.post('/users/create', adminController.createUser);
router.put('/users/:id', adminController.updateUser);

// Agency management (no deletion)
router.get('/agencies', adminController.listAgencies);
router.get('/agencies/:id', adminController.getAgencyDetail);
router.post('/agencies/create', adminController.createAgency);
router.put('/agencies/:id', adminController.updateAgency);

// Property management (no deletion)
router.get('/properties', adminController.listProperties);
router.get('/properties/:id', adminController.getPropertyDetail);
router.post('/properties/create', adminController.createProperty);
router.put('/properties/:id', adminController.updateProperty);

// Task management (no deletion)
router.get('/tasks', adminController.listTasks);
router.get('/tasks/today', adminController.listTodayTasks);
router.get('/tasks/:id', adminController.getTaskDetail);
router.post('/tasks/create', adminController.createTask);
router.put('/tasks/:id', adminController.updateTask);

// Contact management (no deletion)
router.get('/contacts', adminController.listContacts);
router.get('/contacts/:id', adminController.getContactDetail);
router.post('/contacts/create', adminController.createContact);
router.put('/contacts/:id', adminController.updateContact);

// Email management (no deletion)
router.get('/emails', adminController.listEmails);

module.exports = router;
