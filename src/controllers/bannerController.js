const Banner = require('../models/Banner');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');

/**
 * Get active banners for the home screen
 * Supports filtering by type (free, premium, both)
 */
exports.getActiveBanners = async (req, res, next) => {
    try {
        const { type } = req.query; // 'free' or 'premium'

        const query = { isActive: true };
        if (type) {
            query.type = { $in: [type, 'both'] };
        }

        let banners = await Banner.find(query).sort({ order: 1, createdAt: -1 });

        // Filter by duration if displayDurationDays is set
        const now = new Date();
        banners = banners.filter(banner => {
            if (!banner.displayDurationDays) return true;

            const createdAt = new Date(banner.createdAt);
            const expiryDate = new Date(createdAt);
            expiryDate.setDate(createdAt.getDate() + banner.displayDurationDays);

            return now < expiryDate;
        });

        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: banners,
        });
    } catch (error) {
        logger.error('[Banner] GetActiveBanners failed:', error);
        next(error);
    }
};
