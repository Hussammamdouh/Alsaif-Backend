const InsightRequest = require('../models/InsightRequest');
const Insight = require('../models/Insight');
const Chat = require('../models/Chat');
const User = require('../models/User');
const {
    emitInsightRequestSubmitted,
    emitInsightRequestApproved,
    emitInsightRequestRejected
} = require('../events/enhancedNotificationEvents');
const AuditLogger = require('../utils/auditLogger');
const { HTTP_STATUS } = require('../constants');

class InsightRequestService {
    /**
     * Create a new insight request
     */
    async createRequest(userId, requestData) {
        const user = await User.findById(userId);

        // Check if user is premium
        const isPremium = await user.hasPremiumAccess();
        if (!isPremium) {
            const error = new Error('Only premium users can submit insight requests');
            error.statusCode = 403;
            throw error;
        }

        // Check if user is banned from insights
        if (user.isBannedFromInsights) {
            const error = new Error('You are banned from submitting insight requests');
            error.statusCode = 403;
            throw error;
        }

        const request = await InsightRequest.create({
            ...requestData,
            user: userId,
            status: 'pending'
        });

        // Notify Admins
        emitInsightRequestSubmitted({
            requestId: request._id,
            userId: userId,
            userName: user.name,
            title: request.title
        });

        return request;
    }

    /**
     * Get user's own requests
     */
    async getUserRequests(userId, pagination = {}) {
        const { page = 1, limit = 10 } = pagination;
        const skip = (page - 1) * limit;

        const [requests, total] = await Promise.all([
            InsightRequest.find({ user: userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            InsightRequest.countDocuments({ user: userId })
        ]);

        return {
            requests,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalItems: total
            }
        };
    }

    /**
     * Get all requests (Admin)
     */
    async getAllRequests(query = {}, pagination = {}) {
        const { page = 1, limit = 10 } = pagination;
        const skip = (page - 1) * limit;

        const [requests, total] = await Promise.all([
            InsightRequest.find(query)
                .populate('user', 'name email')
                .populate('adminModeratedBy', 'name email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            InsightRequest.countDocuments(query)
        ]);

        return {
            requests,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalItems: total
            }
        };
    }

    /**
     * Moderate a request (Approve/Reject)
     */
    async moderateRequest(requestId, adminId, moderationData) {
        const { status, rejectionReason, targetType } = moderationData;
        const request = await InsightRequest.findById(requestId).populate('user');

        if (!request) {
            const error = new Error('Request not found');
            error.statusCode = 404;
            throw error;
        }

        if (request.status !== 'pending') {
            const error = new Error('Request already processed');
            error.statusCode = 400;
            throw error;
        }

        request.status = status;
        request.adminModeratedBy = adminId;
        request.moderatedAt = new Date();

        if (status === 'rejected') {
            request.rejectionReason = rejectionReason;

            // Notify user of rejection
            emitInsightRequestRejected({
                userId: request.user._id,
                title: request.title,
                reason: rejectionReason
            });
        } else if (status === 'approved') {
            request.targetType = targetType;

            // Implement publishing logic based on targetType
            const createdContent = await this._publishContent(request, targetType, adminId);
            request.targetId = createdContent._id;
            request.targetModel = targetType.includes('chat') ? 'Chat' : 'Insight';

            // Notify user of approval
            emitInsightRequestApproved({
                userId: request.user._id,
                title: request.title,
                targetType: targetType,
                targetId: createdContent._id
            });
        }

        await request.save();
        return request;
    }

    /**
     * Internal helper to publish content from approved request
     */
    async _publishContent(request, targetType, adminId) {
        if (targetType === 'free_insight' || targetType === 'premium_insight') {
            return await Insight.create({
                title: request.title,
                content: request.details, // Using details as content for now
                excerpt: request.title,
                type: targetType === 'premium_insight' ? 'premium' : 'free',
                category: 'other',
                author: adminId, // Published by admin on behalf of user? Or user as author?
                status: 'published'
            });
        } else if (targetType === 'free_chat' || targetType === 'premium_chat') {
            // Logic for creating group chats or using existing ones?
            // The user said "publish as a free group chat or the premium group chat"
            // We'll assume creating a new GroupChat with the request info
            return await Chat.create({
                name: request.title,
                type: 'group',
                isPremium: targetType === 'premium_chat',
                createdBy: adminId,
                participants: [{ user: adminId, role: 'admin' }]
            });
        }
        throw new Error('Invalid target type');
    }

    /**
     * Ban/Unban user from insights
     */
    async toggleInsightBan(userId, isBanned) {
        const user = await User.findByIdAndUpdate(userId, { isBannedFromInsights: isBanned }, { new: true });
        if (!user) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }
        return user;
    }
}

module.exports = new InsightRequestService();
