const mongoose = require('mongoose');

const DisclosureSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    titleAr: {
        type: String,
        trim: true,
    },
    titleEn: {
        type: String,
        trim: true,
    },
    // Support multiple PDF URLs per disclosure
    pdfUrls: [{
        type: String,
        trim: true,
    }],
    // Keep single url for backward compatibility (will be first PDF)
    url: {
        type: String,
        required: true,
        trim: true,
    },
    date: {
        type: Date,
        required: true,
        index: true,
    },
    exchange: {
        type: String,
        required: true,
        enum: ['DFM', 'ADX'],
        index: true,
    },
    symbol: {
        type: String,
        trim: true,
        default: null,
    },
}, {
    timestamps: true,
});

// Composite index on title + exchange + date to prevent duplicates
// (same disclosure can have different PDFs, so we use title-based unique)
DisclosureSchema.index({ title: 1, exchange: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Disclosure', DisclosureSchema);
