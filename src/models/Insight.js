const mongoose = require('mongoose');

/**
 * Insight Model
 *
 * Purpose: Manage premium and free content (articles, tips, analysis, etc.)
 * Features:
 * - Free vs Premium content separation
 * - Admin moderation and featured content
 * - Soft delete support
 * - View tracking
 * - Category and tag system
 */

const insightSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [5, 'Title must be at least 5 characters'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
      index: true
    },

    slug: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      index: true
    },

    content: {
      type: String,
      required: [true, 'Content is required'],
      minlength: [20, 'Content must be at least 20 characters']
    },

    excerpt: {
      type: String,
      maxlength: [500, 'Excerpt cannot exceed 500 characters'],
      trim: true
    },

    type: {
      type: String,
      enum: ['free', 'premium'],
      default: 'free',
      required: true,
      index: true
    },

    category: {
      type: String,
      enum: [
        'market_analysis',
        'trading_tips',
        'technical_analysis',
        'fundamental_analysis',
        'risk_management',
        'strategy',
        'news',
        'education',
        'other'
      ],
      default: 'other',
      required: true,
      index: true
    },

    tags: [{
      type: String,
      trim: true,
      lowercase: true
    }],

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Author is required'],
      index: true
    },

    status: {
      type: String,
      enum: ['draft', 'published', 'archived', 'under_review', 'scheduled'],
      default: 'draft',
      required: true,
      index: true
    },

    featured: {
      type: Boolean,
      default: false,
      index: true
    },

    featuredAt: {
      type: Date
    },

    featuredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    publishedAt: {
      type: Date,
      index: true
    },

    views: {
      type: Number,
      default: 0,
      min: 0
    },


    commentsCount: {
      type: Number,
      default: 0,
      min: 0
    },

    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },

    deletedAt: {
      type: Date
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    // Metadata
    readTime: {
      type: Number, // in minutes
      min: 1
    },

    coverImage: {
      type: String,
      trim: true
    },

    attachments: [{
      filename: String,
      url: String,
      fileType: String,
      size: Number
    }],

    // Moderation
    moderationNotes: {
      type: String,
      maxlength: 1000
    },

    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    moderatedAt: {
      type: Date
    },

    // Scheduling
    scheduledFor: {
      type: Date,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes for performance
insightSchema.index({ type: 1, status: 1, publishedAt: -1 });
insightSchema.index({ featured: 1, status: 1, publishedAt: -1 });
insightSchema.index({ category: 1, status: 1, publishedAt: -1 });
insightSchema.index({ author: 1, status: 1, createdAt: -1 });
insightSchema.index({ tags: 1, status: 1 });
insightSchema.index({ title: 'text', content: 'text' }); // Full-text search

// Generate slug from title before validation
insightSchema.pre('validate', function (next) {
  if (this.title && (!this.slug || this.isModified('title'))) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    // Add timestamp suffix to ensure uniqueness
    if (this.isNew) {
      this.slug = `${this.slug}-${Date.now()}`;
    }
  }
  next();
});

// Auto-calculate read time based on content length
insightSchema.pre('save', function (next) {
  if (this.isModified('content')) {
    const wordsPerMinute = 200;
    const wordCount = this.content.split(/\s+/).length;
    this.readTime = Math.ceil(wordCount / wordsPerMinute) || 1;
  }
  next();
});

// Set publishedAt when status changes to published
insightSchema.pre('save', function (next) {
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

// Instance methods
insightSchema.methods.publish = async function () {
  this.status = 'published';
  this.publishedAt = new Date();
  return this.save();
};

insightSchema.methods.unpublish = async function () {
  this.status = 'draft';
  return this.save();
};

insightSchema.methods.archive = async function () {
  this.status = 'archived';
  return this.save();
};

insightSchema.methods.feature = async function (adminId) {
  this.featured = true;
  this.featuredAt = new Date();
  this.featuredBy = adminId;
  return this.save();
};

insightSchema.methods.unfeature = async function () {
  this.featured = false;
  this.featuredAt = null;
  this.featuredBy = null;
  return this.save();
};

insightSchema.methods.softDelete = async function (adminId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = adminId;
  return this.save();
};

insightSchema.methods.restore = async function () {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

insightSchema.methods.incrementViews = async function () {
  this.views += 1;
  return this.save();
};


insightSchema.methods.moderate = async function (adminId, notes = '') {
  this.moderatedBy = adminId;
  this.moderatedAt = new Date();
  this.moderationNotes = notes;
  return this.save();
};

// Static methods
insightSchema.statics.findPublished = function (filters = {}) {
  return this.find({
    ...filters,
    status: 'published',
    isDeleted: false
  }).sort({ publishedAt: -1 });
};

insightSchema.statics.findFeatured = function (limit = 5) {
  return this.find({
    featured: true,
    status: 'published',
    isDeleted: false
  })
    .sort({ featuredAt: -1 })
    .limit(limit)
    .populate('author', 'name email');
};

insightSchema.statics.findByType = function (type, filters = {}) {
  return this.find({
    type,
    status: 'published',
    isDeleted: false,
    ...filters
  })
    .sort({ publishedAt: -1 })
    .populate('author', 'name email');
};

insightSchema.statics.findByCategory = function (category, filters = {}) {
  return this.find({
    category,
    status: 'published',
    isDeleted: false,
    ...filters
  })
    .sort({ publishedAt: -1 })
    .populate('author', 'name email');
};

insightSchema.statics.searchInsights = function (query) {
  return this.find({
    $text: { $search: query },
    status: 'published',
    isDeleted: false
  })
    .sort({ score: { $meta: 'textScore' } })
    .populate('author', 'name email');
};

insightSchema.statics.getStats = async function () {
  const stats = await this.aggregate([
    {
      $facet: {
        totalByType: [
          { $match: { isDeleted: false } },
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 }
            }
          }
        ],
        totalByStatus: [
          { $match: { isDeleted: false } },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ],
        totalByCategory: [
          { $match: { isDeleted: false, status: 'published' } },
          {
            $group: {
              _id: '$category',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } }
        ],
        featuredCount: [
          { $match: { featured: true, status: 'published', isDeleted: false } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 }
            }
          }
        ],
        totalViews: [
          { $match: { isDeleted: false } },
          {
            $group: {
              _id: null,
              total: { $sum: '$views' }
            }
          }
        ],
        mostViewed: [
          { $match: { status: 'published', isDeleted: false } },
          { $sort: { views: -1 } },
          { $limit: 5 },
          {
            $project: {
              title: 1,
              views: 1,
              type: 1,
              category: 1
            }
          }
        ],
        recentPublished: [
          { $match: { status: 'published', isDeleted: false } },
          { $sort: { publishedAt: -1 } },
          { $limit: 5 },
          {
            $project: {
              title: 1,
              type: 1,
              category: 1,
              publishedAt: 1,
              views: 1
            }
          }
        ]
      }
    }
  ]);

  return stats[0];
};

// Query helpers
insightSchema.query.published = function () {
  return this.where({ status: 'published', isDeleted: false });
};

insightSchema.query.featured = function () {
  return this.where({ featured: true, status: 'published', isDeleted: false });
};

insightSchema.query.premium = function () {
  return this.where({ type: 'premium' });
};

insightSchema.query.free = function () {
  return this.where({ type: 'free' });
};

const Insight = mongoose.model('Insight', insightSchema);

module.exports = Insight;
