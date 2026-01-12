/**
 * Flagged Content Model
 * Tracks flagged content for moderator review
 */

const mongoose = require('mongoose');

const flaggedContentSchema = new mongoose.Schema(
  {
    contentType: {
      type: String,
      required: true,
      enum: ['insight', 'comment', 'user'],
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
    reason: {
      type: String,
      required: true,
      maxlength: 500,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true,
    },
    flaggedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    resolved: {
      type: Boolean,
      default: false,
      index: true,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedAt: {
      type: Date,
    },
    action: {
      type: String,
      enum: ['remove', 'keep', 'edit', 'pending'],
      default: 'pending',
    },
    note: {
      type: String,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
flaggedContentSchema.index({ resolved: 1, severity: -1, createdAt: -1 });
flaggedContentSchema.index({ contentType: 1, contentId: 1 });

module.exports = mongoose.model('FlaggedContent', flaggedContentSchema);
