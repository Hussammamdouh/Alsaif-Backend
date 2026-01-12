/**
 * Admin Analytics Controller
 * Handles advanced analytics for admin dashboard
 */

const User = require('../models/User');
const Insight = require('../models/Insight');
const Subscription = require('../models/Subscription');
const Notification = require('../models/Notification');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');
const { Parser } = require('json2csv');

/**
 * Get comprehensive analytics overview
 */
exports.getAnalyticsOverview = async (req, res, next) => {
  try {
    const { startDate, endDate, period = 'month' } = req.query;

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    // Parallel aggregations for performance
    const [userStats, revenueStats, contentStats, engagementStats] = await Promise.all([
      getUserStatsAggregate(dateFilter),
      getRevenueStatsAggregate(dateFilter),
      getContentStatsAggregate(dateFilter),
      getEngagementStatsAggregate(dateFilter),
    ]);

    res.json({
      success: true,
      data: {
        users: userStats,
        revenue: revenueStats,
        content: contentStats,
        engagement: engagementStats,
        period,
        dateRange: { startDate, endDate },
      },
    });
  } catch (error) {
    logger.error('[AdminAnalytics] Get overview failed:', error);
    next(error);
  }
};

/**
 * Get user growth trends
 */
exports.getUserGrowth = async (req, res, next) => {
  try {
    const { startDate, endDate, period = 'day' } = req.query;

    const groupBy = getGroupByFormat(period);

    const pipeline = [
      {
        $match: {
          createdAt: {
            $gte: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            $lte: endDate ? new Date(endDate) : new Date(),
          },
        },
      },
      {
        $group: {
          _id: groupBy,
          newUsers: { $sum: 1 },
          activeUsers: {
            $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] },
          },
          premiumUsers: {
            // NOTE: subscriptionStatus is not in User model, this will likely return 0
            // until we either add it or join with Subscriptions
            $sum: { $cond: [{ $eq: ['$subscriptionStatus', 'active'] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const growthData = await User.aggregate(pipeline);

    // Calculate cumulative totals
    let cumulative = 0;
    const enrichedData = growthData.map(item => {
      cumulative += item.newUsers;
      return {
        date: item._id,
        newUsers: item.newUsers,
        totalUsers: cumulative,
        activeUsers: item.activeUsers,
        premiumUsers: item.premiumUsers,
      };
    });

    res.json({
      success: true,
      data: {
        growth: enrichedData,
        summary: {
          totalNew: growthData.reduce((sum, item) => sum + item.newUsers, 0),
          averagePerPeriod: (growthData.reduce((sum, item) => sum + item.newUsers, 0) / growthData.length).toFixed(2),
        },
      },
    });
  } catch (error) {
    logger.error('[AdminAnalytics] Get user growth failed:', error);
    next(error);
  }
};

/**
 * Get user retention cohort analysis
 */
exports.getUserRetention = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    // Get cohorts (users grouped by signup month)
    const cohorts = await User.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            $lte: endDate ? new Date(endDate) : new Date(),
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          users: { $push: '$_id' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // Calculate retention for each cohort
    const retentionData = await Promise.all(
      cohorts.map(async (cohort) => {
        const cohortDate = new Date(cohort._id.year, cohort._id.month - 1, 1);

        // Check how many users are still active after 30, 60, 90 days
        const retention = await User.aggregate([
          { $match: { _id: { $in: cohort.users } } },
          {
            $project: {
              daysSinceSignup: {
                $divide: [{ $subtract: [new Date(), '$createdAt'] }, 1000 * 60 * 60 * 24],
              },
              isActive: 1,
            },
          },
          {
            $group: {
              _id: null,
              day30: {
                $sum: {
                  $cond: [
                    { $and: [{ $gte: ['$daysSinceSignup', 30] }, { $eq: ['$isActive', true] }] },
                    1,
                    0,
                  ],
                },
              },
              day60: {
                $sum: {
                  $cond: [
                    { $and: [{ $gte: ['$daysSinceSignup', 60] }, { $eq: ['$isActive', true] }] },
                    1,
                    0,
                  ],
                },
              },
              day90: {
                $sum: {
                  $cond: [
                    { $and: [{ $gte: ['$daysSinceSignup', 90] }, { $eq: ['$isActive', true] }] },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]);

        return {
          cohort: `${cohort._id.year}-${String(cohort._id.month).padStart(2, '0')}`,
          cohortSize: cohort.count,
          retention: retention[0] || { day30: 0, day60: 0, day90: 0 },
          retentionRates: {
            day30: ((retention[0]?.day30 || 0) / cohort.count * 100).toFixed(2),
            day60: ((retention[0]?.day60 || 0) / cohort.count * 100).toFixed(2),
            day90: ((retention[0]?.day90 || 0) / cohort.count * 100).toFixed(2),
          },
        };
      })
    );

    res.json({
      success: true,
      data: { cohorts: retentionData },
    });
  } catch (error) {
    logger.error('[AdminAnalytics] Get user retention failed:', error);
    next(error);
  }
};

/**
 * Get user activity patterns
 */
exports.getUserActivity = async (req, res, next) => {
  try {
    const activityData = await User.aggregate([
      {
        $project: {
          hourOfDay: { $hour: { date: '$lastLogin', timezone: 'UTC' } },
          dayOfWeek: { $dayOfWeek: '$lastLogin' },
          isActive: 1,
        },
      },
      {
        $group: {
          _id: { hour: '$hourOfDay', day: '$dayOfWeek' },
          activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
        },
      },
      { $sort: { '_id.day': 1, '_id.hour': 1 } },
    ]);

    res.json({
      success: true,
      data: { activity: activityData },
    });
  } catch (error) {
    logger.error('[AdminAnalytics] Get user activity failed:', error);
    next(error);
  }
};

/**
 * Get revenue overview
 */
exports.getRevenueOverview = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {
      createdAt: {
        $gte: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lte: endDate ? new Date(endDate) : new Date(),
      },
    };

    const [revenue, subscriptions] = await Promise.all([
      Subscription.aggregate([
        { $match: { ...dateFilter, status: 'active' } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$price' },
            count: { $sum: 1 },
            avgRevenue: { $avg: '$price' },
          },
        },
      ]),
      Subscription.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            revenue: { $sum: '$price' },
          },
        },
      ]),
    ]);

    // Calculate MRR (Monthly Recurring Revenue)
    const activeSubscriptions = await Subscription.find({ status: 'active' }).populate('plan').lean();
    const mrr = activeSubscriptions.reduce((sum, sub) => {
      const price = sub.plan?.price || sub.price || 0;
      const monthlyPrice = calculateMonthlyPrice(price, sub.billingCycle);
      return sum + monthlyPrice;
    }, 0);

    // Calculate ARR (Annual Recurring Revenue)
    const arr = mrr * 12;

    // Calculate churn rate
    const totalCancelled = await Subscription.countDocuments({
      status: 'cancelled',
      cancelledAt: {
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    });
    const totalActive = await Subscription.countDocuments({ status: 'active' });
    const churnRate = (totalActive + totalCancelled > 0)
      ? ((totalCancelled / (totalActive + totalCancelled)) * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        totalRevenue: revenue[0]?.totalRevenue || 0,
        subscriptionCount: revenue[0]?.count || 0,
        avgRevenuePerSubscription: revenue[0]?.avgRevenue || 0,
        mrr: mrr.toFixed(2),
        arr: arr.toFixed(2),
        churnRate: parseFloat(churnRate),
        byStatus: subscriptions,
      },
    });
  } catch (error) {
    logger.error('[AdminAnalytics] Get revenue overview failed:', error);
    next(error);
  }
};

/**
 * Get revenue trends over time
 */
exports.getRevenueTrends = async (req, res, next) => {
  try {
    const { startDate, endDate, period = 'month' } = req.query;

    const groupBy = getGroupByFormat(period);

    const trends = await Subscription.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            $lte: endDate ? new Date(endDate) : new Date(),
          },
        },
      },
      {
        $group: {
          _id: groupBy,
          revenue: { $sum: '$price' },
          newSubscriptions: { $sum: 1 },
          activeSubscriptions: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      data: { trends },
    });
  } catch (error) {
    logger.error('[AdminAnalytics] Get revenue trends failed:', error);
    next(error);
  }
};

/**
 * Get revenue breakdown by subscription tier
 */
exports.getRevenueByTier = async (req, res, next) => {
  try {
    const byTier = await Subscription.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: '$tier',
          revenue: { $sum: '$price' },
          count: { $sum: 1 },
          avgPrice: { $avg: '$price' },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    const total = byTier.reduce((sum, tier) => sum + tier.revenue, 0);

    const enrichedData = byTier.map(tier => ({
      tier: tier._id,
      revenue: tier.revenue,
      count: tier.count,
      avgPrice: tier.avgPrice.toFixed(2),
      percentage: ((tier.revenue / total) * 100).toFixed(2),
    }));

    res.json({
      success: true,
      data: {
        byTier: enrichedData,
        total,
      },
    });
  } catch (error) {
    logger.error('[AdminAnalytics] Get revenue by tier failed:', error);
    next(error);
  }
};

/**
 * Get content performance metrics
 */
exports.getContentPerformance = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {
      createdAt: {
        $gte: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lte: endDate ? new Date(endDate) : new Date(),
      },
    };

    const performance = await Insight.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalInsights: { $sum: 1 },
          totalViews: { $sum: '$views' },
          totalLikes: { $sum: '$likes' },
          avgViews: { $avg: '$views' },
          avgLikes: { $avg: '$likes' },
        },
      },
    ]);

    const byCategory = await Insight.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          views: { $sum: '$views' },
          likes: { $sum: '$likes' },
        },
      },
      { $sort: { views: -1 } },
    ]);

    const byType = await Insight.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          views: { $sum: '$views' },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        overall: performance[0] || {},
        byCategory,
        byType,
      },
    });
  } catch (error) {
    logger.error('[AdminAnalytics] Get content performance failed:', error);
    next(error);
  }
};

/**
 * Get top performing content
 */
exports.getTopContent = async (req, res, next) => {
  try {
    const { limit = 10, startDate, endDate } = req.query;

    const dateFilter = startDate || endDate ? {
      createdAt: {
        ...(startDate && { $gte: new Date(startDate) }),
        ...(endDate && { $lte: new Date(endDate) }),
      },
    } : {};

    const [topViewed, topLiked, topEngaging] = await Promise.all([
      Insight.find(dateFilter)
        .sort({ views: -1 })
        .limit(parseInt(limit))
        .select('title views likes category type createdAt'),
      Insight.find(dateFilter)
        .sort({ likes: -1 })
        .limit(parseInt(limit))
        .select('title views likes category type createdAt'),
      Insight.find(dateFilter)
        .sort({ engagementRate: -1 })
        .limit(parseInt(limit))
        .select('title views likes category type createdAt'),
    ]);

    res.json({
      success: true,
      data: {
        topViewed,
        topLiked,
        topEngaging,
      },
    });
  } catch (error) {
    logger.error('[AdminAnalytics] Get top content failed:', error);
    next(error);
  }
};

/**
 * Get engagement metrics
 */
exports.getEngagementMetrics = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {
      createdAt: {
        $gte: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lte: endDate ? new Date(endDate) : new Date(),
      },
    };

    // Get insights engagement
    const insightEngagement = await Insight.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalViews: { $sum: '$views' },
          totalLikes: { $sum: '$likes' },
          avgEngagementRate: { $avg: { $cond: [{ $gt: ['$views', 0] }, { $divide: ['$likes', '$views'] }, 0] } },
        },
      },
    ]);

    // Get notification engagement
    const notificationEngagement = await Notification.aggregate([
      { $match: { ...dateFilter, 'delivery.push.sent': true } },
      {
        $group: {
          _id: null,
          totalSent: { $sum: 1 },
          totalOpened: { $sum: { $cond: ['$delivery.push.opened', 1, 0] } },
        },
      },
    ]);

    const openRate = notificationEngagement[0]
      ? ((notificationEngagement[0].totalOpened / notificationEngagement[0].totalSent) * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        insights: insightEngagement[0] || {},
        notifications: {
          ...notificationEngagement[0],
          openRate: parseFloat(openRate),
        },
      },
    });
  } catch (error) {
    logger.error('[AdminAnalytics] Get engagement metrics failed:', error);
    next(error);
  }
};

/**
 * Get conversion funnel data
 */
exports.getConversionFunnel = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {
      createdAt: {
        $gte: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lte: endDate ? new Date(endDate) : new Date(),
      },
    };

    const [totalUsers, trialUsers, paidUsers] = await Promise.all([
      User.countDocuments(dateFilter),
      // NOTE: subscriptionStatus is not in User model, these will likely return 0
      User.countDocuments({ ...dateFilter, subscriptionStatus: { $in: ['trial', 'active'] } }),
      User.countDocuments({ ...dateFilter, subscriptionStatus: 'active' }),
    ]);

    const conversionRate = totalUsers > 0 ? ((paidUsers / totalUsers) * 100).toFixed(2) : 0;
    const trialConversion = ((paidUsers / (trialUsers || 1)) * 100).toFixed(2);

    res.json({
      success: true,
      data: {
        funnel: [
          { stage: 'Registered', count: totalUsers, percentage: 100 },
          { stage: 'Trial', count: trialUsers, percentage: ((trialUsers / totalUsers) * 100).toFixed(2) },
          { stage: 'Paid', count: paidUsers, percentage: conversionRate },
        ],
        conversionRate: parseFloat(conversionRate),
        trialConversion: parseFloat(trialConversion),
      },
    });
  } catch (error) {
    logger.error('[AdminAnalytics] Get conversion funnel failed:', error);
    next(error);
  }
};

/**
 * Get real-time statistics
 */
exports.getRealtimeStats = async (req, res, next) => {
  try {
    const now = new Date();
    const last5Minutes = new Date(now - 5 * 60 * 1000);
    const last1Hour = new Date(now - 60 * 60 * 1000);

    const [activeNow, activeLastHour, recentSignups, recentContent] = await Promise.all([
      User.countDocuments({
        lastLogin: { $gte: last5Minutes },
        isActive: true,
      }),
      User.countDocuments({
        lastLogin: { $gte: last1Hour },
        isActive: true,
      }),
      User.countDocuments({ createdAt: { $gte: last1Hour } }),
      Insight.countDocuments({ publishedAt: { $gte: last1Hour } }),
    ]);

    res.json({
      success: true,
      data: {
        activeNow,
        activeLastHour,
        recentSignups,
        recentContent,
        timestamp: now,
      },
    });
  } catch (error) {
    logger.error('[AdminAnalytics] Get realtime stats failed:', error);
    next(error);
  }
};

/**
 * Export analytics data to CSV
 */
exports.exportAnalytics = async (req, res, next) => {
  try {
    const { type, startDate, endDate } = req.query;

    let data;
    let fields;

    switch (type) {
      case 'users':
        data = await User.find({
          createdAt: {
            $gte: startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            $lte: endDate ? new Date(endDate) : new Date(),
          },
        }).select('name email role isActive createdAt lastLogin').lean();
        fields = ['name', 'email', 'role', 'isActive', 'createdAt', 'lastLogin'];
        break;

      case 'revenue':
        data = await Subscription.find({
          createdAt: {
            $gte: startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            $lte: endDate ? new Date(endDate) : new Date(),
          },
        }).populate('user', 'name email').lean();
        fields = ['user.name', 'user.email', 'tier', 'price', 'status', 'startDate', 'endDate'];
        break;

      case 'content':
        data = await Insight.find({
          createdAt: {
            $gte: startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            $lte: endDate ? new Date(endDate) : new Date(),
          },
        }).select('title category type views likes status createdAt publishedAt').lean();
        fields = ['title', 'category', 'type', 'views', 'likes', 'status', 'createdAt', 'publishedAt'];
        break;

      default:
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Invalid export type',
        });
    }

    const parser = new Parser({ fields });
    const csv = parser.parse(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-export-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    logger.error('[AdminAnalytics] Export analytics failed:', error);
    next(error);
  }
};

/**
 * Get feature usage stats
 */
exports.getFeatureUsage = async (req, res, next) => {
  try {
    // Placeholder data since we don't have a FeatureUsage model yet
    const features = [
      { feature: 'Stock Alerts', usageCount: 1540 },
      { feature: 'Advanced Charts', usageCount: 1210 },
      { feature: 'Market News', usageCount: 980 },
      { feature: 'Premium Insights', usageCount: 850 },
      { feature: 'Portfolio Tracking', usageCount: 620 }
    ];

    res.json({
      success: true,
      data: features
    });
  } catch (error) {
    logger.error('[AdminAnalytics] Get feature usage failed:', error);
    next(error);
  }
};

/**
 * Get geographic distribution of users
 */
exports.getUserGeoStats = async (req, res, next) => {
  try {
    // Placeholder data
    const geoStats = [
      { country: 'Saudi Arabia', count: 5400 },
      { country: 'UAE', count: 1200 },
      { country: 'Kuwait', count: 850 },
      { country: 'Egypt', count: 650 },
      { country: 'Other', count: 400 }
    ];

    res.json({
      success: true,
      data: geoStats
    });
  } catch (error) {
    logger.error('[AdminAnalytics] Get geo stats failed:', error);
    next(error);
  }
};

/**
 * Get unified engagement overview
 */
exports.getEngagementOverview = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {
      createdAt: {
        $gte: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lte: endDate ? new Date(endDate) : new Date(),
      },
    };

    const effectiveEndDate = endDate ? new Date(endDate) : new Date();

    const [totalUsers, activeUsers, newUsers] = await Promise.all([
      User.countDocuments({ createdAt: { $lte: effectiveEndDate } }),
      User.countDocuments({ createdAt: { $lte: effectiveEndDate }, isActive: true }),
      User.countDocuments(dateFilter),
    ]);

    // Placeholder for session duration (would normally come from an Activity/Session log)
    const avgSessionDuration = 12.5;

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        newUsers,
        avgSessionDuration,
      },
    });
  } catch (error) {
    logger.error('[AdminAnalytics] Get engagement overview failed:', error);
    next(error);
  }
};

/**
 * Compare two periods for growth indicators
 */
exports.comparePeriods = async (req, res, next) => {
  try {
    const { currentStart, currentEnd, previousStart, previousEnd } = req.query;

    const currentFilter = {
      createdAt: { $gte: new Date(currentStart), $lte: new Date(currentEnd) }
    };
    const previousFilter = {
      createdAt: { $gte: new Date(previousStart), $lte: new Date(previousEnd) }
    };

    // Aggregate metrics for both periods
    const [currentMetrics, previousMetrics] = await Promise.all([
      getSummaryMetrics(currentFilter),
      getSummaryMetrics(previousFilter)
    ]);

    res.json({
      success: true,
      data: {
        metrics: previousMetrics, // Previous period data (used for delta base)
        current: currentMetrics, // Current period data
      }
    });
  } catch (error) {
    logger.error('[AdminAnalytics] Compare periods failed:', error);
    next(error);
  }
};

/**
 * Helper to get summary metrics for comparison
 */
async function getSummaryMetrics(filter) {
  const [totalUsers, activeUsers, newUsers, revenue] = await Promise.all([
    User.countDocuments({ createdAt: { $lte: filter.createdAt.$lte } }),
    User.countDocuments({ ...filter, isActive: true }),
    User.countDocuments(filter),
    Subscription.find({ ...filter, status: 'active' }).populate('plan').lean()
  ]);

  const mrr = revenue.reduce((sum, sub) => {
    const price = sub.plan?.price || sub.price || 0;
    return sum + calculateMonthlyPrice(price, sub.billingCycle);
  }, 0);

  return {
    totalUsers,
    activeUsers,
    newUsers,
    mrr,
    arr: mrr * 12
  };
}

/**
 * Get device distribution
 */
exports.getDeviceDistribution = async (req, res, next) => {
  try {
    // Placeholder data based on common app distributions
    const distribution = {
      ios: 45,
      android: 35,
      web: 20
    };

    res.json({
      success: true,
      data: distribution
    });
  } catch (error) {
    logger.error('[AdminAnalytics] Get device distribution failed:', error);
    next(error);
  }
};

// Helper Functions

function getUserStatsAggregate(dateFilter) {
  return User.aggregate([
    { $match: { createdAt: dateFilter } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: { $sum: { $cond: ['$isActive', 1, 0] } },
        premium: { $sum: { $cond: [{ $eq: ['$subscriptionStatus', 'active'] }, 1, 0] } },
        admins: { $sum: { $cond: [{ $in: ['$role', ['admin', 'superadmin']] }, 1, 0] } },
      },
    },
  ]).then(result => result[0] || { total: 0, active: 0, premium: 0, admins: 0 });
}

function getRevenueStatsAggregate(dateFilter) {
  return Subscription.find({ createdAt: dateFilter, status: 'active' }).populate('plan').lean()
    .then(result => {
      const total = result.reduce((sum, sub) => sum + (sub.plan?.price || sub.price || 0), 0);
      return {
        total,
        count: result.length
      };
    });
}

function getContentStatsAggregate(dateFilter) {
  return Insight.aggregate([
    { $match: { createdAt: dateFilter } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        published: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
        premium: { $sum: { $cond: [{ $eq: ['$type', 'premium'] }, 1, 0] } },
      },
    },
  ]).then(result => result[0] || { total: 0, published: 0, premium: 0 });
}

function getEngagementStatsAggregate(dateFilter) {
  return Insight.aggregate([
    { $match: { createdAt: dateFilter } },
    {
      $group: {
        _id: null,
        totalViews: { $sum: '$viewCount' },
        totalLikes: { $sum: '$likeCount' },
      },
    },
  ]).then(result => result[0] || { totalViews: 0, totalLikes: 0 });
}

function getGroupByFormat(period) {
  switch (period) {
    case 'day':
      return {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' },
      };
    case 'week':
      return {
        year: { $year: '$createdAt' },
        week: { $week: '$createdAt' },
      };
    case 'month':
      return {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
      };
    case 'year':
      return { year: { $year: '$createdAt' } };
    default:
      return {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
      };
  }
}

function calculateMonthlyPrice(price, billingCycle) {
  const safePrice = parseFloat(price) || 0;
  switch (billingCycle) {
    case 'monthly':
      return safePrice;
    case 'quarterly':
      return safePrice / 3;
    case 'yearly':
      return safePrice / 12;
    default:
      return safePrice;
  }
}
