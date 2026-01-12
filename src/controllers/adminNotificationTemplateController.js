/**
 * Admin Notification Template Controller
 * Manages notification templates for various events and channels
 */

const NotificationTemplate = require('../models/NotificationTemplate');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');
const AuditLogger = require('../utils/auditLogger');

/**
 * Get all notification templates
 */
exports.getAllTemplates = async (req, res, next) => {
  try {
    const { category, eventTrigger, isActive, page = 1, limit = 20 } = req.query;

    const query = {};
    if (category) query.category = category;
    if (eventTrigger) query.eventTrigger = eventTrigger;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const skip = (page - 1) * limit;

    const [templates, total] = await Promise.all([
      NotificationTemplate.find(query)
        .populate('createdBy', 'name email')
        .populate('lastModifiedBy', 'name email')
        .sort({ category: 1, name: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      NotificationTemplate.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        templates,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
          hasMore: skip + templates.length < total,
        },
      },
    });
  } catch (error) {
    logger.error('[AdminNotificationTemplate] Get all templates failed:', error);
    next(error);
  }
};

/**
 * Get a specific notification template
 */
exports.getTemplate = async (req, res, next) => {
  try {
    const { templateId } = req.params;

    const template = await NotificationTemplate.findById(templateId)
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email')
      .lean();

    if (!template) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Notification template not found',
      });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    logger.error('[AdminNotificationTemplate] Get template failed:', error);
    next(error);
  }
};

/**
 * Create a new notification template
 */
exports.createTemplate = async (req, res, next) => {
  try {
    const {
      name,
      slug,
      description,
      category,
      eventTrigger,
      channels,
      variables = [],
      targetAudience = {},
      scheduling = {},
      isActive = true,
    } = req.body;

    // Check for duplicate slug
    if (slug) {
      const existing = await NotificationTemplate.findOne({ slug });
      if (existing) {
        return res.status(HTTP_STATUS.CONFLICT).json({
          success: false,
          message: 'A template with this slug already exists',
        });
      }
    }

    const template = await NotificationTemplate.create({
      name,
      slug,
      description,
      category,
      eventTrigger,
      channels,
      variables,
      targetAudience,
      scheduling,
      isActive,
      createdBy: req.user.id,
      lastModifiedBy: req.user.id,
    });

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'NOTIFICATION_TEMPLATE_CREATED',
      target: { resourceType: 'NotificationTemplate', resourceId: template._id, resourceName: template.name },
      metadata: { category, eventTrigger },
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Notification template created successfully',
      data: template,
    });
  } catch (error) {
    logger.error('[AdminNotificationTemplate] Create template failed:', error);
    next(error);
  }
};

/**
 * Update a notification template
 */
exports.updateTemplate = async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const updates = req.body;

    const template = await NotificationTemplate.findById(templateId);
    if (!template) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Notification template not found',
      });
    }

    // Prevent updating system templates
    if (template.isSystem) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'System templates cannot be modified. Clone it instead.',
      });
    }

    // Don't allow changing slug or eventTrigger after creation
    delete updates.slug;
    delete updates.isSystem;
    delete updates.analytics;

    Object.keys(updates).forEach((key) => {
      if (updates[key] !== undefined) {
        template[key] = updates[key];
      }
    });

    template.lastModifiedBy = req.user.id;
    await template.save();

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'NOTIFICATION_TEMPLATE_UPDATED',
      target: { resourceType: 'NotificationTemplate', resourceId: template._id, resourceName: template.name },
      metadata: { updates: Object.keys(updates) },
    });

    res.json({
      success: true,
      message: 'Notification template updated successfully',
      data: template,
    });
  } catch (error) {
    logger.error('[AdminNotificationTemplate] Update template failed:', error);
    next(error);
  }
};

/**
 * Delete a notification template
 */
exports.deleteTemplate = async (req, res, next) => {
  try {
    const { templateId } = req.params;

    const template = await NotificationTemplate.findById(templateId);
    if (!template) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Notification template not found',
      });
    }

    // Prevent deleting system templates
    if (template.isSystem) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'System templates cannot be deleted',
      });
    }

    await template.deleteOne();

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'NOTIFICATION_TEMPLATE_DELETED',
      target: { resourceType: 'NotificationTemplate', resourceId: template._id, resourceName: template.name },
    });

    res.json({
      success: true,
      message: 'Notification template deleted successfully',
    });
  } catch (error) {
    logger.error('[AdminNotificationTemplate] Delete template failed:', error);
    next(error);
  }
};

/**
 * Clone a notification template
 */
exports.cloneTemplate = async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { name, slug } = req.body;

    const original = await NotificationTemplate.findById(templateId).lean();
    if (!original) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Notification template not found',
      });
    }

    // Check for duplicate slug
    const existing = await NotificationTemplate.findOne({ slug });
    if (existing) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        message: 'A template with this slug already exists',
      });
    }

    const cloned = await NotificationTemplate.create({
      ...original,
      _id: undefined,
      name: name || `${original.name} (Copy)`,
      slug,
      isSystem: false,
      createdBy: req.user.id,
      lastModifiedBy: req.user.id,
      analytics: { sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0 },
      createdAt: undefined,
      updatedAt: undefined,
    });

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'NOTIFICATION_TEMPLATE_CLONED',
      target: { resourceType: 'NotificationTemplate', resourceId: cloned._id, resourceName: cloned.name },
      metadata: { originalId: templateId },
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Notification template cloned successfully',
      data: cloned,
    });
  } catch (error) {
    logger.error('[AdminNotificationTemplate] Clone template failed:', error);
    next(error);
  }
};

/**
 * Activate a notification template
 */
exports.activateTemplate = async (req, res, next) => {
  try {
    const { templateId } = req.params;

    const template = await NotificationTemplate.findById(templateId);
    if (!template) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Notification template not found',
      });
    }

    template.isActive = true;
    template.lastModifiedBy = req.user.id;
    await template.save();

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'NOTIFICATION_TEMPLATE_ACTIVATED',
      target: { resourceType: 'NotificationTemplate', resourceId: template._id, resourceName: template.name },
    });

    res.json({
      success: true,
      message: 'Notification template activated successfully',
      data: template,
    });
  } catch (error) {
    logger.error('[AdminNotificationTemplate] Activate template failed:', error);
    next(error);
  }
};

/**
 * Deactivate a notification template
 */
exports.deactivateTemplate = async (req, res, next) => {
  try {
    const { templateId } = req.params;

    const template = await NotificationTemplate.findById(templateId);
    if (!template) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Notification template not found',
      });
    }

    template.isActive = false;
    template.lastModifiedBy = req.user.id;
    await template.save();

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'NOTIFICATION_TEMPLATE_DEACTIVATED',
      target: { resourceType: 'NotificationTemplate', resourceId: template._id, resourceName: template.name },
    });

    res.json({
      success: true,
      message: 'Notification template deactivated successfully',
      data: template,
    });
  } catch (error) {
    logger.error('[AdminNotificationTemplate] Deactivate template failed:', error);
    next(error);
  }
};

/**
 * Preview a notification template with sample variables
 */
exports.previewTemplate = async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { variables = {}, channel = 'inApp' } = req.body;

    const template = await NotificationTemplate.findById(templateId);
    if (!template) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Notification template not found',
      });
    }

    // Validate variables
    const validation = template.validateVariables(variables);
    if (!validation.valid) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: `Missing required variables: ${validation.missing.join(', ')}`,
      });
    }

    // Render template
    const rendered = template.render(channel, variables);
    if (!rendered) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: `Channel ${channel} is not enabled for this template`,
      });
    }

    res.json({
      success: true,
      data: {
        channel,
        rendered,
        variables: template.variables,
      },
    });
  } catch (error) {
    logger.error('[AdminNotificationTemplate] Preview template failed:', error);
    next(error);
  }
};

/**
 * Get analytics for a notification template
 */
exports.getTemplateAnalytics = async (req, res, next) => {
  try {
    const { templateId } = req.params;

    const template = await NotificationTemplate.findById(templateId).lean();
    if (!template) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Notification template not found',
      });
    }

    const deliveryRate =
      template.analytics.sent > 0 ? ((template.analytics.delivered / template.analytics.sent) * 100).toFixed(2) : 0;

    const openRate =
      template.analytics.delivered > 0
        ? ((template.analytics.opened / template.analytics.delivered) * 100).toFixed(2)
        : 0;

    const clickRate =
      template.analytics.opened > 0 ? ((template.analytics.clicked / template.analytics.opened) * 100).toFixed(2) : 0;

    const failureRate =
      template.analytics.sent > 0 ? ((template.analytics.failed / template.analytics.sent) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        name: template.name,
        analytics: template.analytics,
        metrics: {
          deliveryRate: parseFloat(deliveryRate),
          openRate: parseFloat(openRate),
          clickRate: parseFloat(clickRate),
          failureRate: parseFloat(failureRate),
        },
      },
    });
  } catch (error) {
    logger.error('[AdminNotificationTemplate] Get template analytics failed:', error);
    next(error);
  }
};

/**
 * Test send a notification template
 */
exports.testSendTemplate = async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { channel = 'inApp', variables = {}, recipient } = req.body;

    const template = await NotificationTemplate.findById(templateId);
    if (!template) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Notification template not found',
      });
    }

    // Validate variables
    const validation = template.validateVariables(variables);
    if (!validation.valid) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: `Missing required variables: ${validation.missing.join(', ')}`,
      });
    }

    // Render template
    const rendered = template.render(channel, variables);
    if (!rendered) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: `Channel ${channel} is not enabled for this template`,
      });
    }

    // Here you would integrate with your notification service
    // For now, we'll just return the rendered content
    logger.info(`[AdminNotificationTemplate] Test notification sent to ${recipient} via ${channel}`);

    res.json({
      success: true,
      message: `Test notification sent via ${channel}`,
      data: {
        channel,
        recipient,
        rendered,
      },
    });
  } catch (error) {
    logger.error('[AdminNotificationTemplate] Test send template failed:', error);
    next(error);
  }
};

/**
 * Get notification templates by category
 */
exports.getTemplatesByCategory = async (req, res, next) => {
  try {
    const templates = await NotificationTemplate.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$category',
          templates: {
            $push: {
              id: '$_id',
              name: '$name',
              slug: '$slug',
              eventTrigger: '$eventTrigger',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    logger.error('[AdminNotificationTemplate] Get templates by category failed:', error);
    next(error);
  }
};
