const mediaService = require('../services/mediaService');
const { HTTP_STATUS } = require('../constants');

class MediaController {
  /**
   * Upload single image
   * POST /api/media/upload
   */
  async uploadImage(req, res, next) {
    try {
      if (!req.file) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'No file provided'
        });
      }

      const result = await mediaService.uploadImage(req.file);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Image uploaded successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upload multiple images
   * POST /api/media/upload-multiple
   */
  async uploadMultipleImages(req, res, next) {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'No files provided'
        });
      }

      const results = await mediaService.uploadMultipleImages(req.files);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: `${results.length} images uploaded successfully`,
        data: { images: results }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete image
   * DELETE /api/media/:filename
   */
  async deleteImage(req, res, next) {
    try {
      const { filename } = req.params;

      const success = await mediaService.deleteImage(filename);

      if (!success) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Image not found or deletion failed'
        });
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Image deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get image metadata
   * GET /api/media/:filename/metadata
   */
  async getImageMetadata(req, res, next) {
    try {
      const { filename } = req.params;

      const metadata = await mediaService.getImageMetadata(filename);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: metadata
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List all images (admin only)
   * GET /api/media?page=1&limit=20
   */
  async listImages(req, res, next) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;

      const result = await mediaService.listImages(page, limit);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MediaController();
