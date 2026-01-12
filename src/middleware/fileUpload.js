const multer = require('multer');

/**
 * File Upload Middleware using Multer
 *
 * SECURITY FEATURES:
 * - Memory storage (files in buffer, not disk)
 * - File size limits
 * - File type validation
 * - Filename sanitization happens in mediaService
 */

// Memory storage (files stored in buffer)
const storage = multer.memoryStorage();

// File filter for images
const imageFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed'), false);
  }
};

// Single image upload (max 5MB)
const uploadSingleImage = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: imageFileFilter
}).single('image');

// Multiple images upload (max 10 files, 5MB each)
const uploadMultipleImages = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 10 // Maximum 10 files
  },
  fileFilter: imageFileFilter
}).array('images', 10);

// Cover image for insights
const uploadCoverImage = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: imageFileFilter
}).single('coverImage');

/**
 * Multer error handler middleware
 */
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Multer-specific errors
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB'
      });
    }

    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 10 files allowed'
      });
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field name for file upload'
      });
    }

    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  // Other errors
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload failed'
    });
  }

  next();
};

module.exports = {
  uploadSingleImage,
  uploadMultipleImages,
  uploadCoverImage,
  handleMulterError
};
