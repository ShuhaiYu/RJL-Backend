/**
 * VEU Project File Repository
 *
 * Data access layer for VeuProjectFile entity using Prisma.
 */

const prisma = require('../config/prisma');

const veuProjectFileRepository = {
  /**
   * Find file by ID
   */
  async findById(id) {
    return prisma.veuProjectFile.findUnique({
      where: { id },
      include: {
        veuProject: true,
      },
    });
  },

  /**
   * Find files by VEU project ID
   */
  async findByVeuProjectId(veuProjectId) {
    return prisma.veuProjectFile.findMany({
      where: { veuProjectId },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Create a new VEU project file
   */
  async create(data) {
    return prisma.veuProjectFile.create({
      data: {
        veuProjectId: data.veu_project_id,
        fileS3Key: data.file_s3_key,
        fileName: data.file_name,
        fileDesc: data.file_desc || '',
      },
      include: {
        veuProject: true,
      },
    });
  },

  /**
   * Create many VEU project files (batch)
   */
  async createMany(filesData) {
    const files = filesData.map((data) => ({
      veuProjectId: data.veu_project_id,
      fileS3Key: data.file_s3_key,
      fileName: data.file_name,
      fileDesc: data.file_desc || '',
    }));

    return prisma.veuProjectFile.createMany({
      data: files,
    });
  },

  /**
   * Update a VEU project file
   */
  async update(id, data) {
    const updateData = {};
    if (data.file_name !== undefined) updateData.fileName = data.file_name;
    if (data.file_desc !== undefined) updateData.fileDesc = data.file_desc;

    return prisma.veuProjectFile.update({
      where: { id },
      data: updateData,
    });
  },

  /**
   * Delete a VEU project file
   */
  async delete(id) {
    return prisma.veuProjectFile.delete({
      where: { id },
    });
  },

  /**
   * Delete all files for a VEU project
   */
  async deleteByVeuProjectId(veuProjectId) {
    return prisma.veuProjectFile.deleteMany({
      where: { veuProjectId },
    });
  },
};

module.exports = veuProjectFileRepository;
