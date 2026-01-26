/**
 * Banner Model
 * Used for home page carousels (partner ads, announcements)
 */

const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },
        imageUrl: {
            type: String,
            required: true,
            trim: true,
        },
        link: {
            type: String,
            trim: true,
        },
        partner: {
            type: String,
            trim: true,
            maxlength: 100,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        order: {
            type: Number,
            default: 0,
            index: true,
        },
        type: {
            type: String,
            enum: ['free', 'premium', 'both'],
            default: 'both',
            index: true,
        },
        displayDurationDays: {
            type: Number,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Index for fetching active banners sorted by order
bannerSchema.index({ isActive: 1, order: 1 });

const Banner = mongoose.model('Banner', bannerSchema);

module.exports = Banner;
