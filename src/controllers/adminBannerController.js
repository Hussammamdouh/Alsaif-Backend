const Banner = require('../models/Banner');
const { HTTP_STATUS, SUCCESS_MESSAGES, ERROR_MESSAGES } = require('../constants');
const logger = require('../utils/logger');

/**
 * Get all banners for admin management
 */
exports.getAllBanners = async (req, res, next) => {
    try {
        const banners = await Banner.find().sort({ order: 1, createdAt: -1 });

        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: 'Banners retrieved successfully',
            data: banners,
        });
    } catch (error) {
        logger.error('[AdminBanner] GetAllBanners failed:', error);
        next(error);
    }
};

/**
 * Create a new banner
 */
exports.createBanner = async (req, res, next) => {
    try {
        const { title, imageUrl, link, partner, isActive, order, type, displayDurationDays } = req.body;

        const banner = new Banner({
            title,
            imageUrl,
            link,
            partner,
            isActive,
            order,
            type,
            displayDurationDays,
        });

        await banner.save();

        res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: 'Banner created successfully',
            data: banner,
        });
    } catch (error) {
        logger.error('[AdminBanner] CreateBanner failed:', error);
        next(error);
    }
};

/**
 * Update an existing banner
 */
exports.updateBanner = async (req, res, next) => {
    try {
        const { bannerId } = req.params;
        const updateData = req.body;

        const banner = await Banner.findByIdAndUpdate(bannerId, updateData, {
            new: true,
            runValidators: true,
        });

        if (!banner) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: 'Banner not found',
            });
        }

        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: 'Banner updated successfully',
            data: banner,
        });
    } catch (error) {
        logger.error('[AdminBanner] UpdateBanner failed:', error);
        next(error);
    }
};

/**
 * Delete a banner
 */
exports.deleteBanner = async (req, res, next) => {
    try {
        const { bannerId } = req.params;

        const banner = await Banner.findByIdAndDelete(bannerId);

        if (!banner) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: 'Banner not found',
            });
        }

        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: 'Banner deleted successfully',
        });
    } catch (error) {
        logger.error('[AdminBanner] DeleteBanner failed:', error);
        next(error);
    }
};
