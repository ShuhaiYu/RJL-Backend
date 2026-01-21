/**
 * File Upload Middleware
 *
 * Configures multer for handling file uploads with enhanced security.
 */

const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

// Map of allowed MIME types to their valid extensions
const MIME_TO_EXTENSIONS = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
};

// Dangerous file extensions that should never be allowed
const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.jar',
  '.msi', '.dll', '.com', '.scr', '.pif', '.application', '.gadget',
  '.msp', '.hta', '.cpl', '.msc', '.ws', '.wsf', '.wsc', '.wsh',
  '.php', '.phtml', '.php3', '.php4', '.php5', '.asp', '.aspx',
  '.jsp', '.jspx', '.py', '.pl', '.cgi', '.htaccess',
];

/**
 * Validate file extension matches MIME type
 */
function validateExtension(file, allowedTypes) {
  const ext = path.extname(file.originalname).toLowerCase();

  // Check for dangerous extensions
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    return false;
  }

  // Verify extension matches allowed MIME type
  const allowedExtensions = allowedTypes
    .map((mime) => MIME_TO_EXTENSIONS[mime] || [])
    .flat();

  return allowedExtensions.includes(ext);
}

/**
 * Generate a secure random filename while preserving extension
 */
function generateSecureFilename(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const randomName = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `${timestamp}-${randomName}${ext}`;
}

/**
 * Create upload middleware with enhanced security
 * @param {string[]} allowedTypes - Array of allowed MIME types
 * @param {Object} options - Additional options
 * @param {number} options.maxFileSize - Max file size in bytes (default: 10MB)
 * @param {boolean} options.randomizeFilename - Whether to randomize filename (default: true)
 */
function createUpload(allowedTypes = ['application/pdf'], options = {}) {
  const { maxFileSize = 10 * 1024 * 1024, randomizeFilename = true } = options;

  const storage = multer.memoryStorage();

  function fileFilter(req, file, cb) {
    // Validate MIME type
    if (!allowedTypes.includes(file.mimetype)) {
      const allowedList = allowedTypes.join(', ');
      return cb(new Error(`Invalid file type. Allowed types: ${allowedList}`));
    }

    // Validate extension matches MIME type
    if (!validateExtension(file, allowedTypes)) {
      return cb(new Error('File extension does not match file type'));
    }

    // Generate secure filename if enabled
    if (randomizeFilename) {
      file.secureFilename = generateSecureFilename(file.originalname);
    }

    cb(null, true);
  }

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: maxFileSize,
      files: 5, // Max 5 files per request
    },
  });
}

module.exports = createUpload;
module.exports.generateSecureFilename = generateSecureFilename;
module.exports.MIME_TO_EXTENSIONS = MIME_TO_EXTENSIONS;
