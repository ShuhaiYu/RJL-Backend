// controllers/veuProjectController.js
const veuProjectModel = require('../models/veuProjectModel');
const userModel = require('../models/userModel');

module.exports = {
  /** GET /properties/:propertyId/veu-projects */
  listByProperty: async (req, res, next) => {
    try {
      const propertyId = parseInt(req.params.propertyId, 10);
      const projects = await veuProjectModel.getVeuProjectsByPropertyId(propertyId);
      return res.status(200).json(projects);
    } catch (err) {
      next(err);
    }
  },

  /** POST /properties/:propertyId/veu-projects/init  create default two records */
  initByProperty: async (req, res, next) => {
    try {
      const propertyId = parseInt(req.params.propertyId, 10);
      const inserted = await veuProjectModel.createVeuProjectsForProperty(propertyId);
      return res.status(201).json(inserted);
    } catch (err) {
      next(err);
    }
  },

  /** PUT /veu-projects/:id */
  updateById: async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const updated = await veuProjectModel.updateVeuProject(id, req.body);
      if (!updated) {
        return res.status(404).json({ message: 'VEU project not found' });
      }
      return res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  },

  /** GET /veu/incomplete */
  listIncompleteVeu: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      const data = await veuProjectModel.listIncompleteVeuProjects(user);
      return res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  },

  /** GET /veu/incomplete/water-heater */
  listIncompleteVeuWaterHeater: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      const data = await veuProjectModel.listIncompleteVeuProjectsByType(user, 'water_heater');
      return res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  },

  /** GET /veu/incomplete/air-conditioner */
  listIncompleteVeuAirConditioner: async (req, res, next) => {
    try {
      const user = await userModel.getUserById(req.user.user_id);
      const data = await veuProjectModel.listIncompleteVeuProjectsByType(user, 'air_conditioner');
      return res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  },
  
  /**
   * 统一聚合接口：
   * GET /api/veu/report/overview
   * 返回 { scope, agencies: [{ agency_id, agency_name, metrics, pie, users: [...] }] }
   */
  getVeuOverview: async (req, res, next) => {
    try {
      const requestingUser = await userModel.getUserById(req.user.user_id);
      const data = await veuProjectModel.getVeuOverviewTree(requestingUser);
      return res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  },
};