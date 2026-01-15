/**
 * Admin Discount Code Controller
 * Manages promotional codes and discounts
 */

const DiscountCode = require('../models/DiscountCode');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');
const AuditLogger = require('../utils/auditLogger');
const { emitPromoCodeCreated } = require('../events/enhancedNotificationEvents');

/**
 * Get all discount codes
 */
exports.getAllCodes = async (req, res, next) => {
  try {
    const { isActive, type, page = 1, limit = 20 } = req.query;

    const query = {};
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (type) query.type = type;

    const skip = (page - 1) * limit;

    const [codes, total] = await Promise.all([
      DiscountCode.find(query)
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      DiscountCode.countDocuments(query),
    ]);

    // Add computed fields
    const codesWithStatus = codes.map((code) => {
      const now = new Date();
      const isExpired = code.validUntil < now;
      const isNotYetValid = code.validFrom > now;
      const isMaxedOut = code.maxUses !== null && code.usedCount >= code.maxUses;

      return {
        ...code,
        status: isMaxedOut ? 'maxed_out' : isExpired ? 'expired' : isNotYetValid ? 'scheduled' : 'active',
      };
    });

    res.json({
      success: true,
      data: {
        codes: codesWithStatus,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
          hasMore: skip + codes.length < total,
        },
      },
    });
  } catch (error) {
    logger.error('[AdminDiscountCode] Get all codes failed:', error);
    next(error);
  }
};

/**
 * Get a specific discount code
 */
exports.getCode = async (req, res, next) => {
  try {
    const { codeId } = req.params;

    const code = await DiscountCode.findById(codeId)
      .populate('createdBy', 'name email')
      .populate('usageHistory.user', 'name email')
      .lean();

    if (!code) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Discount code not found',
      });
    }

    res.json({
      success: true,
      data: code,
    });
  } catch (error) {
    logger.error('[AdminDiscountCode] Get code failed:', error);
    next(error);
  }
};

/**
 * Create a new discount code
 */
exports.createCode = async (req, res, next) => {
  try {
    const {
      code,
      description,
      type,
      value,
      currency = 'USD',
      applicableTiers = [],
      applicableBillingCycles = [],
      validFrom,
      validUntil,
      maxUses = null,
      maxUsesPerUser = 1,
      minimumPurchaseAmount = 0,
      firstTimeUsersOnly = false,
      stackable = false,
    } = req.body;

    // Check for duplicate code
    const existing = await DiscountCode.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        message: 'A discount code with this code already exists',
      });
    }

    const discountCode = await DiscountCode.create({
      code: code.toUpperCase(),
      description,
      type,
      value,
      currency,
      applicableTiers,
      applicableBillingCycles,
      validFrom: new Date(validFrom),
      validUntil: new Date(validUntil),
      maxUses,
      maxUsesPerUser,
      minimumPurchaseAmount,
      firstTimeUsersOnly,
      stackable,
      createdBy: req.user.id,
    });

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'DISCOUNT_CODE_CREATED',
      target: { resourceType: 'DiscountCode', resourceId: discountCode._id, resourceName: discountCode.code },
      metadata: { type, value },
    });

    // NOTIFICATION: Notify free users
    emitPromoCodeCreated({
      code: discountCode.code,
      discount: type === 'percentage' ? `${value}%` : `${value} ${currency}`,
      expiry: discountCode.validUntil
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Discount code created successfully',
      data: discountCode,
    });
  } catch (error) {
    logger.error('[AdminDiscountCode] Create code failed:', error);
    next(error);
  }
};

/**
 * Update a discount code
 */
exports.updateCode = async (req, res, next) => {
  try {
    const { codeId } = req.params;
    const updates = req.body;

    const code = await DiscountCode.findById(codeId);
    if (!code) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Discount code not found',
      });
    }

    // Don't allow changing code string or type after creation
    delete updates.code;
    delete updates.type;
    delete updates.usedCount;
    delete updates.usageHistory;

    Object.keys(updates).forEach((key) => {
      if (updates[key] !== undefined) {
        code[key] = updates[key];
      }
    });

    await code.save();

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'DISCOUNT_CODE_UPDATED',
      target: { resourceType: 'DiscountCode', resourceId: code._id, resourceName: code.code },
      metadata: { updates: Object.keys(updates) },
    });

    res.json({
      success: true,
      message: 'Discount code updated successfully',
      data: code,
    });
  } catch (error) {
    logger.error('[AdminDiscountCode] Update code failed:', error);
    next(error);
  }
};

/**
 * Delete a discount code
 */
exports.deleteCode = async (req, res, next) => {
  try {
    const { codeId } = req.params;

    const code = await DiscountCode.findById(codeId);
    if (!code) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Discount code not found',
      });
    }

    // Check if code has been used
    if (code.usedCount > 0) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        message: `Cannot delete code that has been used ${code.usedCount} times. Deactivate instead.`,
      });
    }

    await code.deleteOne();

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'DISCOUNT_CODE_DELETED',
      target: { resourceType: 'DiscountCode', resourceId: code._id, resourceName: code.code },
    });

    res.json({
      success: true,
      message: 'Discount code deleted successfully',
    });
  } catch (error) {
    logger.error('[AdminDiscountCode] Delete code failed:', error);
    next(error);
  }
};

/**
 * Activate a discount code
 */
exports.activateCode = async (req, res, next) => {
  try {
    const { codeId } = req.params;

    const code = await DiscountCode.findById(codeId);
    if (!code) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Discount code not found',
      });
    }

    code.isActive = true;
    await code.save();

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'DISCOUNT_CODE_ACTIVATED',
      target: { resourceType: 'DiscountCode', resourceId: code._id, resourceName: code.code },
    });

    res.json({
      success: true,
      message: 'Discount code activated successfully',
      data: code,
    });
  } catch (error) {
    logger.error('[AdminDiscountCode] Activate code failed:', error);
    next(error);
  }
};

/**
 * Deactivate a discount code
 */
exports.deactivateCode = async (req, res, next) => {
  try {
    const { codeId } = req.params;

    const code = await DiscountCode.findById(codeId);
    if (!code) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Discount code not found',
      });
    }

    code.isActive = false;
    await code.save();

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'DISCOUNT_CODE_DEACTIVATED',
      target: { resourceType: 'DiscountCode', resourceId: code._id, resourceName: code.code },
    });

    res.json({
      success: true,
      message: 'Discount code deactivated successfully',
      data: code,
    });
  } catch (error) {
    logger.error('[AdminDiscountCode] Deactivate code failed:', error);
    next(error);
  }
};

/**
 * Validate a discount code
 */
exports.validateCode = async (req, res, next) => {
  try {
    const { code } = req.params;
    const { userId, tier, billingCycle, purchaseAmount } = req.query;

    const result = await DiscountCode.validateCode(code, userId);

    if (!result.valid) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: result.reason,
      });
    }

    const discountCode = result.code;

    // Check tier applicability
    if (tier && discountCode.applicableTiers.length > 0 && !discountCode.applicableTiers.includes(tier)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Code is not applicable to this subscription tier',
      });
    }

    // Check billing cycle applicability
    if (
      billingCycle &&
      discountCode.applicableBillingCycles.length > 0 &&
      !discountCode.applicableBillingCycles.includes(billingCycle)
    ) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Code is not applicable to this billing cycle',
      });
    }

    // Check minimum purchase amount
    if (purchaseAmount && parseFloat(purchaseAmount) < discountCode.minimumPurchaseAmount) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: `Minimum purchase amount of ${discountCode.minimumPurchaseAmount} ${discountCode.currency} required`,
      });
    }

    res.json({
      success: true,
      message: 'Code is valid',
      data: {
        code: discountCode.code,
        type: discountCode.type,
        value: discountCode.value,
        description: discountCode.description,
      },
    });
  } catch (error) {
    logger.error('[AdminDiscountCode] Validate code failed:', error);
    next(error);
  }
};

/**
 * Get usage statistics for a discount code
 */
exports.getCodeUsageStats = async (req, res, next) => {
  try {
    const { codeId } = req.params;

    const code = await DiscountCode.findById(codeId)
      .populate('usageHistory.user', 'name email')
      .lean();

    if (!code) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Discount code not found',
      });
    }

    // Calculate statistics
    const totalDiscountGiven = code.usageHistory.reduce((sum, usage) => sum + usage.discountAmount, 0);

    const uniqueUsers = new Set(code.usageHistory.map((usage) => usage.user._id.toString())).size;

    const usageByDate = code.usageHistory.reduce((acc, usage) => {
      const date = usage.usedAt.toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        code: code.code,
        totalUses: code.usedCount,
        uniqueUsers,
        totalDiscountGiven,
        usageByDate,
        recentUsage: code.usageHistory.slice(-10).reverse(),
      },
    });
  } catch (error) {
    logger.error('[AdminDiscountCode] Get code usage stats failed:', error);
    next(error);
  }
};

/**
 * Get discount code analytics
 */
exports.getCodeAnalytics = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const matchQuery = {};
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const [totalCodes, activeCodes, totalUsage, typeBreakdown] = await Promise.all([
      DiscountCode.countDocuments(matchQuery),
      DiscountCode.countDocuments({ ...matchQuery, isActive: true }),
      DiscountCode.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalUses: { $sum: '$usedCount' },
            totalDiscountGiven: { $sum: { $sum: '$usageHistory.discountAmount' } },
          },
        },
      ]),
      DiscountCode.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalUses: { $sum: '$usedCount' },
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        totalCodes,
        activeCodes,
        totalUsage: totalUsage[0] || { totalUses: 0, totalDiscountGiven: 0 },
        byType: typeBreakdown,
      },
    });
  } catch (error) {
    logger.error('[AdminDiscountCode] Get code analytics failed:', error);
    next(error);
  }
};
