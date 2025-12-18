/**
 * API Routes
 *
 * Main API router with validation middleware.
 */

const express = require('express');
const router = express.Router();

// Controllers
const userController = require('../controllers/userController');
const agencyController = require('../controllers/agencyController');
const propertyController = require('../controllers/propertyController');
const taskController = require('../controllers/taskController');
const contactController = require('../controllers/contactController');
const emailController = require('../controllers/emailController');
const veuProjectController = require('../controllers/veuProjectController');
const taskFileController = require('../controllers/taskFileController');
const veuProjectFileController = require('../controllers/veuProjectFileController');
const inspectionController = require('../controllers/inspectionController');

// Repositories (for simple routes)
const systemSettingsRepository = require('../repositories/systemSettingsRepository');

// Upload middleware
const createUpload = require('../middlewares/upload');

// Middleware
const authMiddleware = require('../middlewares/authMiddleware');
const { validate } = require('../validators');

// Validators
const {
  createUserSchema,
  updateUserSchema,
  userIdParamSchema,
  listUsersQuerySchema,
} = require('../validators/userValidator');

const {
  createAgencySchema,
  updateAgencySchema,
  agencyIdParamSchema,
  listAgenciesQuerySchema,
  addWhitelistSchema,
} = require('../validators/agencyValidator');

const {
  createPropertySchema,
  updatePropertySchema,
  propertyIdParamSchema,
  listPropertiesQuerySchema,
} = require('../validators/propertyValidator');

const {
  createTaskSchema,
  createTasksSchema,
  updateTaskSchema,
  taskIdParamSchema,
  listTasksQuerySchema,
} = require('../validators/taskValidator');

const {
  createContactSchema,
  updateContactSchema,
  contactIdParamSchema,
  listContactsQuerySchema,
} = require('../validators/contactValidator');

const {
  processEmailSchema,
  emailIdParamSchema,
  listEmailsQuerySchema,
} = require('../validators/emailValidator');

const {
  createVeuProjectSchema,
  updateVeuProjectSchema,
  veuProjectIdParamSchema,
  listVeuProjectsQuerySchema,
} = require('../validators/veuProjectValidator');

// ==================== DASHBOARD ROUTE ====================
// Direct path for frontend compatibility (maps to same handler as /tasks/dashboard)
router.get('/dashboard',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'task'),
  taskController.getDashboardStats
);

// ==================== SETTINGS ROUTES ====================
router.get('/google-map-key',
  authMiddleware.authenticateToken,
  async (req, res, next) => {
    try {
      const key = await systemSettingsRepository.getGoogleMapKey();
      res.json({ success: true, data: { key: key || '' } });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/settings',
  authMiddleware.authenticateToken,
  async (req, res, next) => {
    try {
      const settings = await systemSettingsRepository.get();
      if (!settings) {
        return res.json({ success: true, data: {} });
      }
      res.json({
        success: true,
        data: {
          imap_host: settings.imapHost,
          imap_port: settings.imapPort,
          imap_user: settings.imapUser,
          imap_password: settings.imapPassword,
          email_user: settings.emailUser,
          email_password: settings.emailPassword,
          email_host: settings.emailHost,
          google_map_key: settings.googleMapKey,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.put('/settings',
  authMiddleware.authenticateToken,
  async (req, res, next) => {
    try {
      const settings = await systemSettingsRepository.update(req.body);
      res.json({
        success: true,
        data: {
          imap_host: settings.imapHost,
          imap_port: settings.imapPort,
          imap_user: settings.imapUser,
          imap_password: settings.imapPassword,
          email_user: settings.emailUser,
          email_password: settings.emailPassword,
          email_host: settings.emailHost,
          google_map_key: settings.googleMapKey,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== USER ROUTES ====================
router.get('/users',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'user'),
  validate(listUsersQuerySchema, 'query'),
  userController.listUsers
);

router.post('/users',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('create', 'user'),
  validate(createUserSchema),
  userController.createUser
);

router.get('/users/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'user'),
  validate(userIdParamSchema, 'params'),
  userController.getUserDetail
);

router.put('/users/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('update', 'user'),
  validate(userIdParamSchema, 'params'),
  validate(updateUserSchema),
  userController.updateUser
);

router.delete('/users/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('delete', 'user'),
  validate(userIdParamSchema, 'params'),
  userController.deleteUser
);

// ==================== AGENCY ROUTES ====================
router.get('/agencies',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'agency'),
  validate(listAgenciesQuerySchema, 'query'),
  agencyController.listAgencies
);

router.post('/agencies',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('create', 'agency'),
  validate(createAgencySchema),
  agencyController.createAgency
);

router.get('/agencies/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'agency'),
  validate(agencyIdParamSchema, 'params'),
  agencyController.getAgencyDetail
);

router.put('/agencies/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('update', 'agency'),
  validate(agencyIdParamSchema, 'params'),
  validate(updateAgencySchema),
  agencyController.updateAgency
);

router.delete('/agencies/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('delete', 'agency'),
  validate(agencyIdParamSchema, 'params'),
  agencyController.deleteAgency
);

router.post('/agencies/:id/activate-veu',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('update', 'agency'),
  validate(agencyIdParamSchema, 'params'),
  agencyController.activateVeu
);

router.get('/agencies/:id/whitelist',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'agency'),
  validate(agencyIdParamSchema, 'params'),
  agencyController.getWhitelist
);

router.post('/agencies/:id/whitelist',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('update', 'agency'),
  validate(agencyIdParamSchema, 'params'),
  validate(addWhitelistSchema),
  agencyController.addToWhitelist
);

router.delete('/agencies/:agency_id/whitelist/:whitelist_id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('delete', 'agency'),
  agencyController.removeFromWhitelist
);

// ==================== PROPERTY ROUTES ====================
router.get('/properties',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'property'),
  validate(listPropertiesQuerySchema, 'query'),
  propertyController.listProperties
);

router.post('/properties',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('create', 'property'),
  validate(createPropertySchema),
  propertyController.createProperty
);

router.put('/properties/batch-update-region',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('update', 'property'),
  async (req, res, next) => {
    try {
      const { property_ids, region } = req.body;
      if (!property_ids || !Array.isArray(property_ids) || property_ids.length === 0) {
        return res.status(400).json({ success: false, message: 'property_ids is required and must be a non-empty array' });
      }
      if (!region) {
        return res.status(400).json({ success: false, message: 'region is required' });
      }
      const propertyService = require('../services/propertyService');
      const result = await propertyService.batchUpdateRegion(property_ids, region, req.user);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/properties/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'property'),
  validate(propertyIdParamSchema, 'params'),
  propertyController.getPropertyDetail
);

router.put('/properties/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('update', 'property'),
  validate(propertyIdParamSchema, 'params'),
  validate(updatePropertySchema),
  propertyController.updateProperty
);

router.delete('/properties/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('delete', 'property'),
  validate(propertyIdParamSchema, 'params'),
  propertyController.deleteProperty
);

// ==================== TASK ROUTES ====================
router.get('/tasks',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'task'),
  validate(listTasksQuerySchema, 'query'),
  taskController.listTasks
);

router.get('/tasks/today',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'task'),
  taskController.getTasksDueToday
);

router.get('/tasks/dashboard',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'task'),
  taskController.getDashboardStats
);

router.post('/tasks',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('create', 'task'),
  validate(createTaskSchema),
  taskController.createTask
);

router.post('/tasks/batch',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('create', 'task'),
  validate(createTasksSchema),
  taskController.createTasks
);

router.get('/tasks/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'task'),
  validate(taskIdParamSchema, 'params'),
  taskController.getTaskDetail
);

router.put('/tasks/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('update', 'task'),
  validate(taskIdParamSchema, 'params'),
  validate(updateTaskSchema),
  taskController.updateTask
);

router.delete('/tasks/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('delete', 'task'),
  validate(taskIdParamSchema, 'params'),
  taskController.deleteTask
);

// ==================== CONTACT ROUTES ====================
router.get('/contacts',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'contact'),
  validate(listContactsQuerySchema, 'query'),
  contactController.listContacts
);

router.post('/contacts',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('create', 'contact'),
  validate(createContactSchema),
  contactController.createContact
);

router.get('/contacts/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'contact'),
  validate(contactIdParamSchema, 'params'),
  contactController.getContactDetail
);

router.put('/contacts/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('update', 'contact'),
  validate(contactIdParamSchema, 'params'),
  validate(updateContactSchema),
  contactController.updateContact
);

router.delete('/contacts/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('delete', 'contact'),
  validate(contactIdParamSchema, 'params'),
  contactController.deleteContact
);

// ==================== EMAIL ROUTES ====================
router.get('/emails',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'email'),
  validate(listEmailsQuerySchema, 'query'),
  emailController.listEmails
);

router.post('/emails/process',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('create', 'email'),
  validate(processEmailSchema),
  emailController.processEmail
);

router.get('/emails/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'email'),
  validate(emailIdParamSchema, 'params'),
  emailController.getEmailDetail
);

// ==================== VEU PROJECT ROUTES ====================
router.get('/veu-projects',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'veu_project'),
  validate(listVeuProjectsQuerySchema, 'query'),
  veuProjectController.listVeuProjects
);

router.get('/veu-projects/overview',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'veu_project'),
  veuProjectController.getVeuOverviewTree
);

router.post('/veu-projects',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('create', 'veu_project'),
  validate(createVeuProjectSchema),
  veuProjectController.createVeuProject
);

router.get('/veu-projects/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'veu_project'),
  validate(veuProjectIdParamSchema, 'params'),
  veuProjectController.getVeuProjectDetail
);

router.put('/veu-projects/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('update', 'veu_project'),
  validate(veuProjectIdParamSchema, 'params'),
  validate(updateVeuProjectSchema),
  veuProjectController.updateVeuProject
);

router.delete('/veu-projects/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('delete', 'veu_project'),
  validate(veuProjectIdParamSchema, 'params'),
  veuProjectController.deleteVeuProject
);

// Property VEU projects
router.get('/properties/:property_id/veu-projects',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'veu_project'),
  veuProjectController.getVeuProjectsByProperty
);

// ==================== TASK FILE ROUTES ====================
const taskFileUpload = createUpload(['application/pdf', 'image/jpeg', 'image/png', 'image/gif']);

router.get('/tasks/:taskId/files',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'task'),
  taskFileController.getTaskFiles
);

router.post('/tasks/:taskId/files',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('update', 'task'),
  taskFileUpload.single('file'),
  taskFileController.uploadTaskFile
);

router.get('/tasks/:taskId/files/:fileId/url',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'task'),
  taskFileController.getFileSignedUrl
);

router.delete('/tasks/:taskId/files/:fileId',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('delete', 'task'),
  taskFileController.deleteTaskFile
);

// ==================== VEU PROJECT FILE ROUTES ====================
const veuFileUpload = createUpload(['application/pdf', 'image/jpeg', 'image/png', 'image/gif']);

router.get('/veu-projects/:veuProjectId/files',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'veu_project'),
  veuProjectFileController.getVeuProjectFiles
);

router.post('/veu-projects/:veuProjectId/files',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('update', 'veu_project'),
  veuFileUpload.single('file'),
  veuProjectFileController.uploadVeuProjectFile
);

router.get('/veu-projects/:veuProjectId/files/:fileId/url',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'veu_project'),
  veuProjectFileController.getFileSignedUrl
);

router.delete('/veu-projects/:veuProjectId/files/:fileId',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('delete', 'veu_project'),
  veuProjectFileController.deleteVeuProjectFile
);

// ==================== INSPECTION CONFIG ROUTES ====================
router.get('/inspection/config',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'inspection'),
  inspectionController.getAllConfigs
);

router.get('/inspection/config/:region',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'inspection'),
  inspectionController.getConfigByRegion
);

router.put('/inspection/config/:region',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('update', 'inspection'),
  inspectionController.updateConfigByRegion
);

// ==================== INSPECTION SCHEDULE ROUTES ====================
router.get('/inspection/schedules',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'inspection'),
  inspectionController.listSchedules
);

router.post('/inspection/schedules',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('create', 'inspection'),
  inspectionController.createSchedule
);

router.get('/inspection/schedules/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'inspection'),
  inspectionController.getScheduleDetail
);

router.put('/inspection/schedules/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('update', 'inspection'),
  inspectionController.updateSchedule
);

router.delete('/inspection/schedules/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('delete', 'inspection'),
  inspectionController.deleteSchedule
);

router.get('/inspection/schedules/:id/properties',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'inspection'),
  inspectionController.getScheduleProperties
);

router.post('/inspection/schedules/:id/notify',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('update', 'inspection'),
  inspectionController.sendNotifications
);

// ==================== INSPECTION BOOKING ROUTES ====================
router.get('/inspection/bookings',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'inspection'),
  inspectionController.listBookings
);

router.get('/inspection/bookings/:id',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('read', 'inspection'),
  inspectionController.getBookingDetail
);

router.put('/inspection/bookings/:id/confirm',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('update', 'inspection'),
  inspectionController.confirmBooking
);

router.put('/inspection/bookings/:id/reject',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('update', 'inspection'),
  inspectionController.rejectBooking
);

router.put('/inspection/bookings/:id/reschedule',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('update', 'inspection'),
  inspectionController.rescheduleBooking
);

module.exports = router;
