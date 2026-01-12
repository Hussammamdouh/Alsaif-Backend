/**
 * Admin Revenue Dashboard Controller
 * Handles revenue analytics, payment tracking, and financial metrics
 */

const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');

/**
 * Helper: Calculate monthly price from any billing cycle
 */
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

/**
 * Helper: Get period grouping format
 */
function getGroupByFormat(period) {
  switch (period) {
    case 'day':
      return {
        $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
      };
    case 'week':
      return {
        year: { $year: '$createdAt' },
        week: { $week: '$createdAt' },
      };
    case 'month':
      return {
        $dateToString: { format: '%Y-%m', date: '$createdAt' },
      };
    case 'year':
      return {
        $dateToString: { format: '%Y', date: '$createdAt' },
      };
    default:
      return {
        $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
      };
  }
}

/**
 * Get revenue overview with MRR, ARR, churn, and growth
 */
exports.getRevenueOverview = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    // Active subscriptions for MRR/ARR
    const activeSubscriptions = await Subscription.find({ status: 'active' }).populate('plan').lean();

    const mrr = activeSubscriptions.reduce((sum, sub) => {
      const price = sub.plan?.price || sub.price || 0;
      const monthlyPrice = calculateMonthlyPrice(price, sub.billingCycle);
      return sum + monthlyPrice;
    }, 0);

    const arr = mrr * 12;

    // Churn rate calculation (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const totalCancelled = await Subscription.countDocuments({
      status: 'cancelled',
      cancelledAt: { $gte: thirtyDaysAgo },
    });

    const totalActive = activeSubscriptions.length;
    const churnRate = totalActive + totalCancelled > 0
      ? ((totalCancelled / (totalActive + totalCancelled)) * 100).toFixed(2)
      : 0;

    // Revenue by tier
    const revenueByTier = activeSubscriptions.reduce((acc, sub) => {
      const tier = sub.tier || 'basic';
      const price = sub.plan?.price || sub.price || 0;
      const monthlyPrice = calculateMonthlyPrice(price, sub.billingCycle);
      acc[tier] = (acc[tier] || 0) + monthlyPrice;
      return acc;
    }, {});

    // Total payments in period
    const paymentQuery = {};
    if (startDate || endDate) {
      paymentQuery.createdAt = {};
      if (startDate) paymentQuery.createdAt.$gte = new Date(startDate);
      if (endDate) paymentQuery.createdAt.$lte = new Date(endDate);
    }

    const totalRevenue = await Payment.aggregate([
      { $match: { status: 'completed', ...paymentQuery } },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    // Average revenue per user
    const arpu = totalActive > 0 ? (mrr / totalActive).toFixed(2) : 0;

    // Customer lifetime value (simplified)
    const avgSubscriptionLength = 12; // months (placeholder)
    const ltv = (arpu * avgSubscriptionLength).toFixed(2);

    res.json({
      success: true,
      data: {
        mrr: parseFloat(mrr.toFixed(2)),
        arr: parseFloat(arr.toFixed(2)),
        churnRate: parseFloat(churnRate),
        activeSubscriptions: totalActive,
        revenueByTier,
        totalRevenue: totalRevenue[0]?.total || 0,
        totalPayments: totalRevenue[0]?.count || 0,
        arpu: parseFloat(arpu),
        ltv: parseFloat(ltv),
      },
    });
  } catch (error) {
    logger.error('[AdminRevenue] Get revenue overview failed:', error);
    next(error);
  }
};

/**
 * Get revenue trends over time
 */
exports.getRevenueTrends = async (req, res, next) => {
  try {
    const { startDate, endDate, period = 'day' } = req.query;

    const matchQuery = { status: 'completed' };
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const groupBy = getGroupByFormat(period);

    const trends = await Payment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: groupBy,
          revenue: { $sum: '$amount' },
          transactions: { $sum: 1 },
          averageTransaction: { $avg: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      data: trends,
    });
  } catch (error) {
    logger.error('[AdminRevenue] Get revenue trends failed:', error);
    next(error);
  }
};

/**
 * Get payment breakdown by method
 */
exports.getPaymentBreakdown = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const matchQuery = { status: 'completed' };
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const breakdown = await Payment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$paymentMethod',
          revenue: { $sum: '$amount' },
          count: { $sum: 1 },
          averageAmount: { $avg: '$amount' },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    res.json({
      success: true,
      data: breakdown,
    });
  } catch (error) {
    logger.error('[AdminRevenue] Get payment breakdown failed:', error);
    next(error);
  }
};

/**
 * Get failed payments
 */
exports.getFailedPayments = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      Payment.find({ status: 'failed' })
        .populate('user', 'name email')
        .populate('subscription')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Payment.countDocuments({ status: 'failed' }),
    ]);

    res.json({
      success: true,
      data: {
        payments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
          hasMore: skip + payments.length < total,
        },
      },
    });
  } catch (error) {
    logger.error('[AdminRevenue] Get failed payments failed:', error);
    next(error);
  }
};

/**
 * Get refund statistics
 */
exports.getRefundStats = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const matchQuery = { status: 'refunded' };
    if (startDate || endDate) {
      matchQuery.refundedAt = {};
      if (startDate) matchQuery.refundedAt.$gte = new Date(startDate);
      if (endDate) matchQuery.refundedAt.$lte = new Date(endDate);
    }

    const refundStats = await Payment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalRefunded: { $sum: '$amount' },
          count: { $sum: 1 },
          averageRefund: { $avg: '$amount' },
        },
      },
    ]);

    // Refund reasons breakdown
    const refundReasons = await Payment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$refundReason',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json({
      success: true,
      data: {
        overview: refundStats[0] || { totalRefunded: 0, count: 0, averageRefund: 0 },
        byReason: refundReasons,
      },
    });
  } catch (error) {
    logger.error('[AdminRevenue] Get refund stats failed:', error);
    next(error);
  }
};

/**
 * Get subscription revenue by tier
 */
exports.getRevenueByTier = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const matchQuery = { status: 'active' };
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const tierRevenue = await Subscription.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$tier',
          subscribers: { $sum: 1 },
          totalRevenue: { $sum: '$price' },
          averagePrice: { $avg: '$price' },
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]);

    res.json({
      success: true,
      data: tierRevenue,
    });
  } catch (error) {
    logger.error('[AdminRevenue] Get revenue by tier failed:', error);
    next(error);
  }
};

/**
 * Get top paying customers
 */
exports.getTopCustomers = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;

    const topCustomers = await Payment.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: '$user',
          totalSpent: { $sum: '$amount' },
          paymentCount: { $sum: 1 },
          lastPayment: { $max: '$createdAt' },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 1,
          totalSpent: 1,
          paymentCount: 1,
          lastPayment: 1,
          'user.name': 1,
          'user.email': 1,
          'user.subscriptionTier': 1,
        },
      },
    ]);

    res.json({
      success: true,
      data: topCustomers,
    });
  } catch (error) {
    logger.error('[AdminRevenue] Get top customers failed:', error);
    next(error);
  }
};

/**
 * Get payment timeline
 */
exports.getPaymentTimeline = async (req, res, next) => {
  try {
    const { startDate, endDate, period = 'day' } = req.query;

    const matchQuery = {};
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const groupBy = getGroupByFormat(period);

    const timeline = await Payment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            period: groupBy,
            status: '$status',
          },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.period': 1 } },
    ]);

    // Restructure for easier frontend consumption
    const formattedTimeline = timeline.reduce((acc, item) => {
      const period = typeof item._id.period === 'string'
        ? item._id.period
        : JSON.stringify(item._id.period);

      if (!acc[period]) {
        acc[period] = { period };
      }

      acc[period][item._id.status] = {
        amount: item.amount,
        count: item.count,
      };

      return acc;
    }, {});

    res.json({
      success: true,
      data: Object.values(formattedTimeline),
    });
  } catch (error) {
    logger.error('[AdminRevenue] Get payment timeline failed:', error);
    next(error);
  }
};

/**
 * Export revenue data to CSV
 */
exports.exportRevenueData = async (req, res, next) => {
  try {
    const { startDate, endDate, type = 'payments' } = req.body;

    const matchQuery = {};
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    let data = [];
    let fields = [];

    if (type === 'payments') {
      const payments = await Payment.find(matchQuery)
        .populate('user', 'name email')
        .lean();

      fields = ['_id', 'user.name', 'user.email', 'amount', 'currency', 'status', 'paymentMethod', 'createdAt'];
      data = payments.map(p => ({
        _id: p._id.toString(),
        'user.name': p.user?.name || 'N/A',
        'user.email': p.user?.email || 'N/A',
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        paymentMethod: p.paymentMethod,
        createdAt: p.createdAt,
      }));
    } else if (type === 'subscriptions') {
      const subscriptions = await Subscription.find(matchQuery)
        .populate('user', 'name email')
        .lean();

      fields = ['_id', 'user.name', 'user.email', 'tier', 'price', 'billingCycle', 'status', 'startDate', 'endDate'];
      data = subscriptions.map(s => ({
        _id: s._id.toString(),
        'user.name': s.user?.name || 'N/A',
        'user.email': s.user?.email || 'N/A',
        tier: s.tier,
        price: s.price,
        billingCycle: s.billingCycle,
        status: s.status,
        startDate: s.startDate,
        endDate: s.endDate,
      }));
    }

    const { Parser } = require('json2csv');
    const parser = new Parser({ fields });
    const csv = parser.parse(data);

    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', `attachment; filename="revenue-${type}-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    logger.error('[AdminRevenue] Export revenue data failed:', error);
    next(error);
  }
};

/**
 * Get revenue forecast (basic projection)
 */
exports.getRevenueForecast = async (req, res, next) => {
  try {
    const { months = 3 } = req.query;

    // Get last 3 months MRR data
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const historicalMRR = await Subscription.aggregate([
      {
        $match: {
          createdAt: { $gte: threeMonthsAgo },
          status: 'active',
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m', date: '$createdAt' },
          },
          mrr: { $sum: '$price' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Simple linear growth projection
    const avgGrowthRate = historicalMRR.length > 1
      ? (historicalMRR[historicalMRR.length - 1].mrr - historicalMRR[0].mrr) / historicalMRR.length
      : 0;

    const currentMRR = historicalMRR[historicalMRR.length - 1]?.mrr || 0;
    const forecast = [];

    for (let i = 1; i <= parseInt(months); i++) {
      const projectedMRR = currentMRR + (avgGrowthRate * i);
      const date = new Date();
      date.setMonth(date.getMonth() + i);

      forecast.push({
        month: date.toISOString().substring(0, 7),
        projectedMRR: Math.max(0, projectedMRR.toFixed(2)),
        projectedARR: Math.max(0, (projectedMRR * 12).toFixed(2)),
      });
    }

    res.json({
      success: true,
      data: {
        historical: historicalMRR,
        forecast,
        avgMonthlyGrowth: avgGrowthRate.toFixed(2),
      },
    });
  } catch (error) {
    logger.error('[AdminRevenue] Get revenue forecast failed:', error);
    next(error);
  }
};
