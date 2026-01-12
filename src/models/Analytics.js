/**
 * Analytics Model
 *
 * Stores aggregated analytics data for:
 * - User analytics (DAU, MAU, retention, churn)
 * - Content analytics (views, engagement, performance)
 * - Business analytics (subscriptions, revenue, growth)
 */

const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema(
  {
    // Date for this analytics record
    date: {
      type: Date,
      required: true,
      index: true
    },

    // Granularity: daily, weekly, monthly
    period: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      required: true,
      default: 'daily'
    },

    // User Analytics
    users: {
      // Active users
      dailyActiveUsers: { type: Number, default: 0 },
      weeklyActiveUsers: { type: Number, default: 0 },
      monthlyActiveUsers: { type: Number, default: 0 },

      // New users
      newUsers: { type: Number, default: 0 },

      // User retention (percentage)
      retention: {
        day1: { type: Number, default: 0 },
        day7: { type: Number, default: 0 },
        day30: { type: Number, default: 0 }
      },

      // Churn
      churnedUsers: { type: Number, default: 0 },
      churnRate: { type: Number, default: 0 },

      // By subscription type
      bySubscription: {
        free: { type: Number, default: 0 },
        premium: { type: Number, default: 0 },
        vip: { type: Number, default: 0 }
      }
    },

    // Content Analytics
    content: {
      // Insights published
      insightsPublished: { type: Number, default: 0 },

      // Total views
      totalViews: { type: Number, default: 0 },
      uniqueViews: { type: Number, default: 0 },

      // Engagement
      totalLikes: { type: Number, default: 0 },
      totalComments: { type: Number, default: 0 },
      totalSaves: { type: Number, default: 0 },

      // Average engagement per insight
      avgViewsPerInsight: { type: Number, default: 0 },
      avgLikesPerInsight: { type: Number, default: 0 },
      avgCommentsPerInsight: { type: Number, default: 0 },

      // Top performing insights
      topInsights: [
        {
          insightId: { type: mongoose.Schema.Types.ObjectId, ref: 'Insight' },
          title: String,
          views: Number,
          likes: Number,
          comments: Number
        }
      ],

      // Performance by category
      byCategory: {
        type: Map,
        of: {
          views: Number,
          likes: Number,
          insights: Number
        }
      }
    },

    // Business Analytics
    business: {
      // Subscriptions
      newSubscriptions: { type: Number, default: 0 },
      canceledSubscriptions: { type: Number, default: 0 },

      // Conversion rates
      freeToBasicConversion: { type: Number, default: 0 },
      basicToPremiumConversion: { type: Number, default: 0 },

      // Revenue (placeholder for when payment is integrated)
      revenue: { type: Number, default: 0 },

      // Growth metrics
      userGrowthRate: { type: Number, default: 0 },
      revenueGrowthRate: { type: Number, default: 0 }
    },

    // Engagement Metrics
    engagement: {
      // Average session duration (seconds)
      avgSessionDuration: { type: Number, default: 0 },

      // Average time spent per insight (seconds)
      avgTimePerInsight: { type: Number, default: 0 },

      // Total sessions
      totalSessions: { type: Number, default: 0 },

      // Pages per session
      avgPagesPerSession: { type: Number, default: 0 },

      // Engagement score (0-100)
      overallEngagementScore: { type: Number, default: 0 }
    },

    // System Metrics
    system: {
      // API performance
      avgResponseTime: { type: Number, default: 0 },
      totalRequests: { type: Number, default: 0 },
      errorRate: { type: Number, default: 0 },

      // Database
      dbQueryAvgTime: { type: Number, default: 0 },

      // Uptime percentage
      uptime: { type: Number, default: 100 }
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes
analyticsSchema.index({ date: -1, period: 1 });
analyticsSchema.index({ period: 1, date: -1 });

// Unique constraint: one record per date per period
analyticsSchema.index({ date: 1, period: 1 }, { unique: true });

// Static methods

/**
 * Get or create analytics record for a specific date and period
 */
analyticsSchema.statics.getOrCreate = async function (date, period = 'daily') {
  const startOfPeriod = this.getStartOfPeriod(date, period);

  let analytics = await this.findOne({ date: startOfPeriod, period });

  if (!analytics) {
    analytics = await this.create({ date: startOfPeriod, period });
  }

  return analytics;
};

/**
 * Get start of period for a given date
 */
analyticsSchema.statics.getStartOfPeriod = function (date, period) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  if (period === 'weekly') {
    // Start of week (Monday)
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
  } else if (period === 'monthly') {
    // Start of month
    d.setDate(1);
  }

  return d;
};

/**
 * Get analytics for a date range
 */
analyticsSchema.statics.getRange = async function (startDate, endDate, period = 'daily') {
  return this.find({
    period,
    date: { $gte: startDate, $lte: endDate }
  }).sort({ date: 1 });
};

/**
 * Get latest analytics
 */
analyticsSchema.statics.getLatest = async function (period = 'daily', limit = 30) {
  return this.find({ period })
    .sort({ date: -1 })
    .limit(limit);
};

/**
 * Increment user count
 */
analyticsSchema.methods.incrementUserCount = async function (field, count = 1) {
  if (this.users[field] !== undefined) {
    this.users[field] += count;
    await this.save();
  }
};

/**
 * Increment content metric
 */
analyticsSchema.methods.incrementContentMetric = async function (field, count = 1) {
  if (this.content[field] !== undefined) {
    this.content[field] += count;
    await this.save();
  }
};

/**
 * Update top insights
 */
analyticsSchema.methods.updateTopInsights = async function (insights) {
  this.content.topInsights = insights.slice(0, 10).map(i => ({
    insightId: i._id,
    title: i.title,
    views: i.analytics?.views || 0,
    likes: i.analytics?.likes || 0,
    comments: i.analytics?.comments || 0
  }));
  await this.save();
};

/**
 * Calculate derived metrics
 */
analyticsSchema.methods.calculateDerivedMetrics = async function () {
  // Average views per insight
  if (this.content.insightsPublished > 0) {
    this.content.avgViewsPerInsight = Math.round(
      this.content.totalViews / this.content.insightsPublished
    );
    this.content.avgLikesPerInsight = Math.round(
      this.content.totalLikes / this.content.insightsPublished
    );
    this.content.avgCommentsPerInsight = Math.round(
      this.content.totalComments / this.content.insightsPublished
    );
  }

  // Pages per session
  if (this.engagement.totalSessions > 0) {
    this.engagement.avgPagesPerSession = Math.round(
      this.content.totalViews / this.engagement.totalSessions * 10
    ) / 10;
  }

  // Overall engagement score (0-100)
  const viewScore = Math.min(this.content.totalViews / 100, 40);
  const likeScore = Math.min(this.content.totalLikes / 50, 30);
  const commentScore = Math.min(this.content.totalComments / 20, 20);
  const sessionScore = Math.min(this.engagement.avgSessionDuration / 600, 10);

  this.engagement.overallEngagementScore = Math.round(
    viewScore + likeScore + commentScore + sessionScore
  );

  await this.save();
};

const Analytics = mongoose.model('Analytics', analyticsSchema);

module.exports = Analytics;
