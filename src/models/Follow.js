/**
 * Follow Model
 *
 * Handles user follow relationships
 */

const mongoose = require('mongoose');

const followSchema = new mongoose.Schema(
  {
    // User who is following
    follower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // User being followed
    following: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // When the follow relationship was created
    followedAt: {
      type: Date,
      default: Date.now
    },

    // Notification preferences
    notifyOnNewInsight: {
      type: Boolean,
      default: true
    },

    notifyOnActivity: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes
followSchema.index({ follower: 1, following: 1 }, { unique: true });
followSchema.index({ follower: 1, followedAt: -1 });
followSchema.index({ following: 1, followedAt: -1 });

// Static methods

/**
 * Create follow relationship
 */
followSchema.statics.createFollow = async function (followerId, followingId) {
  // Prevent self-follow
  if (followerId.toString() === followingId.toString()) {
    throw new Error('Users cannot follow themselves');
  }

  // Check if already following
  const existing = await this.findOne({ follower: followerId, following: followingId });
  if (existing) {
    return existing;
  }

  // Create follow
  const follow = await this.create({ follower: followerId, following: followingId });

  // Update follower/following counts
  const User = require('./User');
  await User.findByIdAndUpdate(followerId, { $inc: { followingCount: 1 } });
  await User.findByIdAndUpdate(followingId, { $inc: { followerCount: 1 } });

  return follow;
};

/**
 * Remove follow relationship
 */
followSchema.statics.removeFollow = async function (followerId, followingId) {
  const follow = await this.findOneAndDelete({ follower: followerId, following: followingId });

  if (follow) {
    // Update follower/following counts
    const User = require('./User');
    await User.findByIdAndUpdate(followerId, { $inc: { followingCount: -1 } });
    await User.findByIdAndUpdate(followingId, { $inc: { followerCount: -1 } });
  }

  return follow;
};

/**
 * Check if user is following another user
 */
followSchema.statics.isFollowing = async function (followerId, followingId) {
  const follow = await this.findOne({ follower: followerId, following: followingId });
  return !!follow;
};

/**
 * Get user's followers
 */
followSchema.statics.getFollowers = async function (userId, options = {}) {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const follows = await this.find({ following: userId })
    .populate('follower', 'name email')
    .sort({ followedAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await this.countDocuments({ following: userId });

  return {
    followers: follows.map((f) => f.follower),
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

/**
 * Get users that a user is following
 */
followSchema.statics.getFollowing = async function (userId, options = {}) {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const follows = await this.find({ follower: userId })
    .populate('following', 'name email')
    .sort({ followedAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await this.countDocuments({ follower: userId });

  return {
    following: follows.map((f) => f.following),
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

/**
 * Get mutual follows (users who follow each other)
 */
followSchema.statics.getMutualFollows = async function (userId) {
  const following = await this.find({ follower: userId }).select('following');
  const followingIds = following.map((f) => f.following);

  const mutualFollows = await this.find({
    follower: { $in: followingIds },
    following: userId
  }).populate('follower', 'name email');

  return mutualFollows.map((f) => f.follower);
};

const Follow = mongoose.model('Follow', followSchema);

module.exports = Follow;
