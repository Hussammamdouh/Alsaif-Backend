const express = require('express');
const router = express.Router();
const marketDataService = require('../services/marketDataService');
const { authenticateToken } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');
const { HTTP_STATUS } = require('../constants');
const compression = require('compression');

// Enable compression for all market routes to save bandwidth
router.use(compression());

/**
 * @route   GET /api/market/all
 * @desc    Get ALL market data (DFM + ADX) for efficient mobile startup
 * @access  Private
 */
router.get('/all', authenticateToken, (req, res, next) => {
    try {
        const data = marketDataService.getAll();
        res.status(HTTP_STATUS.OK).json({
            success: true,
            count: data.length,
            data: data,
            timestamp: new Date()
        });
    } catch (error) {
        logger.error('[MarketAPI] Error fetching ALL data:', error);
        next(error);
    }
});

/**
 * @route   GET /api/market/:exchange
 * @desc    Get all stocks for a specific exchange (DFM or ADX)
 * @access  Private
 */
router.get('/:exchange', authenticateToken, (req, res, next) => {
    try {
        const { exchange } = req.params;

        if (!['DFM', 'ADX'].includes(exchange.toUpperCase())) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'Invalid exchange. Use DFM or ADX.'
            });
        }

        const data = marketDataService.getByExchange(exchange);

        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: data,
            count: data.length,
            timestamp: new Date()
        });
    } catch (error) {
        logger.error(`[MarketAPI] Error fetching data for ${req.params.exchange}:`, error);
        next(error);
    }
});

/**
 * @route   GET /api/market/:exchange/:symbol
 * @desc    Get details for a specific stock
 * @access  Private
 */
router.get('/:exchange/:symbol', authenticateToken, (req, res, next) => {
    try {
        const { exchange, symbol } = req.params;

        if (!['DFM', 'ADX'].includes(exchange.toUpperCase())) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'Invalid exchange. Use DFM or ADX.'
            });
        }

        const data = marketDataService.getBySymbol(symbol);

        if (!data) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: `Symbol ${symbol} not found.`
            });
        }

        if (data.exchange !== exchange.toUpperCase()) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: `Symbol ${symbol} found but not in ${exchange}. Did you mean ${data.exchange}?`
            });
        }

        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: data,
            timestamp: new Date()
        });
    } catch (error) {
        logger.error(`[MarketAPI] Error fetching symbol ${req.params.symbol}:`, error);
        next(error);
    }
});

module.exports = router;
