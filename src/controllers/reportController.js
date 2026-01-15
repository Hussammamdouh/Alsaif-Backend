const Report = require('../models/Report');
const FlaggedContent = require('../models/FlaggedContent');
const Insight = require('../models/Insight');
const Comment = require('../models/Comment');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../constants');
const logger = require('../utils/logger');
const { emitContentReported } = require('../events/enhancedNotificationEvents');

class ReportController {
    /**
     * Create a report for an insight or comment
     * POST /api/reports
     */
    async createReport(req, res, next) {
        try {
            const { targetType, targetId, reason, description } = req.body;
            const userId = req.user.id;

            // Validate target type
            if (!['insight', 'comment'].includes(targetType)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: 'Invalid target type. Must be "insight" or "comment".',
                });
            }

            // Check if target exists
            let target;
            let contentModel;
            if (targetType === 'insight') {
                target = await Insight.findById(targetId);
                contentModel = 'Insight';
            } else {
                target = await Comment.findById(targetId);
                contentModel = 'Comment';
            }

            if (!target) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    message: ERROR_MESSAGES.RESOURCE_NOT_FOUND,
                });
            }

            // Check if user already reported this target (pending or reviewing)
            const alreadyReported = await Report.hasReported(userId, targetType, targetId);
            if (alreadyReported) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: 'You have already reported this content.',
                });
            }

            // Create Report
            const report = await Report.create({
                targetType,
                targetId,
                targetModel: contentModel,
                reporter: userId,
                reason,
                description,
                status: 'pending',
            });

            // Integrate with FlaggedContent for Admin Moderation Screen
            // We check if a FlaggedContent already exists for this content
            let flagged = await FlaggedContent.findOne({ contentType: targetType, contentId: targetId, resolved: false });

            if (flagged) {
                // Update existing flag (maybe increment severity or update reason)
                // For simplicity, we just keep the highest severity or update the count if we had one
                // FlaggedContent doesn't have a count, but we can update the note or reason
                flagged.note = (flagged.note || '') + `\nAdditional report: ${reason}`;
                await flagged.save();
            } else {
                // Create new FlaggedContent
                await FlaggedContent.create({
                    contentType: targetType,
                    contentId: targetId,
                    contentModel: contentModel,
                    reason: reason,
                    severity: 'medium', // Default for user reports
                    flaggedBy: userId,
                    resolved: false,
                });
            }

            // NOTIFICATION: Notify Admins
            emitContentReported({
                reportId: report._id,
                contentType: targetType,
                contentId: targetId,
                reporterId: userId,
                reason: reason
            });

            logger.info(`[ReportController] User ${userId} reported ${targetType} ${targetId}`);

            res.status(HTTP_STATUS.CREATED).json({
                success: true,
                message: 'Report submitted successfully.',
                data: { report },
            });
        } catch (error) {
            logger.error('[ReportController] Create report error:', error);
            next(error);
        }
    }

    /**
     * Get reports for current user
     * GET /api/reports/me
     */
    async getMyReports(req, res, next) {
        try {
            const userId = req.user.id;
            const { page = 1, limit = 20 } = req.query;

            const result = await Report.getByUser(userId, {
                page: parseInt(page),
                limit: parseInt(limit),
            });

            res.status(HTTP_STATUS.OK).json({
                success: true,
                data: result,
            });
        } catch (error) {
            logger.error('[ReportController] Get my reports error:', error);
            next(error);
        }
    }
}

module.exports = new ReportController();
