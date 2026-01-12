/**
 * Notification Template Model
 * Manages reusable notification templates for various events
 */

const mongoose = require('mongoose');

const notificationTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    category: {
      type: String,
      required: true,
      enum: ['user', 'subscription', 'content', 'payment', 'system', 'marketing'],
      index: true,
    },
    eventTrigger: {
      type: String,
      required: true,
      enum: [
        'user_signup',
        'user_activated',
        'user_suspended',
        'subscription_created',
        'subscription_renewed',
        'subscription_expiring',
        'subscription_expired',
        'subscription_cancelled',
        'payment_successful',
        'payment_failed',
        'payment_refunded',
        'insight_published',
        'insight_approved',
        'insight_rejected',
        'custom',
      ],
      index: true,
    },
    channels: {
      email: {
        enabled: { type: Boolean, default: false },
        subject: { type: String, trim: true, maxlength: 200 },
        body: { type: String, trim: true },
        htmlBody: { type: String },
      },
      push: {
        enabled: { type: Boolean, default: false },
        title: { type: String, trim: true, maxlength: 100 },
        body: { type: String, trim: true, maxlength: 500 },
      },
      sms: {
        enabled: { type: Boolean, default: false },
        body: { type: String, trim: true, maxlength: 160 },
      },
      inApp: {
        enabled: { type: Boolean, default: true },
        title: { type: String, trim: true, maxlength: 100 },
        body: { type: String, trim: true, maxlength: 500 },
        priority: {
          type: String,
          enum: ['low', 'medium', 'high', 'urgent'],
          default: 'medium',
        },
      },
    },
    variables: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
        },
        description: {
          type: String,
          trim: true,
        },
        example: {
          type: String,
          trim: true,
        },
        required: {
          type: Boolean,
          default: false,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    targetAudience: {
      roles: {
        type: [String],
        enum: ['user', 'analyst', 'admin', 'superadmin'],
        default: [],
      },
      tiers: {
        type: [String],
        enum: ['basic', 'starter', 'premium', 'pro', 'enterprise'],
        default: [],
      },
    },
    scheduling: {
      delay: {
        type: Number,
        min: 0,
        default: 0,
      },
      delayUnit: {
        type: String,
        enum: ['minutes', 'hours', 'days'],
        default: 'minutes',
      },
    },
    analytics: {
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Index for active templates by category and event
notificationTemplateSchema.index({ isActive: 1, category: 1, eventTrigger: 1 });

// Virtual for engagement rate
notificationTemplateSchema.virtual('engagementRate').get(function () {
  if (this.analytics.sent === 0) return 0;
  return ((this.analytics.opened + this.analytics.clicked) / this.analytics.sent) * 100;
});

// Virtual for delivery rate
notificationTemplateSchema.virtual('deliveryRate').get(function () {
  if (this.analytics.sent === 0) return 0;
  return (this.analytics.delivered / this.analytics.sent) * 100;
});

// Method to render template with variables
notificationTemplateSchema.methods.render = function (channel, variables = {}) {
  if (!this.channels[channel] || !this.channels[channel].enabled) {
    return null;
  }

  const channelConfig = this.channels[channel];
  const rendered = {};

  // Replace variables in all text fields
  Object.keys(channelConfig).forEach((key) => {
    if (typeof channelConfig[key] === 'string') {
      let text = channelConfig[key];

      // Replace {{variable}} placeholders
      Object.keys(variables).forEach((varName) => {
        const regex = new RegExp(`{{\\s*${varName}\\s*}}`, 'g');
        text = text.replace(regex, variables[varName]);
      });

      rendered[key] = text;
    } else {
      rendered[key] = channelConfig[key];
    }
  });

  return rendered;
};

// Method to validate required variables
notificationTemplateSchema.methods.validateVariables = function (variables) {
  const requiredVars = this.variables.filter((v) => v.required);
  const missing = [];

  requiredVars.forEach((v) => {
    if (!variables[v.name]) {
      missing.push(v.name);
    }
  });

  if (missing.length > 0) {
    return { valid: false, missing };
  }

  return { valid: true };
};

// Method to increment analytics counter
notificationTemplateSchema.methods.incrementAnalytics = async function (metric) {
  if (this.analytics[metric] !== undefined) {
    this.analytics[metric] += 1;
    await this.save();
  }
};

// Static method to find template by event trigger
notificationTemplateSchema.statics.findByEvent = function (eventTrigger, isActive = true) {
  return this.findOne({ eventTrigger, isActive });
};

// Static method to get active templates by category
notificationTemplateSchema.statics.getByCategory = function (category) {
  return this.find({ category, isActive: true }).sort({ name: 1 });
};

// Pre-save hook to generate slug if not provided
notificationTemplateSchema.pre('save', function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  next();
});

// Pre-save hook to validate channels
notificationTemplateSchema.pre('save', function (next) {
  // Ensure at least one channel is enabled
  const hasEnabledChannel = Object.values(this.channels).some((channel) => channel.enabled);

  if (!hasEnabledChannel) {
    return next(new Error('At least one notification channel must be enabled'));
  }

  next();
});

const NotificationTemplate = mongoose.model('NotificationTemplate', notificationTemplateSchema);

module.exports = NotificationTemplate;
