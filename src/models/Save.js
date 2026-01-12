/**
 * Save Model
 *
 * Tracks saved/bookmarked insights by users
 */

const mongoose = require('mongoose');

const saveSchema = new mongoose.Schema(
  {
    // User who saved
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Insight that was saved
    insight: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Insight',
      required: true,
      index: true
    },

    // Optional note/annotation
    note: {
      type: String,
      maxlength: 500
    },

    // Custom tags for organization
    tags: [String],

    // When the save was created
    savedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Compound index to ensure a user can only save an insight once
saveSchema.index({ user: 1, insight: 1 }, { unique: true });
saveSchema.index({ insight: 1, savedAt: -1 });
saveSchema.index({ user: 1, savedAt: -1 });
saveSchema.index({ user: 1, tags: 1 });

// Static methods

/**
 * Toggle save (add if doesn't exist, remove if exists)
 */
saveSchema.statics.toggleSave = async function (userId, insightId, options = {}) {
  const existing = await this.findOne({ user: userId, insight: insightId });

  const Insight = require('./Insight');

  if (existing) {
    // Unsave
    await this.deleteOne({ _id: existing._id });
    await Insight.findByIdAndUpdate(insightId, {
      $inc: { 'analytics.saves': -1 }
    });
    return { saved: false, count: -1 };
  } else {
    // Save
    const { note, tags } = options;
    await this.create({ user: userId, insight: insightId, note, tags });
    await Insight.findByIdAndUpdate(insightId, {
      $inc: { 'analytics.saves': 1 }
    });
    return { saved: true, count: 1 };
  }
};

/**
 * Check if user has saved an insight
 */
saveSchema.statics.hasSaved = async function (userId, insightId) {
  const save = await this.findOne({ user: userId, insight: insightId });
  return !!save;
};

/**
 * Get user's saved insights
 */
saveSchema.statics.getUserSaves = async function (userId, options = {}) {
  const { page = 1, limit = 20, tags } = options;
  const skip = (page - 1) * limit;

  const query = { user: userId };
  if (tags && tags.length > 0) {
    query.tags = { $in: tags };
  }

  const saves = await this.find(query)
    .populate('insight', 'title excerpt category publishedAt analytics')
    .sort({ savedAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await this.countDocuments(query);

  return {
    saves: saves.map((s) => ({
      insight: s.insight,
      note: s.note,
      tags: s.tags,
      savedAt: s.savedAt
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

/**
 * Update save note and tags
 */
saveSchema.statics.updateSave = async function (userId, insightId, updates) {
  const save = await this.findOne({ user: userId, insight: insightId });

  if (!save) {
    throw new Error('Save not found');
  }

  if (updates.note !== undefined) {
    save.note = updates.note;
  }

  if (updates.tags !== undefined) {
    save.tags = updates.tags;
  }

  await save.save();
  return save;
};

/**
 * Get user's save tags
 */
saveSchema.statics.getUserTags = async function (userId) {
  const saves = await this.find({ user: userId }).select('tags');

  const allTags = saves.flatMap((s) => s.tags);
  const uniqueTags = [...new Set(allTags)];

  return uniqueTags;
};

/**
 * Get most saved insights in time period
 */
saveSchema.statics.getMostSaved = async function (startDate, endDate, limit = 10) {
  const saves = await this.aggregate([
    {
      $match: {
        savedAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$insight',
        saveCount: { $sum: 1 }
      }
    },
    {
      $sort: { saveCount: -1 }
    },
    {
      $limit: limit
    }
  ]);

  // Populate insights
  const Insight = require('./Insight');
  const insightIds = saves.map((s) => s._id);
  const insights = await Insight.find({ _id: { $in: insightIds } }).select(
    'title excerpt category publishedAt analytics'
  );

  return saves.map((s) => {
    const insight = insights.find((i) => i._id.toString() === s._id.toString());
    return {
      insight,
      saveCount: s.saveCount
    };
  });
};

const Save = mongoose.model('Save', saveSchema);

module.exports = Save;
