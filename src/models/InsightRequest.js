const mongoose = require('mongoose');

const insightRequestSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Title is required'],
            trim: true,
            minlength: [5, 'Title must be at least 5 characters'],
            maxlength: [200, 'Title cannot exceed 200 characters']
        },
        details: {
            type: String,
            required: [true, 'Details are required'],
            minlength: [20, 'Details must be at least 20 characters'],
            maxlength: [2000, 'Details cannot exceed 2000 characters']
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
            index: true
        },
        rejectionReason: {
            type: String,
            trim: true
        },
        targetType: {
            type: String,
            enum: ['free_insight', 'premium_insight', 'free_chat', 'premium_chat'],
        },
        targetId: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'targetModel'
        },
        targetModel: {
            type: String,
            enum: ['Insight', 'GroupChat']
        },
        adminModeratedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        moderatedAt: {
            type: Date
        }
    },
    {
        timestamps: true
    }
);

// Indexes
insightRequestSchema.index({ status: 1, createdAt: -1 });
insightRequestSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('InsightRequest', insightRequestSchema);
