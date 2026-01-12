const mongoose = require('mongoose');

/**
 * Report Model
 *
 * Handles user reports for content moderation
 * Supports reporting insights and comments
 */

const reportSchema = new mongoose.Schema(
  {
    // What is being reported
    targetType: {
      type: String,
      enum: ['insight', 'comment'],
      required: true,
      index: true
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      refPath: 'targetModel'
    },

    targetModel: {
      type: String,
      required: true,
      enum: ['Insight', 'Comment']
    },

    // Who reported it
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Reason for report
    reason: {
      type: String,
      enum: [
        'spam',
        'harassment',
        'hate_speech',
        'misinformation',
        'inappropriate_content',
        'copyright',
        'other'
      ],
      required: true
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000
    },

    // Moderation status
    status: {
      type: String,
      enum: ['pending', 'reviewing', 'resolved', 'dismissed'],
      default: 'pending',
      index: true
    },

    // Resolution
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    resolvedAt: {
      type: Date
    },

    resolution: {
      type: String,
      enum: ['content_removed', 'content_approved', 'user_warned', 'user_banned', 'no_action'],
      index: true
    },

    resolutionNotes: {
      type: String,
      maxlength: 1000
    },

    // Priority (auto-calculated based on report count)
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low',
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
reportSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
reportSchema.index({ reporter: 1, createdAt: -1 });
reportSchema.index({ status: 1, priority: -1, createdAt: -1 });
reportSchema.index({ targetType: 1, status: 1 });

// Compound index to prevent duplicate reports
reportSchema.index(
  { reporter: 1, targetType: 1, targetId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'reviewing'] } } }
);

// Virtual for target reference
reportSchema.virtual('target', {
  refPath: 'targetModel',
  localField: 'targetId',
  foreignField: '_id',
  justOne: true
});

// Instance methods

/**
 * Resolve a report
 */
reportSchema.methods.resolve = async function(adminId, resolution, notes = '') {
  this.status = 'resolved';
  this.resolvedBy = adminId;
  this.resolvedAt = new Date();
  this.resolution = resolution;
  this.resolutionNotes = notes;
  return this.save();
};

/**
 * Dismiss a report
 */
reportSchema.methods.dismiss = async function(adminId, notes = '') {
  this.status = 'dismissed';
  this.resolvedBy = adminId;
  this.resolvedAt = new Date();
  this.resolution = 'no_action';
  this.resolutionNotes = notes;
  return this.save();
};

/**
 * Set report under review
 */
reportSchema.methods.setReviewing = async function() {
  this.status = 'reviewing';
  return this.save();
};

// Static methods

/**
 * Get pending reports for moderation queue
 */
reportSchema.statics.getPending = async function(options = {}) {
  const { page = 1, limit = 50, targetType } = options;
  const skip = (page - 1) * limit;

  const query = { status: { $in: ['pending', 'reviewing'] } };
  if (targetType) {
    query.targetType = targetType;
  }

  const reports = await this.find(query)
    .populate('reporter', 'name email')
    .populate('targetId')
    .sort({ priority: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await this.countDocuments(query);

  return {
    reports,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

/**
 * Get report count for a specific target
 */
reportSchema.statics.getCountForTarget = async function(targetType, targetId) {
  return this.countDocuments({
    targetType,
    targetId,
    status: { $in: ['pending', 'reviewing'] }
  });
};

/**
 * Check if user has already reported this target
 */
reportSchema.statics.hasReported = async function(userId, targetType, targetId) {
  const report = await this.findOne({
    reporter: userId,
    targetType,
    targetId,
    status: { $in: ['pending', 'reviewing'] }
  });
  return !!report;
};

/**
 * Get reports by user
 */
reportSchema.statics.getByUser = async function(userId, options = {}) {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const reports = await this.find({ reporter: userId })
    .populate('targetId')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await this.countDocuments({ reporter: userId });

  return {
    reports,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

/**
 * Get report statistics
 */
reportSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $facet: {
        byStatus: [
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ],
        byReason: [
          {
            $match: { status: { $in: ['pending', 'reviewing'] } }
          },
          {
            $group: {
              _id: '$reason',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } }
        ],
        byPriority: [
          {
            $match: { status: { $in: ['pending', 'reviewing'] } }
          },
          {
            $group: {
              _id: '$priority',
              count: { $sum: 1 }
            }
          }
        ],
        byTargetType: [
          {
            $group: {
              _id: '$targetType',
              count: { $sum: 1 }
            }
          }
        ],
        pendingCount: [
          {
            $match: { status: 'pending' }
          },
          {
            $count: 'count'
          }
        ],
        avgResolutionTime: [
          {
            $match: { status: 'resolved', resolvedAt: { $exists: true } }
          },
          {
            $project: {
              resolutionTime: {
                $subtract: ['$resolvedAt', '$createdAt']
              }
            }
          },
          {
            $group: {
              _id: null,
              avgTime: { $avg: '$resolutionTime' }
            }
          }
        ]
      }
    }
  ]);

  return stats[0];
};

/**
 * Update priority based on report count for the same target
 */
reportSchema.statics.updatePriority = async function(targetType, targetId) {
  const reportCount = await this.countDocuments({
    targetType,
    targetId,
    status: { $in: ['pending', 'reviewing'] }
  });

  let priority = 'low';
  if (reportCount >= 10) priority = 'critical';
  else if (reportCount >= 5) priority = 'high';
  else if (reportCount >= 2) priority = 'medium';

  await this.updateMany(
    {
      targetType,
      targetId,
      status: { $in: ['pending', 'reviewing'] }
    },
    { $set: { priority } }
  );
};

// Middleware: Update priority after creating a report
reportSchema.post('save', async function(doc) {
  if (doc.isNew) {
    await Report.updatePriority(doc.targetType, doc.targetId);
  }
});

const Report = mongoose.model('Report', reportSchema);

module.exports = Report;
