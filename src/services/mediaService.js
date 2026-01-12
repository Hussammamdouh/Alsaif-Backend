const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const crypto = require('crypto');

/**
 * Media Management Service
 *
 * Features:
 * - Image upload and optimization
 * - Image resizing (thumbnails, different sizes)
 * - File validation
 * - Secure filename generation
 * - Local storage (S3-compatible for future migration)
 * - File deletion
 *
 * Future: Can easily switch to S3/Cloudinary by changing storage methods
 */

class MediaService {
  constructor() {
    // Upload directory
    this.uploadDir = path.join(__dirname, '../../uploads');
    this.publicDir = path.join(__dirname, '../../public/uploads');

    // Allowed file types
    this.allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    this.allowedDocumentTypes = ['application/pdf'];

    // Image sizes for responsive images
    this.imageSizes = {
      thumbnail: { width: 200, height: 200 },
      small: { width: 400, height: 300 },
      medium: { width: 800, height: 600 },
      large: { width: 1200, height: 900 }
    };

    // Max file sizes (in bytes)
    this.maxImageSize = 5 * 1024 * 1024; // 5MB
    this.maxDocumentSize = 10 * 1024 * 1024; // 10MB

    // Initialize upload directory
    this.initializeUploadDir();
  }

  /**
   * Initialize upload directories
   */
  async initializeUploadDir() {
    try {
      const dirs = [
        this.publicDir,
        path.join(this.publicDir, 'images'),
        path.join(this.publicDir, 'thumbnails'),
        path.join(this.publicDir, 'documents')
      ];

      for (const dir of dirs) {
        try {
          await fs.access(dir);
        } catch {
          await fs.mkdir(dir, { recursive: true });
        }
      }
    } catch (error) {
      console.error('Failed to initialize upload directories:', error);
    }
  }

  /**
   * Generate secure filename
   *
   * @param {string} originalName - Original filename
   * @returns {string} Secure filename
   */
  generateSecureFilename(originalName) {
    const ext = path.extname(originalName).toLowerCase();
    const randomString = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    return `${timestamp}-${randomString}${ext}`;
  }

  /**
   * Validate image file
   *
   * @param {Object} file - Multer file object
   * @throws {Error} If validation fails
   */
  validateImage(file) {
    if (!file) {
      throw new Error('No file provided');
    }

    if (!this.allowedImageTypes.includes(file.mimetype)) {
      throw new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed');
    }

    if (file.size > this.maxImageSize) {
      throw new Error(`File too large. Maximum size is ${this.maxImageSize / (1024 * 1024)}MB`);
    }
  }

  /**
   * Upload and process image
   *
   * @param {Object} file - Multer file object
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Upload result with URLs
   */
  async uploadImage(file, options = {}) {
    this.validateImage(file);

    const secureFilename = this.generateSecureFilename(file.originalname);
    const imagesDir = path.join(this.publicDir, 'images');
    const thumbnailsDir = path.join(this.publicDir, 'thumbnails');

    // Save original (optimized)
    const originalPath = path.join(imagesDir, secureFilename);
    await sharp(file.buffer)
      .resize(this.imageSizes.large.width, this.imageSizes.large.height, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85, progressive: true })
      .toFile(originalPath);

    // Generate thumbnail
    const thumbnailFilename = `thumb-${secureFilename}`;
    const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename);
    await sharp(file.buffer)
      .resize(this.imageSizes.thumbnail.width, this.imageSizes.thumbnail.height, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);

    // Get file info
    const stats = await fs.stat(originalPath);

    return {
      filename: secureFilename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: stats.size,
      url: `/uploads/images/${secureFilename}`,
      thumbnailUrl: `/uploads/thumbnails/${thumbnailFilename}`,
      uploadedAt: new Date()
    };
  }

  /**
   * Upload multiple images
   *
   * @param {Array} files - Array of multer file objects
   * @returns {Promise<Array>} Upload results
   */
  async uploadMultipleImages(files) {
    if (!files || files.length === 0) {
      throw new Error('No files provided');
    }

    if (files.length > 10) {
      throw new Error('Maximum 10 files allowed per upload');
    }

    const uploadPromises = files.map(file => this.uploadImage(file));
    return await Promise.all(uploadPromises);
  }

  /**
   * Delete image
   *
   * @param {string} filename - Filename to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteImage(filename) {
    try {
      const imagePath = path.join(this.publicDir, 'images', filename);
      const thumbnailPath = path.join(this.publicDir, 'thumbnails', `thumb-${filename}`);

      // Delete original
      try {
        await fs.unlink(imagePath);
      } catch (error) {
        console.error(`Failed to delete image: ${filename}`, error);
      }

      // Delete thumbnail
      try {
        await fs.unlink(thumbnailPath);
      } catch (error) {
        console.error(`Failed to delete thumbnail: thumb-${filename}`, error);
      }

      return true;
    } catch (error) {
      console.error('Error deleting image:', error);
      return false;
    }
  }

  /**
   * Delete multiple images
   *
   * @param {Array<string>} filenames - Array of filenames
   * @returns {Promise<Object>} Deletion results
   */
  async deleteMultipleImages(filenames) {
    const results = {
      deleted: [],
      failed: []
    };

    for (const filename of filenames) {
      const success = await this.deleteImage(filename);
      if (success) {
        results.deleted.push(filename);
      } else {
        results.failed.push(filename);
      }
    }

    return results;
  }

  /**
   * Get image metadata
   *
   * @param {string} filename - Filename
   * @returns {Promise<Object>} Image metadata
   */
  async getImageMetadata(filename) {
    const imagePath = path.join(this.publicDir, 'images', filename);

    try {
      const stats = await fs.stat(imagePath);
      const metadata = await sharp(imagePath).metadata();

      return {
        filename,
        size: stats.size,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime
      };
    } catch (error) {
      throw new Error(`Image not found: ${filename}`);
    }
  }

  /**
   * List all uploaded images (paginated)
   *
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} List of images with pagination
   */
  async listImages(page = 1, limit = 20) {
    const imagesDir = path.join(this.publicDir, 'images');
    const files = await fs.readdir(imagesDir);

    // Filter only image files
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    });

    // Sort by modification time (newest first)
    const filesWithStats = await Promise.all(
      imageFiles.map(async (file) => {
        const filePath = path.join(imagesDir, file);
        const stats = await fs.stat(filePath);
        return { file, mtime: stats.mtime, size: stats.size };
      })
    );

    filesWithStats.sort((a, b) => b.mtime - a.mtime);

    // Pagination
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedFiles = filesWithStats.slice(start, end);

    const images = paginatedFiles.map(({ file, size, mtime }) => ({
      filename: file,
      url: `/uploads/images/${file}`,
      thumbnailUrl: `/uploads/thumbnails/thumb-${file}`,
      size,
      uploadedAt: mtime
    }));

    return {
      images,
      total: filesWithStats.length,
      page,
      limit,
      totalPages: Math.ceil(filesWithStats.length / limit)
    };
  }
}

module.exports = new MediaService();
