const insightRequestService = require('../services/insightRequestService');
const { HTTP_STATUS } = require('../constants');
const { getPaginationParams } = require('../utils/pagination');

class InsightRequestController {
    /**
     * Submit a new insight request
     * POST /api/insights/requests
     */
    async submitRequest(req, res, next) {
        try {
            const { title, details } = req.body;
            const request = await insightRequestService.createRequest(req.user.id, { title, details });

            res.status(HTTP_STATUS.CREATED).json({
                success: true,
                message: 'Insight request submitted successfully',
                data: { request }
            });
        } catch (error) {
            if (error.statusCode) {
                return res.status(error.statusCode).json({
                    success: false,
                    message: error.message
                });
            }
            next(error);
        }
    }

    /**
     * Get user's own requests
     * GET /api/insight-requests/my
     */
    async getMyRequests(req, res, next) {
        try {
            const { page, limit } = getPaginationParams(req.query);
            const result = await insightRequestService.getUserRequests(req.user.id, { page, limit });

            res.status(HTTP_STATUS.OK).json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get all insight requests (Admin)
     * GET /api/admin/insights/requests
     */
    async getRequests(req, res, next) {
        try {
            const { page, limit } = getPaginationParams(req.query);
            const { status } = req.query;

            const query = {};
            if (status) query.status = status;

            const result = await insightRequestService.getAllRequests(query, { page, limit });

            res.status(HTTP_STATUS.OK).json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Moderate an insight request (Admin)
     * POST /api/admin/insights/requests/:requestId/moderate
     */
    async moderateRequest(req, res, next) {
        try {
            const { requestId } = req.params;
            const { status, rejectionReason, targetType } = req.body;

            const request = await insightRequestService.moderateRequest(requestId, req.user.id, {
                status,
                rejectionReason,
                targetType
            });

            res.status(HTTP_STATUS.OK).json({
                success: true,
                message: `Request ${status} successfully`,
                data: { request }
            });
        } catch (error) {
            if (error.statusCode) {
                return res.status(error.statusCode).json({
                    success: false,
                    message: error.message
                });
            }
            next(error);
        }
    }

    /**
     * Ban or unban user from insights (Admin)
     * POST /api/admin/users/:userId/insight-ban
     */
    async toggleInsightBan(req, res, next) {
        try {
            const { userId } = req.params;
            const { isBanned } = req.body;

            const user = await insightRequestService.toggleInsightBan(userId, isBanned);

            res.status(HTTP_STATUS.OK).json({
                success: true,
                message: `User ${isBanned ? 'banned from' : 'unbanned for'} insight requests`,
                data: { user: { id: user._id, isBannedFromInsights: user.isBannedFromInsights } }
            });
        } catch (error) {
            if (error.statusCode) {
                return res.status(error.statusCode).json({
                    success: false,
                    message: error.message
                });
            }
            next(error);
        }
    }
}

module.exports = new InsightRequestController();
