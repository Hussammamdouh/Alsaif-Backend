/**
 * Like Model
 *
 * Tracks likes on insights
 */

const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema(
  {
    // User who liked
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Insight that was liked
    insight: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Insight',
      required: true,
      index: true
    },

    // When the like was created
    likedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Compound index to ensure a user can only like an insight once
likeSchema.index({ user: 1, insight: 1 }, { unique: true });
likeSchema.index({ insight: 1, likedAt: -1 });
likeSchema.index({ user: 1, likedAt: -1 });

// Static methods

/**
 * Toggle like (add if doesn't exist, remove if exists)
 */
likeSchema.statics.toggleLike = async function (userId, insightId) {
  const existing = await this.findOne({ user: userId, insight: insightId });

  const Insight = require('./Insight');

  if (existing) {
    // Unlike
    await this.deleteOne({ _id: existing._id });
    await Insight.findByIdAndUpdate(insightId, {
      $inc: { likes: -1 }
    });
    return { liked: false, count: -1 };
  } else {
    // Like
    await this.create({ user: userId, insight: insightId });
    await Insight.findByIdAndUpdate(insightId, {
      $inc: { likes: 1 }
    });
    return { liked: true, count: 1 };
  }
};

/**
 * Check if user has liked an insight
 */
likeSchema.statics.hasLiked = async function (userId, insightId) {
  const like = await this.findOne({ user: userId, insight: insightId });
  return !!like;
};

/**
 * Get user's liked insights
 */
likeSchema.statics.getUserLikes = async function (userId, options = {}) {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const likes = await this.find({ user: userId })
    .populate('insight', 'title excerpt category publishedAt analytics')
    .sort({ likedAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await this.countDocuments({ user: userId });

  return {
    likes: likes.map((l) => l.insight),
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

/**
 * Get users who liked an insight
 */
likeSchema.statics.getInsightLikes = async function (insightId, options = {}) {
  const { page = 1, limit = 50 } = options;
  const skip = (page - 1) * limit;

  const likes = await this.find({ insight: insightId })
    .populate('user', 'name email')
    .sort({ likedAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await this.countDocuments({ insight: insightId });

  return {
    users: likes.map((l) => l.user),
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

/**
 * Get most liked insights in time period
 */
likeSchema.statics.getMostLiked = async function (startDate, endDate, limit = 10) {
  const likes = await this.aggregate([
    {
      $match: {
        likedAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$insight',
        likeCount: { $sum: 1 }
      }
    },
    {
      $sort: { likeCount: -1 }
    },
    {
      $limit: limit
    }
  ]);

  // Populate insights
  const Insight = require('./Insight');
  const insightIds = likes.map((l) => l._id);
  const insights = await Insight.find({ _id: { $in: insightIds } }).select(
    'title excerpt category publishedAt analytics'
  );

  return likes.map((l) => {
    const insight = insights.find((i) => i._id.toString() === l._id.toString());
    return {
      insight,
      likeCount: l.likeCount
    };
  });
};

const Like = mongoose.model('Like', likeSchema);

module.exports = Like;
