// routes/superuserRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const superuserController = require('../controllers/superuserController');

router.post('/create-property-by-email', superuserController.createPropertyByEmail);

// All endpoints require token authentication
router.use(authMiddleware.authenticateToken);

// User management
router.get('/users', superuserController.listUsers);
router.get('/users/:id', superuserController.getUserDetail);
router.post('/users/create', superuserController.createUser);
router.put('/users/:id', superuserController.updateUser);
router.delete('/users/:id', superuserController.deleteUser);

// Agency management
router.get('/agencies', superuserController.listAgencies);
router.get('/agencies/:id', superuserController.getAgencyDetail);
router.post('/agencies/create', superuserController.createAgency);
router.put('/agencies/:id', superuserController.updateAgency);
router.delete('/agencies/:id', superuserController.deleteAgency);

// Property management
router.get('/properties', superuserController.listProperties);
router.get('/properties/:id', superuserController.getPropertyDetail);
router.post('/properties/create', superuserController.createProperty);
router.put('/properties/:id', superuserController.updateProperty);
router.delete('/properties/:id', superuserController.deleteProperty);

// Task management
router.get('/tasks', superuserController.listTasks);
router.get('/tasks/:id', superuserController.getTaskDetail);
router.post('/tasks/create', superuserController.createTask);
router.put('/tasks/:id', superuserController.updateTask);
router.delete('/tasks/:id', superuserController.deleteTask);

// Contact management
router.get('/contacts', superuserController.listContacts);
router.get('/contacts/:id', superuserController.getContactDetail);
router.post('/contacts/create', superuserController.createContact);
router.put('/contacts/:id', superuserController.updateContact);
router.delete('/contacts/:id', superuserController.deleteContact);

module.exports = router;
