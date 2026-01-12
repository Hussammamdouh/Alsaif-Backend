/**
 * Admin Filter Controller
 * Handles advanced filtering and saved filter presets
 */

const User = require('../models/User');
const Insight = require('../models/Insight');
const Subscription = require('../models/Subscription');
const FilterPreset = require('../models/FilterPreset');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');

/**
 * Build MongoDB query from filter object
 */
function buildQuery(filters, resourceType) {
  const query = {};

  if (!filters) return query;

  // Common filters
  if (filters.search) {
    const searchRegex = new RegExp(filters.search, 'i');
    if (resourceType === 'users') {
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
      ];
    } else if (resourceType === 'insights') {
      query.$or = [
        { title: searchRegex },
        { content: searchRegex },
      ];
    }
  }

  // Date range filters
  if (filters.createdAfter || filters.createdBefore) {
    query.createdAt = {};
    if (filters.createdAfter) query.createdAt.$gte = new Date(filters.createdAfter);
    if (filters.createdBefore) query.createdAt.$lte = new Date(filters.createdBefore);
  }

  // Resource-specific filters
  if (resourceType === 'users') {
    if (filters.role !== undefined) query.role = filters.role;
    if (filters.isActive !== undefined) query.isActive = filters.isActive;
    if (filters.subscriptionStatus !== undefined) query.subscriptionStatus = filters.subscriptionStatus;
    if (filters.subscriptionTier !== undefined) query.subscriptionTier = filters.subscriptionTier;

    if (filters.lastActiveAfter || filters.lastActiveBefore) {
      query.lastActiveAt = {};
      if (filters.lastActiveAfter) query.lastActiveAt.$gte = new Date(filters.lastActiveAfter);
      if (filters.lastActiveBefore) query.lastActiveAt.$lte = new Date(filters.lastActiveBefore);
    }
  } else if (resourceType === 'insights') {
    if (filters.type !== undefined) query.type = filters.type;
    if (filters.status !== undefined) query.status = filters.status;
    if (filters.category !== undefined) query.category = filters.category;
    if (filters.featured !== undefined) query.featured = filters.featured;

    if (filters.minViews !== undefined) query.viewCount = { $gte: filters.minViews };
    if (filters.minLikes !== undefined) query.likeCount = { $gte: filters.minLikes };

    if (filters.publishedAfter || filters.publishedBefore) {
      query.publishedAt = {};
      if (filters.publishedAfter) query.publishedAt.$gte = new Date(filters.publishedAfter);
      if (filters.publishedBefore) query.publishedAt.$lte = new Date(filters.publishedBefore);
    }

    if (filters.tags && filters.tags.length > 0) {
      query.tags = { $in: filters.tags };
    }
  } else if (resourceType === 'subscriptions') {
    if (filters.status !== undefined) query.status = filters.status;
    if (filters.tier !== undefined) query.tier = filters.tier;
    if (filters.autoRenew !== undefined) query.autoRenew = filters.autoRenew;

    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      query.price = {};
      if (filters.minPrice !== undefined) query.price.$gte = filters.minPrice;
      if (filters.maxPrice !== undefined) query.price.$lte = filters.maxPrice;
    }

    if (filters.expiringInDays !== undefined) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + filters.expiringInDays);
      query.endDate = { $lte: futureDate, $gte: new Date() };
      query.status = 'active';
    }
  }

  return query;
}

/**
 * Filter users with advanced criteria
 */
exports.filterUsers = async (req, res, next) => {
  try {
    const { filters, sort = { createdAt: -1 }, page = 1, limit = 20 } = req.body;

    const query = buildQuery(filters, 'users');
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -refreshTokens')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasMore: skip + users.length < total,
        },
      },
    });
  } catch (error) {
    logger.error('[AdminFilter] Filter users failed:', error);
    next(error);
  }
};

/**
 * Filter insights with advanced criteria
 */
exports.filterInsights = async (req, res, next) => {
  try {
    const { filters, sort = { createdAt: -1 }, page = 1, limit = 20 } = req.body;

    const query = buildQuery(filters, 'insights');
    const skip = (page - 1) * limit;

    const [insights, total] = await Promise.all([
      Insight.find(query)
        .populate('author', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Insight.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        insights,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasMore: skip + insights.length < total,
        },
      },
    });
  } catch (error) {
    logger.error('[AdminFilter] Filter insights failed:', error);
    next(error);
  }
};

/**
 * Filter subscriptions with advanced criteria
 */
exports.filterSubscriptions = async (req, res, next) => {
  try {
    const { filters, sort = { createdAt: -1 }, page = 1, limit = 20 } = req.body;

    const query = buildQuery(filters, 'subscriptions');
    const skip = (page - 1) * limit;

    const [subscriptions, total] = await Promise.all([
      Subscription.find(query)
        .populate('user', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Subscription.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        subscriptions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasMore: skip + subscriptions.length < total,
        },
      },
    });
  } catch (error) {
    logger.error('[AdminFilter] Filter subscriptions failed:', error);
    next(error);
  }
};

/**
 * SAVED FILTER PRESETS
 */

/**
 * Create a saved filter preset
 */
exports.createPreset = async (req, res, next) => {
  try {
    const { name, description, resourceType, filters, isPublic = false } = req.body;

    // Check for duplicate name for this admin
    const existing = await FilterPreset.findOne({
      name,
      createdBy: req.user.id,
      resourceType,
    });

    if (existing) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        message: 'A preset with this name already exists',
      });
    }

    const preset = await FilterPreset.create({
      name,
      description,
      resourceType,
      filters,
      createdBy: req.user.id,
      isPublic,
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Filter preset created successfully',
      data: preset,
    });
  } catch (error) {
    logger.error('[AdminFilter] Create preset failed:', error);
    next(error);
  }
};

/**
 * Get all filter presets
 */
exports.getPresets = async (req, res, next) => {
  try {
    const { resourceType } = req.query;

    const query = {
      $or: [
        { createdBy: req.user.id },
        { isPublic: true },
      ],
    };

    if (resourceType) {
      query.resourceType = resourceType;
    }

    const presets = await FilterPreset.find(query)
      .populate('createdBy', 'name email')
      .sort({ usageCount: -1, createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: presets,
    });
  } catch (error) {
    logger.error('[AdminFilter] Get presets failed:', error);
    next(error);
  }
};

/**
 * Get a specific preset
 */
exports.getPreset = async (req, res, next) => {
  try {
    const { presetId } = req.params;

    const preset = await FilterPreset.findOne({
      _id: presetId,
      $or: [
        { createdBy: req.user.id },
        { isPublic: true },
      ],
    }).populate('createdBy', 'name email');

    if (!preset) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Preset not found',
      });
    }

    res.json({
      success: true,
      data: preset,
    });
  } catch (error) {
    logger.error('[AdminFilter] Get preset failed:', error);
    next(error);
  }
};

/**
 * Update a preset
 */
exports.updatePreset = async (req, res, next) => {
  try {
    const { presetId } = req.params;
    const updates = req.body;

    const preset = await FilterPreset.findOne({
      _id: presetId,
      createdBy: req.user.id, // Only creator can update
    });

    if (!preset) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Preset not found or you do not have permission to update it',
      });
    }

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        preset[key] = updates[key];
      }
    });

    await preset.save();

    res.json({
      success: true,
      message: 'Preset updated successfully',
      data: preset,
    });
  } catch (error) {
    logger.error('[AdminFilter] Update preset failed:', error);
    next(error);
  }
};

/**
 * Delete a preset
 */
exports.deletePreset = async (req, res, next) => {
  try {
    const { presetId } = req.params;

    const preset = await FilterPreset.findOneAndDelete({
      _id: presetId,
      createdBy: req.user.id, // Only creator can delete
    });

    if (!preset) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Preset not found or you do not have permission to delete it',
      });
    }

    res.json({
      success: true,
      message: 'Preset deleted successfully',
    });
  } catch (error) {
    logger.error('[AdminFilter] Delete preset failed:', error);
    next(error);
  }
};

/**
 * Apply a saved preset and get filtered results
 */
exports.applyPreset = async (req, res, next) => {
  try {
    const { presetId } = req.params;
    const { page = 1, limit = 20 } = req.body;

    const preset = await FilterPreset.findOne({
      _id: presetId,
      $or: [
        { createdBy: req.user.id },
        { isPublic: true },
      ],
    });

    if (!preset) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Preset not found',
      });
    }

    // Increment usage count
    await preset.incrementUsage();

    // Apply the filters based on resource type
    const query = buildQuery(preset.filters, preset.resourceType);
    const skip = (page - 1) * limit;

    let Model;
    let populateField = null;

    switch (preset.resourceType) {
      case 'users':
        Model = User;
        break;
      case 'insights':
        Model = Insight;
        populateField = 'author';
        break;
      case 'subscriptions':
        Model = Subscription;
        populateField = 'user';
        break;
    }

    let queryBuilder = Model.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);

    if (populateField) {
      queryBuilder = queryBuilder.populate(populateField, 'name email');
    }

    if (preset.resourceType === 'users') {
      queryBuilder = queryBuilder.select('-password -refreshTokens');
    }

    const [results, total] = await Promise.all([
      queryBuilder.lean(),
      Model.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        results,
        preset: {
          id: preset._id,
          name: preset.name,
          description: preset.description,
        },
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasMore: skip + results.length < total,
        },
      },
    });
  } catch (error) {
    logger.error('[AdminFilter] Apply preset failed:', error);
    next(error);
  }
};
