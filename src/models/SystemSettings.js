const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
    isSubscriptionsPaused: {
        type: Boolean,
        default: false
    },
    pausedAt: {
        type: Date,
        default: null
    },
    isNewSubscriptionsEnabled: {
        type: Boolean,
        default: true
    },
    subscriptionDisabledMessage: {
        type: String,
        default: 'New subscriptions are temporarily unavailable. Please check back later.'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Ensure only one settings document exists
systemSettingsSchema.statics.getSettings = async function () {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({});
    }
    return settings;
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
