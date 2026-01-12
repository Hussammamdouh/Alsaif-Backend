/**
 * Admin Bulk Operations Controller
 * Handles bulk actions on users, insights, and subscriptions
 */

const User = require('../models/User');
const Insight = require('../models/Insight');
const Subscription = require('../models/Subscription');
const Notification = require('../models/Notification');
const { HTTP_STATUS, NOTIFICATION_EVENTS, AUDIT_ACTIONS } = require('../constants');
const logger = require('../utils/logger');
const AuditLogger = require('../utils/auditLogger');
const { Parser } = require('json2csv');

/**
 * USER BULK OPERATIONS
 */

/**
 * Bulk suspend users
 */
exports.bulkSuspendUsers = async (req, res, next) => {
  try {
    const { userIds, reason } = req.body;

    // Prevent self-suspension
    if (userIds.includes(req.user.id)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Cannot suspend yourself',
      });
    }

    // Get users before update for audit log
    const users = await User.find({ _id: { $in: userIds } }).select('email isActive');

    // Perform bulk update
    const result = await User.updateMany(
      { _id: { $in: userIds }, role: { $nin: ['admin', 'superadmin'] } }, // Cannot suspend admins
      {
        $set: { isActive: false, suspendedAt: new Date(), suspendedBy: req.user.id },
      }
    );

    // Log each suspension for audit trail
    await Promise.all(
      users.map(user =>
        AuditLogger.logFromRequest(req, {
          action: AUDIT_ACTIONS.USER_SUSPENDED,
          target: { resourceType: 'User', resourceId: user._id, resourceName: user.email },
          changes: { before: { isActive: user.isActive }, after: { isActive: false } },
          metadata: { reason, bulkOperation: true },
        })
      )
    );

    res.json({
      success: true,
      message: `Successfully suspended ${result.modifiedCount} users`,
      data: {
        modified: result.modifiedCount,
        requested: userIds.length,
      },
    });
  } catch (error) {
    logger.error('[AdminBulk] Bulk suspend users failed:', error);
    next(error);
  }
};

/**
 * Bulk activate users
 */
exports.bulkActivateUsers = async (req, res, next) => {
  try {
    const { userIds, reason } = req.body;

    const users = await User.find({ _id: { $in: userIds } }).select('email isActive');

    const result = await User.updateMany(
      { _id: { $in: userIds } },
      {
        $set: { isActive: true },
        $unset: { suspendedAt: '', suspendedBy: '' },
      }
    );

    // Audit log
    await Promise.all(
      users.map(user =>
        AuditLogger.logFromRequest(req, {
          action: AUDIT_ACTIONS.USER_ACTIVATED,
          target: { resourceType: 'User', resourceId: user._id, resourceName: user.email },
          changes: { before: { isActive: user.isActive }, after: { isActive: true } },
          metadata: { reason, bulkOperation: true },
        })
      )
    );

    res.json({
      success: true,
      message: `Successfully activated ${result.modifiedCount} users`,
      data: {
        modified: result.modifiedCount,
        requested: userIds.length,
      },
    });
  } catch (error) {
    logger.error('[AdminBulk] Bulk activate users failed:', error);
    next(error);
  }
};

/**
 * Bulk delete users (superadmin only)
 */
exports.bulkDeleteUsers = async (req, res, next) => {
  try {
    const { userIds, reason } = req.body;

    // Prevent self-deletion
    if (userIds.includes(req.user.id)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Cannot delete yourself',
      });
    }

    const users = await User.find({ _id: { $in: userIds } }).select('email role');

    // Cannot delete other superadmins
    const canDelete = users.filter(u => u.role !== 'superadmin');
    const cannotDelete = users.filter(u => u.role === 'superadmin');

    const result = await User.deleteMany({
      _id: { $in: canDelete.map(u => u._id) },
    });

    // Audit log
    await Promise.all(
      canDelete.map(user =>
        AuditLogger.logFromRequest(req, {
          action: AUDIT_ACTIONS.USER_DELETED,
          target: { resourceType: 'User', resourceId: user._id, resourceName: user.email },
          metadata: { reason, bulkOperation: true },
        })
      )
    );

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} users`,
      data: {
        deleted: result.deletedCount,
        skipped: cannotDelete.length,
        reason: cannotDelete.length > 0 ? 'Cannot delete superadmins' : null,
      },
    });
  } catch (error) {
    logger.error('[AdminBulk] Bulk delete users failed:', error);
    next(error);
  }
};

/**
 * Export selected users to CSV
 */
exports.exportUsers = async (req, res, next) => {
  try {
    const { userIds, fields } = req.body;

    const defaultFields = ['name', 'email', 'role', 'isActive', 'subscriptionStatus', 'createdAt', 'lastActiveAt'];
    const selectedFields = fields && fields.length > 0 ? fields : defaultFields;

    const users = await User.find({ _id: { $in: userIds } })
      .select(selectedFields.join(' '))
      .lean();

    const parser = new Parser({ fields: selectedFields });
    const csv = parser.parse(users);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="users-export-${Date.now()}.csv"`);
    res.send(csv);

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'USER_EXPORT',
      metadata: { count: users.length, fields: selectedFields, bulkOperation: true },
    });
  } catch (error) {
    logger.error('[AdminBulk] Export users failed:', error);
    next(error);
  }
};

/**
 * Send targeted message to multiple users
 */
exports.bulkMessageUsers = async (req, res, next) => {
  try {
    const { userIds, title, body, priority = 'medium', actionUrl, imageUrl } = req.body;

    // Create notifications for all users
    const notifications = await Notification.insertMany(
      userIds.map(userId => ({
        recipient: userId,
        type: NOTIFICATION_EVENTS.ANNOUNCEMENT,
        priority,
        title,
        body,
        richContent: { actionUrl, imageUrl, metadata: { bulkMessage: true, adminId: req.user.id } },
        channels: { push: { enabled: true }, inApp: { enabled: true } },
      }))
    );

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'BULK_MESSAGE_SENT',
      metadata: {
        recipientCount: userIds.length,
        title,
        priority,
        bulkOperation: true,
      },
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: `Message sent to ${notifications.length} users`,
      data: { recipientCount: notifications.length },
    });
  } catch (error) {
    logger.error('[AdminBulk] Bulk message users failed:', error);
    next(error);
  }
};

/**
 * INSIGHT BULK OPERATIONS
 */

/**
 * Bulk publish insights
 */
exports.bulkPublishInsights = async (req, res, next) => {
  try {
    const { insightIds } = req.body;

    const insights = await Insight.find({ _id: { $in: insightIds } }).select('title status');

    const result = await Insight.updateMany(
      { _id: { $in: insightIds }, status: { $ne: 'published' } },
      {
        $set: {
          status: 'published',
          publishedAt: new Date(),
          publishedBy: req.user.id,
        },
      }
    );

    // Audit log
    await Promise.all(
      insights.map(insight =>
        AuditLogger.logFromRequest(req, {
          action: AUDIT_ACTIONS.INSIGHT_PUBLISHED,
          target: { resourceType: 'Insight', resourceId: insight._id, resourceName: insight.title },
          changes: { before: { status: insight.status }, after: { status: 'published' } },
          metadata: { bulkOperation: true },
        })
      )
    );

    res.json({
      success: true,
      message: `Successfully published ${result.modifiedCount} insights`,
      data: {
        modified: result.modifiedCount,
        requested: insightIds.length,
      },
    });
  } catch (error) {
    logger.error('[AdminBulk] Bulk publish insights failed:', error);
    next(error);
  }
};

/**
 * Bulk unpublish insights
 */
exports.bulkUnpublishInsights = async (req, res, next) => {
  try {
    const { insightIds } = req.body;

    const insights = await Insight.find({ _id: { $in: insightIds } }).select('title status');

    const result = await Insight.updateMany(
      { _id: { $in: insightIds } },
      { $set: { status: 'draft' }, $unset: { publishedAt: '' } }
    );

    await Promise.all(
      insights.map(insight =>
        AuditLogger.logFromRequest(req, {
          action: 'INSIGHT_UNPUBLISHED',
          target: { resourceType: 'Insight', resourceId: insight._id, resourceName: insight.title },
          changes: { before: { status: insight.status }, after: { status: 'draft' } },
          metadata: { bulkOperation: true },
        })
      )
    );

    res.json({
      success: true,
      message: `Successfully unpublished ${result.modifiedCount} insights`,
      data: { modified: result.modifiedCount },
    });
  } catch (error) {
    logger.error('[AdminBulk] Bulk unpublish insights failed:', error);
    next(error);
  }
};

/**
 * Bulk archive insights
 */
exports.bulkArchiveInsights = async (req, res, next) => {
  try {
    const { insightIds } = req.body;

    const insights = await Insight.find({ _id: { $in: insightIds } }).select('title status');

    const result = await Insight.updateMany(
      { _id: { $in: insightIds } },
      { $set: { status: 'archived', archivedAt: new Date() } }
    );

    await Promise.all(
      insights.map(insight =>
        AuditLogger.logFromRequest(req, {
          action: 'INSIGHT_ARCHIVED',
          target: { resourceType: 'Insight', resourceId: insight._id, resourceName: insight.title },
          metadata: { bulkOperation: true },
        })
      )
    );

    res.json({
      success: true,
      message: `Successfully archived ${result.modifiedCount} insights`,
      data: { modified: result.modifiedCount },
    });
  } catch (error) {
    logger.error('[AdminBulk] Bulk archive insights failed:', error);
    next(error);
  }
};

/**
 * Bulk delete insights
 */
exports.bulkDeleteInsights = async (req, res, next) => {
  try {
    const { insightIds, reason } = req.body;

    const insights = await Insight.find({ _id: { $in: insightIds } }).select('title');

    const result = await Insight.deleteMany({ _id: { $in: insightIds } });

    await Promise.all(
      insights.map(insight =>
        AuditLogger.logFromRequest(req, {
          action: AUDIT_ACTIONS.INSIGHT_DELETED,
          target: { resourceType: 'Insight', resourceId: insight._id, resourceName: insight.title },
          metadata: { reason, bulkOperation: true },
        })
      )
    );

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} insights`,
      data: { deleted: result.deletedCount },
    });
  } catch (error) {
    logger.error('[AdminBulk] Bulk delete insights failed:', error);
    next(error);
  }
};

/**
 * Bulk update insight category
 */
exports.bulkUpdateInsightCategory = async (req, res, next) => {
  try {
    const { insightIds, category } = req.body;

    const result = await Insight.updateMany(
      { _id: { $in: insightIds } },
      { $set: { category, updatedAt: new Date() } }
    );

    await AuditLogger.logFromRequest(req, {
      action: 'INSIGHT_CATEGORY_UPDATED',
      metadata: {
        count: result.modifiedCount,
        category,
        bulkOperation: true,
      },
    });

    res.json({
      success: true,
      message: `Successfully updated category for ${result.modifiedCount} insights`,
      data: { modified: result.modifiedCount },
    });
  } catch (error) {
    logger.error('[AdminBulk] Bulk update category failed:', error);
    next(error);
  }
};

/**
 * Bulk feature/unfeature insights
 */
exports.bulkFeatureInsights = async (req, res, next) => {
  try {
    const { insightIds, featured } = req.body;

    const result = await Insight.updateMany(
      { _id: { $in: insightIds } },
      { $set: { featured, updatedAt: new Date() } }
    );

    await AuditLogger.logFromRequest(req, {
      action: featured ? 'INSIGHTS_FEATURED' : 'INSIGHTS_UNFEATURED',
      metadata: {
        count: result.modifiedCount,
        bulkOperation: true,
      },
    });

    res.json({
      success: true,
      message: `Successfully ${featured ? 'featured' : 'unfeatured'} ${result.modifiedCount} insights`,
      data: { modified: result.modifiedCount },
    });
  } catch (error) {
    logger.error('[AdminBulk] Bulk feature insights failed:', error);
    next(error);
  }
};

/**
 * SUBSCRIPTION BULK OPERATIONS
 */

/**
 * Bulk grant subscriptions
 */
exports.bulkGrantSubscriptions = async (req, res, next) => {
  try {
    const { userIds, tier, durationDays, reason } = req.body;

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // Create subscriptions for all users
    const subscriptions = await Subscription.insertMany(
      userIds.map(userId => ({
        user: userId,
        tier,
        status: 'active',
        startDate,
        endDate,
        grantedBy: req.user.id,
        grantReason: reason,
      }))
    );

    // Update user subscription status
    await User.updateMany(
      { _id: { $in: userIds } },
      { $set: { subscriptionStatus: 'active', subscriptionTier: tier, subscriptionEndDate: endDate } }
    );

    await AuditLogger.logFromRequest(req, {
      action: 'SUBSCRIPTIONS_GRANTED',
      metadata: {
        count: subscriptions.length,
        tier,
        durationDays,
        reason,
        bulkOperation: true,
      },
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: `Successfully granted ${tier} subscriptions to ${subscriptions.length} users`,
      data: { count: subscriptions.length },
    });
  } catch (error) {
    logger.error('[AdminBulk] Bulk grant subscriptions failed:', error);
    next(error);
  }
};

/**
 * Bulk extend subscriptions
 */
exports.bulkExtendSubscriptions = async (req, res, next) => {
  try {
    const { subscriptionIds, durationDays, reason } = req.body;

    const subscriptions = await Subscription.find({ _id: { $in: subscriptionIds } });

    // Extend each subscription
    const updates = await Promise.all(
      subscriptions.map(async (sub) => {
        const newEndDate = new Date(sub.endDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
        await sub.updateOne({ $set: { endDate: newEndDate } });
        await User.findByIdAndUpdate(sub.user, { $set: { subscriptionEndDate: newEndDate } });
        return sub;
      })
    );

    await AuditLogger.logFromRequest(req, {
      action: 'SUBSCRIPTIONS_EXTENDED',
      metadata: {
        count: updates.length,
        durationDays,
        reason,
        bulkOperation: true,
      },
    });

    res.json({
      success: true,
      message: `Successfully extended ${updates.length} subscriptions by ${durationDays} days`,
      data: { count: updates.length },
    });
  } catch (error) {
    logger.error('[AdminBulk] Bulk extend subscriptions failed:', error);
    next(error);
  }
};

/**
 * Bulk revoke subscriptions
 */
exports.bulkRevokeSubscriptions = async (req, res, next) => {
  try {
    const { subscriptionIds, reason } = req.body;

    const subscriptions = await Subscription.find({ _id: { $in: subscriptionIds } });

    const result = await Subscription.updateMany(
      { _id: { $in: subscriptionIds } },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: req.user.id,
          cancellationReason: reason,
        },
      }
    );

    // Update users
    await User.updateMany(
      { _id: { $in: subscriptions.map(s => s.user) } },
      { $set: { subscriptionStatus: 'cancelled' } }
    );

    await AuditLogger.logFromRequest(req, {
      action: 'SUBSCRIPTIONS_REVOKED',
      metadata: {
        count: result.modifiedCount,
        reason,
        bulkOperation: true,
      },
    });

    res.json({
      success: true,
      message: `Successfully revoked ${result.modifiedCount} subscriptions`,
      data: { count: result.modifiedCount },
    });
  } catch (error) {
    logger.error('[AdminBulk] Bulk revoke subscriptions failed:', error);
    next(error);
  }
};

/**
 * Bulk apply discount code
 */
exports.bulkApplyDiscount = async (req, res, next) => {
  try {
    const { subscriptionIds, discountCode } = req.body;

    // TODO: Implement discount code validation when discount system is ready
    // For now, just log the operation

    await AuditLogger.logFromRequest(req, {
      action: 'DISCOUNT_APPLIED',
      metadata: {
        count: subscriptionIds.length,
        discountCode,
        bulkOperation: true,
      },
    });

    res.json({
      success: true,
      message: `Discount code ${discountCode} will be applied to ${subscriptionIds.length} subscriptions`,
      data: { count: subscriptionIds.length },
    });
  } catch (error) {
    logger.error('[AdminBulk] Bulk apply discount failed:', error);
    next(error);
  }
};
