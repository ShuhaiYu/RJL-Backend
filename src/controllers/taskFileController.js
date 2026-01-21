/**
 * Task File Controller
 *
 * HTTP layer for Task File endpoints.
 */

const { v4: uuidv4 } = require('uuid');
const s3 = require('../../config/aws');
const taskFileRepository = require('../repositories/taskFileRepository');
const taskService = require('../services/taskService');
const { sendSuccess, sendError } = require('../lib/response');
const { NotFoundError, ForbiddenError } = require('../lib/errors');
const logger = require('../lib/logger');

module.exports = {
  /**
   * Upload file to S3 and create database record
   * POST /api/tasks/:taskId/files
   */
  uploadTaskFile: async (req, res, next) => {
    try {
      const { taskId } = req.params;
      const file = req.file;
      const { desc } = req.body;

      // Verify user has access to this task
      await taskService.getTaskById(parseInt(taskId, 10), req.user);

      if (!file) {
        return sendError(res, {
          statusCode: 400,
          message: 'No file uploaded',
        });
      }

      // Generate unique file key
      const fileKey = `task-files/${taskId}/${uuidv4()}-${file.originalname}`;

      // Upload to S3
      await s3
        .upload({
          Bucket: process.env.S3_BUCKET,
          Key: fileKey,
          Body: file.buffer,
        })
        .promise();

      // Create database record
      const newRecord = await taskFileRepository.create({
        task_id: parseInt(taskId, 10),
        file_s3_key: fileKey,
        file_name: file.originalname,
        file_desc: desc,
      });

      sendSuccess(res, {
        message: 'File uploaded successfully',
        data: formatTaskFile(newRecord),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get all files for a task
   * GET /api/tasks/:taskId/files
   */
  getTaskFiles: async (req, res, next) => {
    try {
      const { taskId } = req.params;

      // Verify user has access to this task
      await taskService.getTaskById(parseInt(taskId, 10), req.user);

      const files = await taskFileRepository.findByTaskId(parseInt(taskId, 10));

      sendSuccess(res, {
        data: files.map(formatTaskFile),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete file from S3 and database
   * DELETE /api/tasks/:taskId/files/:fileId
   */
  deleteTaskFile: async (req, res, next) => {
    try {
      const { taskId, fileId } = req.params;

      // Verify user has access to this task
      await taskService.getTaskById(parseInt(taskId, 10), req.user);

      const fileRecord = await taskFileRepository.findById(parseInt(fileId, 10));
      if (!fileRecord || fileRecord.taskId !== parseInt(taskId, 10)) {
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
      await taskFileRepository.delete(parseInt(fileId, 10));

      sendSuccess(res, {
        message: 'File deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get signed URL for file download
   * GET /api/tasks/:taskId/files/:fileId/url
   */
  getFileSignedUrl: async (req, res, next) => {
    try {
      const { taskId, fileId } = req.params;

      // Verify user has access to this task
      await taskService.getTaskById(parseInt(taskId, 10), req.user);

      const fileRecord = await taskFileRepository.findById(parseInt(fileId, 10));
      if (!fileRecord || fileRecord.taskId !== parseInt(taskId, 10)) {
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

function formatTaskFile(file) {
  return {
    id: file.id,
    task_id: file.taskId,
    file_s3_key: file.fileS3Key,
    file_name: file.fileName,
    file_desc: file.fileDesc,
    created_at: file.createdAt,
    updated_at: file.updatedAt,
  };
}
