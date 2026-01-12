/**
 * Filter Preset Model
 * Saved filter configurations for admins
 */

const mongoose = require('mongoose');

const filterPresetSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    resourceType: {
      type: String,
      required: true,
      enum: ['users', 'insights', 'subscriptions'],
      index: true,
    },
    filters: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    lastUsedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Index for quick lookups
filterPresetSchema.index({ createdBy: 1, resourceType: 1 });
filterPresetSchema.index({ isPublic: 1, resourceType: 1 });

// Method to increment usage count
filterPresetSchema.methods.incrementUsage = async function() {
  this.usageCount += 1;
  this.lastUsedAt = new Date();
  await this.save();
};

module.exports = mongoose.model('FilterPreset', filterPresetSchema);
