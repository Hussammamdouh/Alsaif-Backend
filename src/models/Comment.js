/**
 * Comment Model
 *
 * Handles threaded comments on insights with:
 * - Nested replies support
 * - Like/dislike functionality
 * - Moderation features
 */

const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    // The insight this comment belongs to
    insightId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Insight',
      required: true,
      index: true
    },

    // Comment author
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Comment content
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },

    // Parent comment for nested replies
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
      index: true
    },

    // Nesting level (0 = root comment, 1 = first reply, etc.)
    level: {
      type: Number,
      default: 0,
      min: 0,
      max: 3 // Limit nesting to 3 levels
    },

    // Engagement metrics
    likes: {
      type: Number,
      default: 0
    },

    likedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],

    // Reply count (for root comments)
    replyCount: {
      type: Number,
      default: 0
    },

    // Moderation
    isEdited: {
      type: Boolean,
      default: false
    },

    editedAt: {
      type: Date
    },

    isDeleted: {
      type: Boolean,
      default: false
    },

    deletedAt: {
      type: Date
    },

    // Flagged for review
    isFlagged: {
      type: Boolean,
      default: false
    },

    flaggedBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        reason: String,
        flaggedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],

    // Admin moderation
    isApproved: {
      type: Boolean,
      default: true // Auto-approve by default
    },

    moderatedBy: {
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
commentSchema.index({ insightId: 1, parentComment: 1, createdAt: -1 });
commentSchema.index({ author: 1, createdAt: -1 });
commentSchema.index({ isDeleted: 1, isApproved: 1 });
commentSchema.index({ isFlagged: 1 });

// Instance methods

/**
 * Add like to comment
 */
commentSchema.methods.addLike = async function (userId) {
  if (!this.likedBy.includes(userId)) {
    this.likedBy.push(userId);
    this.likes += 1;
    await this.save();
  }
};

/**
 * Remove like from comment
 */
commentSchema.methods.removeLike = async function (userId) {
  const index = this.likedBy.indexOf(userId);
  if (index > -1) {
    this.likedBy.splice(index, 1);
    this.likes = Math.max(0, this.likes - 1);
    await this.save();
  }
};

/**
 * Flag comment for moderation
 */
commentSchema.methods.flag = async function (userId, reason) {
  const alreadyFlagged = this.flaggedBy.some(
    (f) => f.userId.toString() === userId.toString()
  );

  if (!alreadyFlagged) {
    this.flaggedBy.push({ userId, reason, flaggedAt: new Date() });
    this.isFlagged = true;
    await this.save();
  }
};

/**
 * Soft delete comment
 */
commentSchema.methods.softDelete = async function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.content = '[deleted]'; // Replace content
  await this.save();
};

/**
 * Edit comment
 */
commentSchema.methods.edit = async function (newContent) {
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  await this.save();
};

/**
 * Increment reply count for parent comment
 */
commentSchema.statics.incrementParentReplyCount = async function (parentCommentId) {
  if (parentCommentId) {
    await this.findByIdAndUpdate(parentCommentId, { $inc: { replyCount: 1 } });
  }
};

/**
 * Decrement reply count for parent comment
 */
commentSchema.statics.decrementParentReplyCount = async function (parentCommentId) {
  if (parentCommentId) {
    await this.findByIdAndUpdate(parentCommentId, { $inc: { replyCount: -1 } });
  }
};

/**
 * Get comments for an insight (with pagination)
 */
commentSchema.statics.getForInsight = async function (insightId, options = {}) {
  const {
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = -1,
    includeReplies = false
  } = options;

  const skip = (page - 1) * limit;

  const query = {
    insightId,
    isDeleted: false,
    isApproved: true
  };

  // If not including replies, only get root comments
  if (!includeReplies) {
    query.parentComment = null;
  }

  const comments = await this.find(query)
    .populate('author', 'name email')
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit);

  const total = await this.countDocuments(query);

  return {
    comments,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

/**
 * Get replies for a comment
 */
commentSchema.statics.getReplies = async function (parentCommentId, options = {}) {
  const { page = 1, limit = 10 } = options;
  const skip = (page - 1) * limit;

  const replies = await this.find({
    parentComment: parentCommentId,
    isDeleted: false,
    isApproved: true
  })
    .populate('author', 'name email')
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit);

  const total = await this.countDocuments({
    parentComment: parentCommentId,
    isDeleted: false,
    isApproved: true
  });

  return {
    replies,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

/**
 * Get user's comments
 */
commentSchema.statics.getByUser = async function (userId, options = {}) {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const comments = await this.find({
    author: userId,
    isDeleted: false
  })
    .populate('insightId', 'title')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await this.countDocuments({ author: userId, isDeleted: false });

  return {
    comments,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

/**
 * Get flagged comments for moderation
 */
commentSchema.statics.getFlagged = async function (options = {}) {
  const { page = 1, limit = 50 } = options;
  const skip = (page - 1) * limit;

  const comments = await this.find({ isFlagged: true, isDeleted: false })
    .populate('author', 'name email')
    .populate('insightId', 'title')
    .sort({ 'flaggedBy.0.flaggedAt': -1 })
    .skip(skip)
    .limit(limit);

  const total = await this.countDocuments({ isFlagged: true, isDeleted: false });

  return {
    comments,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

// Middleware: Increment parent reply count when creating a reply
commentSchema.post('save', async function (doc) {
  if (doc.parentComment && !doc.isDeleted) {
    await Comment.incrementParentReplyCount(doc.parentComment);
  }
});

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;
