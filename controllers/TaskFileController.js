// src/controllers/taskFileController.js
const s3 = require("../config/aws");
const { v4: uuidv4 } = require("uuid");

// 引入 models 层
const taskFileModel = require("../models/taskFileModel");

/**
 * 上传文件到 S3 + 插入数据库记录
 */
exports.uploadTaskFile = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const file = req.file;   // 通过 multer 获取到
    const { desc } = req.body;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // 生成唯一的 fileKey
    const fileKey = `task-files/${taskId}/${uuidv4()}-${file.originalname}`;

    // 上传到 S3
    await s3
      .upload({
        Bucket: process.env.S3_BUCKET,
        Key: fileKey,
        Body: file.buffer,
      })
      .promise();

    // 调用 Model，往数据库插记录
    const newRecord = await taskFileModel.insertTaskFile(
      taskId,
      fileKey,
      file.originalname,
      desc
    );

    return res.status(200).json({
      message: "File uploaded successfully",
      data: newRecord,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 获取某个任务下的所有文件
 */
exports.getTaskFiles = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const files = await taskFileModel.getTaskFiles(taskId);
    return res.status(200).json(files);
  } catch (error) {
    next(error);
  }
};

/**
 * 删除文件：先删 S3 中的对象，再删数据库记录
 */
exports.deleteTaskFile = async (req, res, next) => {
  try {
    const { taskId, fileId } = req.params;

    // 先查出记录，获取 S3 key
    const fileRecord = await taskFileModel.getTaskFileById(fileId, taskId);
    if (!fileRecord) {
      return res.status(404).json({ message: "File record not found" });
    }

    // 删除 S3 上的文件
    await s3
      .deleteObject({
        Bucket: process.env.S3_BUCKET,
        Key: fileRecord.file_s3_key,
      })
      .promise();

    // 再删除数据库记录
    await taskFileModel.deleteTaskFile(fileId);

    return res.status(200).json({ message: "File deleted" });
  } catch (error) {
    next(error);
  }
};

/**
 * 根据 taskId, fileId 生成 S3 预签名URL
 */
exports.getFileSignedUrl = async (req, res, next) => {
  try {
    const { taskId, fileId } = req.params;

    // 1. 先查数据库，获取 file_s3_key
    const fileRecord = await taskFileModel.getTaskFileById(fileId, taskId);
    if (!fileRecord) {
      return res.status(404).json({ message: "File record not found" });
    }

    // 2. 生成预签名URL，有效期比如60秒
    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: fileRecord.file_s3_key,
      Expires: 60, // URL 有效期，单位秒
    };

    const signedUrl = s3.getSignedUrl("getObject", params);
    // 或者使用异步 Promise 版本：
    // const signedUrl = await s3.getSignedUrlPromise("getObject", params);

    res.status(200).json({ url: signedUrl });
  } catch (error) {
    next(error);
  }
};
