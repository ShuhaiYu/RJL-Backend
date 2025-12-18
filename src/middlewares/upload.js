/**
 * File Upload Middleware
 *
 * Configures multer for handling file uploads.
 */

const multer = require('multer');

function createUpload(allowedTypes = ['application/pdf']) {
  const storage = multer.memoryStorage();

  function fileFilter(req, file, cb) {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const allowedList = allowedTypes.join(', ');
      cb(new Error(`Invalid file type. Allowed types: ${allowedList}`));
    }
  }

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  });
}

module.exports = createUpload;
