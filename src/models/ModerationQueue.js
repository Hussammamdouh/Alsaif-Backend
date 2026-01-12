/**
 * Moderation Queue Model
 * Tracks content awaiting moderation
 */

const mongoose = require('mongoose');

const moderationQueueSchema = new mongoose.Schema(
  {
    contentType: {
      type: String,
      required: true,
      enum: ['insight', 'comment', 'user_report'],
      index: true,
    },
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'contentModel',
      index: true,
    },
    contentModel: {
      type: String,
      required: true,
      enum: ['Insight', 'Comment', 'User'],
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'changes_requested'],
      default: 'pending',
      index: true,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    moderatedAt: {
      type: Date,
    },
    reason: {
      type: String,
      maxlength: 500,
    },
    note: {
      type: String,
      maxlength: 500,
    },
    changesRequested: {
      type: String,
      maxlength: 1000,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    autoModeration: {
      flagged: { type: Boolean, default: false },
      reasons: [String],
      confidence: { type: Number, min: 0, max: 1 },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
moderationQueueSchema.index({ status: 1, createdAt: -1 });
moderationQueueSchema.index({ contentType: 1, status: 1 });

module.exports = mongoose.model('ModerationQueue', moderationQueueSchema);
