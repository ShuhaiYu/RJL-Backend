/**
 * Task File Repository
 *
 * Data access layer for TaskFile entity using Prisma.
 */

const prisma = require('../config/prisma');

const taskFileRepository = {
  /**
   * Find file by ID
   */
  async findById(id) {
    return prisma.taskFile.findUnique({
      where: { id },
      include: {
        task: true,
      },
    });
  },

  /**
   * Find files by task ID
   */
  async findByTaskId(taskId) {
    return prisma.taskFile.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Create a new task file
   */
  async create(data) {
    return prisma.taskFile.create({
      data: {
        taskId: data.task_id,
        fileS3Key: data.file_s3_key,
        fileName: data.file_name,
        fileDesc: data.file_desc,
      },
      include: {
        task: true,
      },
    });
  },

  /**
   * Create many task files (batch)
   */
  async createMany(filesData) {
    const files = filesData.map((data) => ({
      taskId: data.task_id,
      fileS3Key: data.file_s3_key,
      fileName: data.file_name,
      fileDesc: data.file_desc,
    }));

    return prisma.taskFile.createMany({
      data: files,
    });
  },

  /**
   * Update a task file
   */
  async update(id, data) {
    const updateData = {};
    if (data.file_name !== undefined) updateData.fileName = data.file_name;
    if (data.file_desc !== undefined) updateData.fileDesc = data.file_desc;

    return prisma.taskFile.update({
      where: { id },
      data: updateData,
    });
  },

  /**
   * Delete a task file
   */
  async delete(id) {
    return prisma.taskFile.delete({
      where: { id },
    });
  },

  /**
   * Delete all files for a task
   */
  async deleteByTaskId(taskId) {
    return prisma.taskFile.deleteMany({
      where: { taskId },
    });
  },
};

module.exports = taskFileRepository;
