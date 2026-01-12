/**
 * Insight Version Model
 *
 * Tracks all revisions of insights for:
 * - Revision history
 * - Version comparison
 * - Rollback functionality
 * - Change attribution
 */

const mongoose = require('mongoose');

const insightVersionSchema = new mongoose.Schema(
  {
    // Reference to the original insight
    insightId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Insight',
      required: true,
      index: true
    },

    // Version number (incremental)
    version: {
      type: Number,
      required: true
    },

    // Snapshot of insight data at this version
    data: {
      title: {
        type: String,
        required: true
      },
      content: {
        type: String,
        required: true
      },
      excerpt: String,
      category: String,
      tags: [String],
      type: {
        type: String,
        enum: ['free', 'premium', 'vip']
      },
      status: {
        type: String,
        enum: ['draft', 'published', 'archived']
      },
      featuredImage: String,
      metadata: mongoose.Schema.Types.Mixed
    },

    // Who made this change
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Change description
    changeDescription: {
      type: String,
      maxlength: 500
    },

    // Change type
    changeType: {
      type: String,
      enum: ['created', 'updated', 'published', 'unpublished', 'restored'],
      default: 'updated'
    },

    // Diff summary (what changed)
    diff: {
      titleChanged: Boolean,
      contentChanged: Boolean,
      excerptChanged: Boolean,
      categoryChanged: Boolean,
      tagsChanged: Boolean,
      typeChanged: Boolean,
      statusChanged: Boolean,
      imageChanged: Boolean,
      fieldsChanged: [String] // List of changed field names
    },

    // Size of this version (for storage tracking)
    size: {
      type: Number, // in bytes
      default: 0
    },

    // Is this version currently active?
    isActive: {
      type: Boolean,
      default: false
    },

    // Creation timestamp
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false // We manage createdAt manually
  }
);

// Compound indexes
insightVersionSchema.index({ insightId: 1, version: -1 });
insightVersionSchema.index({ insightId: 1, createdAt: -1 });
insightVersionSchema.index({ author: 1, createdAt: -1 });
insightVersionSchema.index({ isActive: 1 });

// Unique constraint: one version number per insight
insightVersionSchema.index({ insightId: 1, version: 1 }, { unique: true });

// Static methods

/**
 * Create a new version from an insight
 */
insightVersionSchema.statics.createVersion = async function (insight, userId, changeDescription = '', changeType = 'updated') {
  // Get the latest version number
  const latestVersion = await this.findOne({ insightId: insight._id })
    .sort({ version: -1 })
    .select('version');

  const newVersionNumber = latestVersion ? latestVersion.version + 1 : 1;

  // Calculate diff if there's a previous version
  let diff = {
    fieldsChanged: []
  };

  if (latestVersion) {
    const previousVersion = await this.findById(latestVersion._id);
    if (previousVersion) {
      diff = this.calculateDiff(previousVersion.data, insight);
    }
  }

  // Calculate size
  const dataString = JSON.stringify(insight);
  const size = Buffer.byteLength(dataString, 'utf8');

  // Mark all previous versions as inactive
  await this.updateMany(
    { insightId: insight._id, isActive: true },
    { $set: { isActive: false } }
  );

  // Create new version
  const version = await this.create({
    insightId: insight._id,
    version: newVersionNumber,
    data: {
      title: insight.title,
      content: insight.content,
      excerpt: insight.excerpt,
      category: insight.category,
      tags: insight.tags,
      type: insight.type,
      status: insight.status,
      featuredImage: insight.featuredImage,
      metadata: insight.metadata
    },
    author: userId,
    changeDescription,
    changeType,
    diff,
    size,
    isActive: true
  });

  return version;
};

/**
 * Calculate diff between two insight versions
 */
insightVersionSchema.statics.calculateDiff = function (oldData, newData) {
  const diff = {
    titleChanged: oldData.title !== newData.title,
    contentChanged: oldData.content !== newData.content,
    excerptChanged: oldData.excerpt !== newData.excerpt,
    categoryChanged: oldData.category !== newData.category,
    tagsChanged: JSON.stringify(oldData.tags) !== JSON.stringify(newData.tags),
    typeChanged: oldData.type !== newData.type,
    statusChanged: oldData.status !== newData.status,
    imageChanged: oldData.featuredImage !== newData.featuredImage,
    fieldsChanged: []
  };

  // Build list of changed fields
  Object.keys(diff).forEach(key => {
    if (key !== 'fieldsChanged' && diff[key]) {
      diff.fieldsChanged.push(key.replace('Changed', ''));
    }
  });

  return diff;
};

/**
 * Get version history for an insight
 */
insightVersionSchema.statics.getHistory = async function (insightId, options = {}) {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const versions = await this.find({ insightId })
    .populate('author', 'name email')
    .sort({ version: -1 })
    .skip(skip)
    .limit(limit)
    .select('-data.content'); // Exclude full content for list view

  const total = await this.countDocuments({ insightId });

  return {
    versions,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

/**
 * Get a specific version
 */
insightVersionSchema.statics.getVersion = async function (insightId, versionNumber) {
  const version = await this.findOne({ insightId, version: versionNumber })
    .populate('author', 'name email');

  return version;
};

/**
 * Get the active version
 */
insightVersionSchema.statics.getActiveVersion = async function (insightId) {
  return await this.findOne({ insightId, isActive: true })
    .populate('author', 'name email');
};

/**
 * Compare two versions
 */
insightVersionSchema.statics.compareVersions = async function (insightId, version1, version2) {
  const [v1, v2] = await Promise.all([
    this.findOne({ insightId, version: version1 }),
    this.findOne({ insightId, version: version2 })
  ]);

  if (!v1 || !v2) {
    throw new Error('One or both versions not found');
  }

  return {
    version1: v1,
    version2: v2,
    diff: this.calculateDiff(v1.data, v2.data),
    timeDifference: v2.createdAt - v1.createdAt,
    versionDifference: v2.version - v1.version
  };
};

/**
 * Restore an insight to a specific version
 */
insightVersionSchema.statics.restoreVersion = async function (insightId, versionNumber, userId) {
  const versionToRestore = await this.findOne({ insightId, version: versionNumber });

  if (!versionToRestore) {
    throw new Error('Version not found');
  }

  // Get the Insight model
  const Insight = require('./Insight');
  const insight = await Insight.findById(insightId);

  if (!insight) {
    throw new Error('Insight not found');
  }

  // Update insight with version data
  insight.title = versionToRestore.data.title;
  insight.content = versionToRestore.data.content;
  insight.excerpt = versionToRestore.data.excerpt;
  insight.category = versionToRestore.data.category;
  insight.tags = versionToRestore.data.tags;
  insight.type = versionToRestore.data.type;
  insight.status = versionToRestore.data.status;
  insight.featuredImage = versionToRestore.data.featuredImage;
  insight.metadata = versionToRestore.data.metadata;

  await insight.save();

  // Create a new version documenting the restoration
  const restoredVersion = await this.createVersion(
    insight,
    userId,
    `Restored to version ${versionNumber}`,
    'restored'
  );

  return { insight, version: restoredVersion };
};

/**
 * Delete old versions (cleanup)
 */
insightVersionSchema.statics.cleanupOldVersions = async function (insightId, keepCount = 50) {
  const versions = await this.find({ insightId })
    .sort({ version: -1 })
    .skip(keepCount)
    .select('_id');

  if (versions.length > 0) {
    const idsToDelete = versions.map(v => v._id);
    await this.deleteMany({ _id: { $in: idsToDelete } });
  }

  return versions.length;
};

/**
 * Get storage usage for an insight's versions
 */
insightVersionSchema.statics.getStorageUsage = async function (insightId) {
  const result = await this.aggregate([
    { $match: { insightId: mongoose.Types.ObjectId(insightId) } },
    {
      $group: {
        _id: null,
        totalSize: { $sum: '$size' },
        versionCount: { $sum: 1 }
      }
    }
  ]);

  if (result.length === 0) {
    return { totalSize: 0, versionCount: 0 };
  }

  return result[0];
};

const InsightVersion = mongoose.model('InsightVersion', insightVersionSchema);

module.exports = InsightVersion;
