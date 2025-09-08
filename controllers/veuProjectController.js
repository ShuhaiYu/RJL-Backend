const veuProjectModel = require("../models/veuProjectModel");
const pool = require("../config/db");

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
        return res.status(404).json({ message: "VEU project not found" });
      }
      return res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  },
};
