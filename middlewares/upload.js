// src/middlewares/upload.js
const multer = require("multer");

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  // 只接受图片或 PDF
  if (
    file.mimetype.startsWith("image/") || 
    file.mimetype === "application/pdf"
  ) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only images and PDFs are allowed!"));
  }
}

const upload = multer({
  storage,
  fileFilter,
//   limits: {
//     fileSize: 5 * 1024 * 1024, // 可选，限制大小 (5MB)
//   },
});

module.exports = upload;
