/**
 * VEU Project File Controller
 *
 * HTTP layer for VEU Project File endpoints.
 */

const { v4: uuidv4 } = require('uuid');
const s3 = require('../../config/aws');
const veuProjectFileRepository = require('../repositories/veuProjectFileRepository');
const veuProjectService = require('../services/veuProjectService');
const { sendSuccess, sendError } = require('../lib/response');
const { NotFoundError, ForbiddenError } = require('../lib/errors');
const logger = require('../lib/logger');

module.exports = {
  /**
   * Upload file to S3 and create database record
   * POST /api/veu-projects/:veuProjectId/files
   */
  uploadVeuProjectFile: async (req, res, next) => {
    try {
      const { veuProjectId } = req.params;
      const file = req.file;
      const { desc } = req.body;

      // Verify user has access to this VEU project
      await veuProjectService.getVeuProjectById(parseInt(veuProjectId, 10), req.user);

      if (!file) {
        return sendError(res, {
          statusCode: 400,
          message: 'No file uploaded',
        });
      }

      // Generate unique file key
      const fileKey = `veu-project-files/${veuProjectId}/${uuidv4()}-${file.originalname}`;

      // Upload to S3
      await s3
        .upload({
          Bucket: process.env.S3_BUCKET,
          Key: fileKey,
          Body: file.buffer,
        })
        .promise();

      // Create database record
      const newRecord = await veuProjectFileRepository.create({
        veu_project_id: parseInt(veuProjectId, 10),
        file_s3_key: fileKey,
        file_name: file.originalname,
        file_desc: desc,
      });

      sendSuccess(res, {
        message: 'File uploaded successfully',
        data: formatVeuProjectFile(newRecord),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get all files for a VEU project
   * GET /api/veu-projects/:veuProjectId/files
   */
  getVeuProjectFiles: async (req, res, next) => {
    try {
      const { veuProjectId } = req.params;

      // Verify user has access to this VEU project
      await veuProjectService.getVeuProjectById(parseInt(veuProjectId, 10), req.user);

      const files = await veuProjectFileRepository.findByVeuProjectId(parseInt(veuProjectId, 10));

      sendSuccess(res, {
        data: files.map(formatVeuProjectFile),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete file from S3 and database
   * DELETE /api/veu-projects/:veuProjectId/files/:fileId
   */
  deleteVeuProjectFile: async (req, res, next) => {
    try {
      const { veuProjectId, fileId } = req.params;

      // Verify user has access to this VEU project
      await veuProjectService.getVeuProjectById(parseInt(veuProjectId, 10), req.user);

      const fileRecord = await veuProjectFileRepository.findById(parseInt(fileId, 10));
      if (!fileRecord || fileRecord.veuProjectId !== parseInt(veuProjectId, 10)) {
        throw new NotFoundError('File');
      }

      // Delete from S3
      await s3
        .deleteObject({
          Bucket: process.env.S3_BUCKET,
          Key: fileRecord.fileS3Key,
        })
        .promise();

      // Delete from database
      await veuProjectFileRepository.delete(parseInt(fileId, 10));

      sendSuccess(res, {
        message: 'File deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get signed URL for file download
   * GET /api/veu-projects/:veuProjectId/files/:fileId/url
   */
  getFileSignedUrl: async (req, res, next) => {
    try {
      const { veuProjectId, fileId } = req.params;

      // Verify user has access to this VEU project
      await veuProjectService.getVeuProjectById(parseInt(veuProjectId, 10), req.user);

      const fileRecord = await veuProjectFileRepository.findById(parseInt(fileId, 10));
      if (!fileRecord || fileRecord.veuProjectId !== parseInt(veuProjectId, 10)) {
        throw new NotFoundError('File');
      }

      const signedUrl = s3.getSignedUrl('getObject', {
        Bucket: process.env.S3_BUCKET,
        Key: fileRecord.fileS3Key,
        Expires: 3600, // 1 hour
      });

      sendSuccess(res, {
        data: {
          url: signedUrl,
          file_name: fileRecord.fileName,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

function formatVeuProjectFile(file) {
  return {
    id: file.id,
    veu_project_id: file.veuProjectId,
    file_s3_key: file.fileS3Key,
    file_name: file.fileName,
    file_desc: file.fileDesc,
    created_at: file.createdAt,
    updated_at: file.updatedAt,
  };
}
