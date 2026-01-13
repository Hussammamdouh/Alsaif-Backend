const mongoose = require('mongoose');

const marketDataSchema = new mongoose.Schema({
    symbol: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true,
        uppercase: true
    },
    exchange: {
        type: String, // 'DFM' or 'ADX'
        required: true,
        index: true,
        enum: ['DFM', 'ADX']
    },
    price: { type: Number, default: 0 },
    change: { type: Number, default: 0 },
    changePercent: { type: Number, default: 0 },
    high: { type: Number, default: 0 },
    low: { type: Number, default: 0 },
    open: { type: Number, default: 0 },
    prevClose: { type: Number, default: 0 },
    volume: { type: Number, default: 0 },
    currency: { type: String },
    shortName: { type: String },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for getting all symbols by exchange
marketDataSchema.index({ exchange: 1, symbol: 1 });

const MarketData = mongoose.model('MarketData', marketDataSchema);

module.exports = MarketData;
