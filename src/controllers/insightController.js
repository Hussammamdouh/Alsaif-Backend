const Insight = require('../models/Insight');
const AuditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_MESSAGES, AUDIT_ACTIONS, CONTENT_ACCESS } = require('../constants');
const { getPaginationParams } = require('../utils/pagination');
const { getCache, LRUCache } = require('../utils/cache');
const { filterInsightsBySubscription, canAccessInsight } = require('../middleware/subscriptionMiddleware');
const { emitInsightPublished, emitInsightUnpublished, emitInsightFeatured } = require('../events/enhancedNotificationEvents');

/**
 * Insight Controller
 *
 * Purpose: Manage insights (content) for users
 * Access:
 * - Public endpoints: GET published insights
 * - User endpoints: GET premium insights (premium users only)
 * - Admin endpoints: Full CRUD, feature, moderate
 */

class InsightController {
  /**
   * Create new insight (Admin/Superadmin only)
   * POST /api/admin/insights
   */
  async createInsight(req, res, next) {
    try {
      const {
        title,
        content,
        excerpt,
        type,
        category,
        tags,
        coverImage,
        status,
        scheduledFor
      } = req.body;

      const insight = await Insight.create({
        title,
        content,
        excerpt,
        type: type || 'free',
        category: category || 'other',
        tags: tags || [],
        coverImage,
        author: req.user.id,
        status: scheduledFor ? 'scheduled' : (status || 'draft'),
        scheduledFor: scheduledFor || null
      });

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.INSIGHT_CREATED,
        target: {
          resourceType: 'Insight',
          resourceId: insight._id,
          resourceName: insight.title
        },
        changes: {
          after: {
            title: insight.title,
            type: insight.type,
            category: insight.category,
            status: insight.status
          }
        },
        metadata: {
          severity: 'low'
        }
      });

      // PERFORMANCE: Invalidate insights cache
      const cache = getCache('insights');
      cache.invalidate('*');  // Clear all insights cache

      // NOTIFICATION EVENT: Emit if insight published
      if (insight.status === 'published') {
        emitInsightPublished({
          insight,
          authorId: req.user.id,
          type: insight.type
        });
      }

      // Transform _id to id for frontend compatibility
      const insightResponse = insight.toObject();
      insightResponse.id = insightResponse._id.toString();
      delete insightResponse._id;

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Insight created successfully',
        data: { insight: insightResponse }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update insight (Admin/Superadmin only)
   * PATCH /api/admin/insights/:insightId
   */
  async updateInsight(req, res, next) {
    try {
      const { insightId } = req.params;
      const {
        title,
        content,
        excerpt,
        type,
        category,
        tags,
        coverImage,
        status,
        scheduledFor
      } = req.body;

      const insight = await Insight.findOne({
        _id: insightId,
        isDeleted: false
      });

      if (!insight) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Insight not found'
        });
      }

      // Capture before state for audit
      const beforeState = {
        title: insight.title,
        type: insight.type,
        category: insight.category,
        status: insight.status
      };

      // Update fields
      if (title !== undefined) insight.title = title;
      if (content !== undefined) insight.content = content;
      if (excerpt !== undefined) insight.excerpt = excerpt;
      if (type !== undefined) insight.type = type;
      if (category !== undefined) insight.category = category;
      if (tags !== undefined) insight.tags = tags;
      if (coverImage !== undefined) insight.coverImage = coverImage;
      if (status !== undefined) insight.status = status;

      if (scheduledFor !== undefined) {
        insight.scheduledFor = scheduledFor || null;
        if (scheduledFor) {
          insight.status = 'scheduled';
        } else if (insight.status === 'scheduled') {
          insight.status = 'draft';
        }
      }

      await insight.save();

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.INSIGHT_UPDATED,
        target: {
          resourceType: 'Insight',
          resourceId: insight._id,
          resourceName: insight.title
        },
        changes: {
          before: beforeState,
          after: {
            title: insight.title,
            type: insight.type,
            category: insight.category,
            status: insight.status
          }
        },
        metadata: {
          severity: 'low'
        }
      });

      // PERFORMANCE: Invalidate insights cache (including subscription-specific caches)
      const cache = getCache('insights');
      cache.invalidate('*');  // Clear all insights cache

      // NOTIFICATION EVENT: Emit if status changed to published
      if (status === 'published' && beforeState.status !== 'published') {
        emitInsightPublished({
          insight,
          authorId: req.user.id,
          type: insight.type
        });
      }

      // NOTIFICATION EVENT: Emit if status changed from published to something else
      if (beforeState.status === 'published' && status && status !== 'published') {
        emitInsightUnpublished({
          insight,
          unpublishedBy: req.user.id
        });
      }

      // Transform _id to id for frontend compatibility
      const insightResponse = insight.toObject();
      insightResponse.id = insightResponse._id.toString();
      delete insightResponse._id;

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Insight updated successfully',
        data: { insight: insightResponse }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete insight (soft delete) (Admin/Superadmin only)
   * DELETE /api/admin/insights/:insightId
   */
  async deleteInsight(req, res, next) {
    try {
      const { insightId } = req.params;
      const { reason } = req.body;

      const insight = await Insight.findOne({
        _id: insightId,
        isDeleted: false
      });

      if (!insight) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Insight not found'
        });
      }

      // Capture before state
      const beforeState = {
        title: insight.title,
        type: insight.type,
        status: insight.status
      };

      await insight.softDelete(req.user.id);

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.INSIGHT_DELETED,
        target: {
          resourceType: 'Insight',
          resourceId: insight._id,
          resourceName: insight.title
        },
        changes: {
          before: beforeState
        },
        metadata: {
          severity: 'medium',
          reason: reason || 'No reason provided'
        }
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Insight deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Restore deleted insight (Admin/Superadmin only)
   * POST /api/admin/insights/:insightId/restore
   */
  async restoreInsight(req, res, next) {
    try {
      const { insightId } = req.params;

      const insight = await Insight.findOne({
        _id: insightId,
        isDeleted: true
      });

      if (!insight) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Deleted insight not found'
        });
      }

      await insight.restore();

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.INSIGHT_UPDATED,
        target: {
          resourceType: 'Insight',
          resourceId: insight._id,
          resourceName: insight.title
        },
        changes: {
          after: { isDeleted: false }
        },
        metadata: {
          severity: 'medium',
          notes: 'Insight restored from soft delete'
        }
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Insight restored successfully',
        data: { insight }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Feature/unfeature insight (Admin/Superadmin only)
   * PATCH /api/admin/insights/:insightId/feature
   */
  async toggleFeatureInsight(req, res, next) {
    try {
      const { insightId } = req.params;
      const { featured } = req.body;

      const insight = await Insight.findOne({
        _id: insightId,
        isDeleted: false
      });

      if (!insight) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Insight not found'
        });
      }

      const beforeState = { featured: insight.featured };

      if (featured) {
        await insight.feature(req.user.id);
      } else {
        await insight.unfeature();
      }

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.INSIGHT_FEATURED,
        target: {
          resourceType: 'Insight',
          resourceId: insight._id,
          resourceName: insight.title
        },
        changes: {
          before: beforeState,
          after: { featured: insight.featured }
        },
        metadata: {
          severity: 'low'
        }
      });

      // NOTIFICATION EVENT: Emit featured event if insight was featured
      if (featured && !beforeState.featured) {
        emitInsightFeatured({
          insightId: insight._id,
          title: insight.title,
          type: insight.type,
          excerpt: insight.excerpt,
          coverImage: insight.coverImage
        });
      }

      // Transform _id to id for frontend compatibility
      const insightResponse = insight.toObject();
      insightResponse.id = insightResponse._id.toString();
      delete insightResponse._id;

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: `Insight ${featured ? 'featured' : 'unfeatured'} successfully`,
        data: { insight: insightResponse }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Moderate insight (Admin/Superadmin only)
   * POST /api/admin/insights/:insightId/moderate
   */
  async moderateInsight(req, res, next) {
    try {
      const { insightId } = req.params;
      const { notes, status } = req.body;

      const insight = await Insight.findOne({
        _id: insightId,
        isDeleted: false
      });

      if (!insight) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Insight not found'
        });
      }

      const beforeState = {
        status: insight.status,
        moderationNotes: insight.moderationNotes
      };

      await insight.moderate(req.user.id, notes);

      if (status) {
        insight.status = status;
        await insight.save();
      }

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.INSIGHT_UPDATED,
        target: {
          resourceType: 'Insight',
          resourceId: insight._id,
          resourceName: insight.title
        },
        changes: {
          before: beforeState,
          after: {
            status: insight.status,
            moderationNotes: insight.moderationNotes,
            moderatedBy: req.user.id,
            moderatedAt: insight.moderatedAt
          }
        },
        metadata: {
          severity: 'medium',
          notes: 'Content moderation action'
        }
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Insight moderated successfully',
        data: { insight }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all insights (Admin/Superadmin only - includes all statuses)
   * GET /api/admin/insights
   */
  async getAllInsights(req, res, next) {
    try {
      const { page, limit } = getPaginationParams(req.query);
      const {
        type,
        category,
        status,
        featured,
        author,
        includeDeleted
      } = req.query;

      const query = {};

      if (type) query.type = type;
      if (category) query.category = category;
      if (status) query.status = status;
      if (featured !== undefined) query.featured = featured === 'true';
      if (author) query.author = author;
      if (!includeDeleted || includeDeleted !== 'true') {
        query.isDeleted = false;
      }

      const skip = (page - 1) * limit;

      const [insights, total] = await Promise.all([
        Insight.find(query)
          .populate('author', 'name email role')
          .populate('featuredBy', 'name email')
          .populate('moderatedBy', 'name email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Insight.countDocuments(query)
      ]);

      // Transform _id to id for frontend compatibility
      const transformedInsights = insights.map(insight => ({
        ...insight,
        id: insight._id.toString(),
        _id: undefined
      }));

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Insights retrieved successfully',
        data: {
          insights: transformedInsights,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            itemsPerPage: limit
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get single insight (Admin/Superadmin only)
   * GET /api/admin/insights/:insightId
   */
  async getInsightById(req, res, next) {
    try {
      const { insightId } = req.params;

      const insight = await Insight.findById(insightId)
        .populate('author', 'name email role')
        .populate('featuredBy', 'name email')
        .populate('moderatedBy', 'name email')
        .populate('deletedBy', 'name email');

      if (!insight) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Insight not found'
        });
      }

      // Transform _id to id for frontend compatibility
      const insightResponse = insight.toObject();
      insightResponse.id = insightResponse._id.toString();
      delete insightResponse._id;

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Insight retrieved successfully',
        data: { insight: insightResponse }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get insight statistics (Admin/Superadmin only)
   * GET /api/admin/insights/stats
   */
  async getInsightStats(req, res, next) {
    try {
      const stats = await Insight.getStats();

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Insight statistics retrieved successfully',
        data: {
          totalByType: stats.totalByType,
          totalByStatus: stats.totalByStatus,
          totalByCategory: stats.totalByCategory,
          featuredCount: stats.featuredCount[0]?.count || 0,
          totalViews: stats.totalViews[0]?.total || 0,
          totalLikes: stats.totalLikes[0]?.total || 0,
          mostViewed: stats.mostViewed,
          recentPublished: stats.recentPublished
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Schedule insight for future publishing (Admin/Superadmin only)
   * POST /api/admin/insights/:insightId/schedule
   */
  async scheduleInsight(req, res, next) {
    try {
      const { insightId } = req.params;
      const { publishAt } = req.body;

      const insight = await Insight.findOne({
        _id: insightId,
        isDeleted: false
      });

      if (!insight) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Insight not found'
        });
      }

      if (insight.status === 'published') {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Insight is already published'
        });
      }

      const publishDate = new Date(publishAt);
      if (publishDate <= new Date()) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Publish date must be in the future'
        });
      }

      insight.status = 'scheduled';
      insight.scheduledFor = publishDate;
      await insight.save();

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.INSIGHT_UPDATED,
        target: {
          resourceType: 'Insight',
          resourceId: insight._id,
          resourceName: insight.title
        },
        changes: {
          after: {
            status: 'scheduled',
            scheduledFor: publishDate
          }
        },
        metadata: {
          severity: 'low',
          notes: 'Insight scheduled for future publishing'
        }
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Insight scheduled successfully',
        data: { insight }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all scheduled insights (Admin/Superadmin only)
   * GET /api/admin/insights/scheduled/all
   */
  async getScheduledInsights(req, res, next) {
    try {
      const { page, limit } = getPaginationParams(req.query);
      const skip = (page - 1) * limit;

      const [insights, total] = await Promise.all([
        Insight.find({ status: 'scheduled', isDeleted: false })
          .populate('author', 'name email')
          .sort({ scheduledFor: 1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Insight.countDocuments({ status: 'scheduled', isDeleted: false })
      ]);

      // Transform _id to id
      const transformedInsights = insights.map(insight => ({
        ...insight,
        id: insight._id.toString(),
        _id: undefined
      }));

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Scheduled insights retrieved successfully',
        data: {
          insights: transformedInsights,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            itemsPerPage: limit
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel scheduled insight (Admin/Superadmin only)
   * POST /api/admin/insights/:insightId/cancel-schedule
   */
  async cancelSchedule(req, res, next) {
    try {
      const { insightId } = req.params;

      const insight = await Insight.findOne({
        _id: insightId,
        isDeleted: false,
        status: 'scheduled'
      });

      if (!insight) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Scheduled insight not found'
        });
      }

      insight.status = 'draft';
      insight.scheduledFor = undefined;
      await insight.save();

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.INSIGHT_UPDATED,
        target: {
          resourceType: 'Insight',
          resourceId: insight._id,
          resourceName: insight.title
        },
        changes: {
          after: {
            status: 'draft',
            scheduledFor: null
          }
        },
        metadata: {
          severity: 'low',
          notes: 'Insight schedule cancelled'
        }
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Schedule cancelled successfully',
        data: { insight }
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== PUBLIC ENDPOINTS ====================

  /**
   * Get published insights (Public - accessible by all users)
   * GET /api/insights
   * SUBSCRIPTION-AWARE: Filters insights based on user's subscription tier
   */
  async getPublishedInsights(req, res, next) {
    try {
      const { page, limit } = getPaginationParams(req.query);
      const { type, category, tags, search } = req.query;

      const query = {
        status: 'published',
        isDeleted: false
      };

      if (type) query.type = type;
      if (category) query.category = category;
      if (tags) query.tags = { $in: tags.split(',') };

      const skip = (page - 1) * limit;

      let insights, total;

      if (search) {
        // Full-text search
        const results = await Insight.searchInsights(search);
        total = results.length;
        insights = results.slice(skip, skip + limit);
      } else {
        [insights, total] = await Promise.all([
          Insight.find(query)
            .select('-moderationNotes -moderatedBy -moderatedAt -deletedBy -deletedAt')
            .populate('author', 'name')
            .sort({ publishedAt: -1 })
            .skip(skip)
            .limit(limit),
          Insight.countDocuments(query)
        ]);
      }

      // SUBSCRIPTION FILTERING: Filter insights based on user's subscription tier
      // req.user is set by addSubscriptionContext middleware (optional auth)
      const filteredInsights = await filterInsightsBySubscription(insights, req.user);

      // Recalculate total based on filtered results
      const filteredTotal = filteredInsights.length;

      // Add hasLiked status if user is authenticated and transform IDs
      let insightsWithLikeStatus;
      if (req.user) {
        const Like = require('../models/Like');
        insightsWithLikeStatus = await Promise.all(
          filteredInsights.map(async (insight) => {
            const insightObj = insight.toObject ? insight.toObject() : insight;
            insightObj.hasLiked = await Like.hasLiked(req.user.id, insight._id);
            insightObj.id = insightObj._id.toString();
            return insightObj;
          })
        );
      } else {
        insightsWithLikeStatus = filteredInsights.map(insight => {
          const insightObj = insight.toObject ? insight.toObject() : insight;
          insightObj.id = insightObj._id.toString();
          return insightObj;
        });
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Published insights retrieved successfully',
        data: {
          insights: insightsWithLikeStatus,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(filteredTotal / limit),
            totalItems: filteredTotal,
            itemsPerPage: limit
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get single published insight (Public)
   * GET /api/insights/:insightId
   * SUBSCRIPTION-AWARE: Checks access based on insight type and user subscription
   */
  async getPublishedInsightById(req, res, next) {
    try {
      const { insightId } = req.params;

      const insight = await Insight.findOne({
        _id: insightId,
        status: 'published',
        isDeleted: false
      })
        .select('-moderationNotes -moderatedBy -moderatedAt -deletedBy -deletedAt')
        .populate('author', 'name');

      if (!insight) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Insight not found'
        });
      }

      // SUBSCRIPTION ACCESS CONTROL: Check if user can access this insight
      const hasAccess = await canAccessInsight(insight, req.user);

      if (!hasAccess) {
        // Premium content - user doesn't have access
        // Return preview/excerpt with upgrade prompt
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: 'Premium subscription required to access this content',
          preview: {
            id: insight._id,
            title: insight.title,
            excerpt: insight.excerpt || insight.content.substring(0, 200) + '...',
            type: insight.type,
            category: insight.category,
            tags: insight.tags,
            author: insight.author,
            publishedAt: insight.publishedAt,
            views: insight.views,
            likes: insight.likes,
            coverImage: insight.coverImage
          },
          upgrade: {
            message: 'Upgrade to Premium to unlock this insight and all premium content',
            benefits: [
              'Unlimited access to all premium insights',
              'Advanced market analysis and trading strategies',
              'Exclusive expert commentary',
              'Priority support'
            ]
          }
        });
      }

      // User has access - increment view count and return full content
      insight.incrementViews().catch(err =>
        logger.error('Failed to increment views:', { error: err.message, insightId: insight._id })
      );

      // Add hasLiked status if authenticated
      let hasLiked = false;
      if (req.user) {
        const Like = require('../models/Like');
        hasLiked = await Like.hasLiked(req.user.id, insight._id);
      }

      const insightData = insight.toObject();
      insightData.id = insightData._id.toString();
      insightData.hasLiked = hasLiked;

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Insight retrieved successfully',
        data: {
          insight: insightData,
          hasLiked: hasLiked
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get featured insights (Public)
   * GET /api/insights/featured
   * SUBSCRIPTION-AWARE: Caches separately per subscription tier
   */
  async getFeaturedInsights(req, res, next) {
    try {
      // SECURITY FIX: Validate and cap limit to prevent abuse
      const limit = Math.min(
        Math.max(parseInt(req.query.limit) || 5, 1),
        20  // Maximum 20 featured insights
      );

      // PERFORMANCE: Subscription-aware caching
      // Cache key includes subscription tier to prevent premium content leakage
      const cache = getCache('insights');
      const subscriptionTier = req.subscriptionTier || 'free';
      const cacheKey = LRUCache.generateKey('featured', {
        limit,
        tier: subscriptionTier
      });
      const cached = cache.get(cacheKey);

      if (cached) {
        return res.status(HTTP_STATUS.OK).json(cached);
      }

      // Cache miss - fetch from database
      let insights = await Insight.findFeatured(limit);

      // SUBSCRIPTION FILTERING: Filter featured insights by subscription tier
      insights = await filterInsightsBySubscription(insights, req.user);

      // Add hasLiked status if authenticated and transform IDs
      const Like = req.user ? require('../models/Like') : null;
      const insightsWithStatus = await Promise.all(
        insights.map(async (insight) => {
          const insightObj = insight.toObject ? insight.toObject() : insight;
          if (req.user) {
            insightObj.hasLiked = await Like.hasLiked(req.user.id, insight._id);
          }
          insightObj.id = insightObj._id.toString();
          return insightObj;
        })
      );

      const response = {
        success: true,
        message: 'Featured insights retrieved successfully',
        data: { insights: insightsWithStatus }
      };

      // Cache for 5 minutes (per subscription tier)
      cache.set(cacheKey, response, 300000);

      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Like insight (Authenticated users)
   * POST /api/insights/:insightId/like
   */
  async likeInsight(req, res, next) {
    try {
      const { insightId } = req.params;

      const insight = await Insight.findOne({
        _id: insightId,
        status: 'published',
        isDeleted: false
      });

      if (!insight) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Insight not found'
        });
      }

      const Like = require('../models/Like');
      const { liked, count } = await Like.toggleLike(req.user.id, insightId);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: liked ? 'Insight liked successfully' : 'Insight unliked successfully',
        data: {
          liked,
          likes: insight.likes + count
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new InsightController();
