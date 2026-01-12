/**
 * Admin Moderation Controller
 * Handles content moderation operations
 */

const Insight = require('../models/Insight');
const ModerationQueue = require('../models/ModerationQueue');
const FlaggedContent = require('../models/FlaggedContent');
const { HTTP_STATUS, AUDIT_ACTIONS } = require('../constants');
const logger = require('../utils/logger');
const AuditLogger = require('../utils/auditLogger');

/**
 * Get moderation queue
 */
exports.getQueue = async (req, res, next) => {
  try {
    const { type, status = 'pending', page = 1, limit = 20 } = req.query;

    const query = { status };
    if (type) query.contentType = type;

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      ModerationQueue.find(query)
        .populate('contentId')
        .populate('submittedBy', 'name email')
        .populate('moderatedBy', 'name email')
        .sort({ priority: -1, createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ModerationQueue.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
          hasMore: skip + items.length < total,
        },
      },
    });
  } catch (error) {
    logger.error('[AdminModeration] Get queue failed:', error);
    next(error);
  }
};

/**
 * Approve an insight
 */
exports.approveInsight = async (req, res, next) => {
  try {
    const { insightId } = req.params;
    const { note, publish = false } = req.body;

    const insight = await Insight.findById(insightId);
    if (!insight) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Insight not found',
      });
    }

    // Update moderation queue
    await ModerationQueue.findOneAndUpdate(
      { contentId: insightId, contentType: 'insight' },
      {
        status: 'approved',
        moderatedBy: req.user.id,
        moderatedAt: new Date(),
        note,
      },
      { upsert: true }
    );

    // Optionally publish
    if (publish) {
      insight.status = 'published';
      insight.publishedAt = new Date();
      insight.publishedBy = req.user.id;
    }

    await insight.save();

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'INSIGHT_APPROVED',
      target: { resourceType: 'Insight', resourceId: insight._id, resourceName: insight.title },
      metadata: { published: publish, note },
    });

    res.json({
      success: true,
      message: `Insight approved${publish ? ' and published' : ''}`,
      data: insight,
    });
  } catch (error) {
    logger.error('[AdminModeration] Approve insight failed:', error);
    next(error);
  }
};

/**
 * Reject an insight
 */
exports.rejectInsight = async (req, res, next) => {
  try {
    const { insightId } = req.params;
    const { reason, note } = req.body;

    const insight = await Insight.findById(insightId);
    if (!insight) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Insight not found',
      });
    }

    // Update moderation queue
    await ModerationQueue.findOneAndUpdate(
      { contentId: insightId, contentType: 'insight' },
      {
        status: 'rejected',
        moderatedBy: req.user.id,
        moderatedAt: new Date(),
        reason,
        note,
      },
      { upsert: true }
    );

    // Mark insight as rejected
    insight.status = 'archived';
    await insight.save();

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'INSIGHT_REJECTED',
      target: { resourceType: 'Insight', resourceId: insight._id, resourceName: insight.title },
      metadata: { reason, note },
    });

    res.json({
      success: true,
      message: 'Insight rejected',
    });
  } catch (error) {
    logger.error('[AdminModeration] Reject insight failed:', error);
    next(error);
  }
};

/**
 * Request changes to an insight
 */
exports.requestChanges = async (req, res, next) => {
  try {
    const { insightId } = req.params;
    const { changes } = req.body;

    const insight = await Insight.findById(insightId);
    if (!insight) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Insight not found',
      });
    }

    // Update moderation queue
    await ModerationQueue.findOneAndUpdate(
      { contentId: insightId, contentType: 'insight' },
      {
        status: 'changes_requested',
        moderatedBy: req.user.id,
        moderatedAt: new Date(),
        changesRequested: changes,
      },
      { upsert: true }
    );

    insight.status = 'under_review';
    await insight.save();

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'CHANGES_REQUESTED',
      target: { resourceType: 'Insight', resourceId: insight._id, resourceName: insight.title },
      metadata: { changes },
    });

    res.json({
      success: true,
      message: 'Changes requested',
    });
  } catch (error) {
    logger.error('[AdminModeration] Request changes failed:', error);
    next(error);
  }
};

/**
 * Flag an insight for review
 */
exports.flagInsight = async (req, res, next) => {
  try {
    const { insightId } = req.params;
    const { reason, severity = 'medium' } = req.body;

    const insight = await Insight.findById(insightId);
    if (!insight) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Insight not found',
      });
    }

    const flagged = await FlaggedContent.create({
      contentType: 'insight',
      contentId: insightId,
      contentModel: 'Insight',
      reason,
      severity,
      flaggedBy: req.user.id,
    });

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'CONTENT_FLAGGED',
      target: { resourceType: 'Insight', resourceId: insight._id, resourceName: insight.title },
      metadata: { reason, severity },
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Content flagged for review',
      data: flagged,
    });
  } catch (error) {
    logger.error('[AdminModeration] Flag insight failed:', error);
    next(error);
  }
};

/**
 * Get all flagged content
 */
exports.getFlaggedContent = async (req, res, next) => {
  try {
    const { severity, resolved = false } = req.query;

    const query = { resolved: resolved === 'true' };
    if (severity) query.severity = severity;

    const flagged = await FlaggedContent.find(query)
      .populate('contentId')
      .populate('flaggedBy', 'name email')
      .populate('resolvedBy', 'name email')
      .sort({ severity: -1, createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: flagged,
    });
  } catch (error) {
    logger.error('[AdminModeration] Get flagged content failed:', error);
    next(error);
  }
};

/**
 * Resolve a flagged item
 */
exports.resolveFlag = async (req, res, next) => {
  try {
    const { flagId } = req.params;
    const { action, note } = req.body;

    const flagged = await FlaggedContent.findById(flagId);
    if (!flagged) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Flagged content not found',
      });
    }

    flagged.resolved = true;
    flagged.resolvedBy = req.user.id;
    flagged.resolvedAt = new Date();
    flagged.action = action;
    flagged.note = note;
    await flagged.save();

    // Take action based on decision
    if (action === 'remove') {
      if (flagged.contentType === 'insight') {
        await Insight.findByIdAndUpdate(flagged.contentId, { status: 'archived' });
      }
    }

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'FLAG_RESOLVED',
      target: { resourceType: 'FlaggedContent', resourceId: flagged._id },
      metadata: { action, note },
    });

    res.json({
      success: true,
      message: 'Flag resolved',
      data: flagged,
    });
  } catch (error) {
    logger.error('[AdminModeration] Resolve flag failed:', error);
    next(error);
  }
};

/**
 * Get moderation statistics
 */
exports.getModerationStats = async (req, res, next) => {
  try {
    const [queueStats, flagStats] = await Promise.all([
      ModerationQueue.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      FlaggedContent.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            unresolved: { $sum: { $cond: [{ $eq: ['$resolved', false] }, 1, 0] } },
            critical: {
              $sum: { $cond: [{ $and: [{ $eq: ['$severity', 'critical'] }, { $eq: ['$resolved', false] }] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const queueByStatus = {};
    queueStats.forEach(item => {
      queueByStatus[item._id] = item.count;
    });

    res.json({
      success: true,
      data: {
        queue: queueByStatus,
        flagged: flagStats[0] || { total: 0, unresolved: 0, critical: 0 },
      },
    });
  } catch (error) {
    logger.error('[AdminModeration] Get moderation stats failed:', error);
    next(error);
  }
};

/**
 * Get moderation history
 */
exports.getModerationHistory = async (req, res, next) => {
  try {
    const { moderatorId, startDate, endDate } = req.query;

    const query = { status: { $in: ['approved', 'rejected'] } };
    if (moderatorId) query.moderatedBy = moderatorId;

    if (startDate || endDate) {
      query.moderatedAt = {};
      if (startDate) query.moderatedAt.$gte = new Date(startDate);
      if (endDate) query.moderatedAt.$lte = new Date(endDate);
    }

    const history = await ModerationQueue.find(query)
      .populate('contentId')
      .populate('moderatedBy', 'name email')
      .sort({ moderatedAt: -1 })
      .limit(100)
      .lean();

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    logger.error('[AdminModeration] Get moderation history failed:', error);
    next(error);
  }
};
