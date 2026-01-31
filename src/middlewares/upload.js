/**
 * File Upload Middleware
 *
 * Configures multer for handling file uploads with enhanced security.
 * Includes magic byte validation to verify actual file types.
 */

const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

// File magic bytes (signatures) for common file types
// These are the first bytes of a file that identify its type
const FILE_SIGNATURES = {
  // PDF: %PDF
  'application/pdf': [
    { bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 },
  ],
  // JPEG: FFD8FF
  'image/jpeg': [
    { bytes: [0xFF, 0xD8, 0xFF], offset: 0 },
  ],
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  'image/png': [
    { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], offset: 0 },
  ],
  // GIF: GIF87a or GIF89a
  'image/gif': [
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], offset: 0 },
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], offset: 0 },
  ],
  // WebP: RIFF....WEBP
  'image/webp': [
    { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, additional: { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 } },
  ],
  // DOC: D0 CF 11 E0 (OLE Compound Document)
  'application/msword': [
    { bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], offset: 0 },
  ],
  // DOCX/XLSX: PK (ZIP-based)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    { bytes: [0x50, 0x4B, 0x03, 0x04], offset: 0 },
    { bytes: [0x50, 0x4B, 0x05, 0x06], offset: 0 },
    { bytes: [0x50, 0x4B, 0x07, 0x08], offset: 0 },
  ],
  'application/vnd.ms-excel': [
    { bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], offset: 0 },
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    { bytes: [0x50, 0x4B, 0x03, 0x04], offset: 0 },
    { bytes: [0x50, 0x4B, 0x05, 0x06], offset: 0 },
    { bytes: [0x50, 0x4B, 0x07, 0x08], offset: 0 },
  ],
  // TXT and CSV don't have magic bytes - they are validated differently
};

/**
 * Check if buffer matches a file signature
 * @param {Buffer} buffer - File buffer
 * @param {Object} signature - Signature object with bytes array and offset
 * @returns {boolean}
 */
function matchesSignature(buffer, signature) {
  const { bytes, offset, additional } = signature;

  // Check main signature
  for (let i = 0; i < bytes.length; i++) {
    if (buffer[offset + i] !== bytes[i]) {
      return false;
    }
  }

  // Check additional signature if present (e.g., WebP has RIFF...WEBP)
  if (additional) {
    for (let i = 0; i < additional.bytes.length; i++) {
      if (buffer[additional.offset + i] !== additional.bytes[i]) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Validate file content matches declared MIME type using magic bytes
 * @param {Buffer} buffer - File buffer
 * @param {string} mimeType - Declared MIME type
 * @returns {boolean}
 */
function validateMagicBytes(buffer, mimeType) {
  // Text files don't have magic bytes - basic validation only
  if (mimeType === 'text/plain' || mimeType === 'text/csv') {
    // Check for binary content in what should be text
    // If first 512 bytes contain null bytes, it's likely not a text file
    const checkLength = Math.min(512, buffer.length);
    for (let i = 0; i < checkLength; i++) {
      if (buffer[i] === 0) {
        return false; // Binary content in text file
      }
    }
    return true;
  }

  const signatures = FILE_SIGNATURES[mimeType];
  if (!signatures) {
    // Unknown MIME type - skip magic byte validation
    // This is a fail-open approach; consider fail-close for higher security
    return true;
  }

  // Check if buffer matches any of the valid signatures for this MIME type
  return signatures.some((sig) => matchesSignature(buffer, sig));
}

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
 * @param {boolean} options.validateContent - Whether to validate file content magic bytes (default: true)
 */
function createUpload(allowedTypes = ['application/pdf'], options = {}) {
  const { maxFileSize = 10 * 1024 * 1024, randomizeFilename = true, validateContent = true } = options;

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

    // Store validation flag for post-upload validation
    file.needsContentValidation = validateContent;
    file.declaredMimeType = file.mimetype;

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

/**
 * Middleware to validate file content after upload
 * Must be used AFTER multer middleware in the chain
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
function validateUploadedFiles(req, res, next) {
  const files = req.files || (req.file ? [req.file] : []);

  for (const file of files) {
    if (file.needsContentValidation && file.buffer) {
      if (!validateMagicBytes(file.buffer, file.declaredMimeType)) {
        return res.status(400).json({
          success: false,
          error: `File "${file.originalname}" content does not match its declared type. The file may be corrupted or have an incorrect extension.`,
        });
      }
    }
  }

  next();
}

module.exports = createUpload;
module.exports.generateSecureFilename = generateSecureFilename;
module.exports.validateUploadedFiles = validateUploadedFiles;
module.exports.validateMagicBytes = validateMagicBytes;
module.exports.MIME_TO_EXTENSIONS = MIME_TO_EXTENSIONS;
