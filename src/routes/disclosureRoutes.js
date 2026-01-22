const express = require('express');
const router = express.Router();
const disclosureService = require('../services/disclosureService');
const compression = require('compression');

router.use(compression());

/**
 * @route   GET /api/disclosures
 * @desc    Get corporate disclosures, optionally filtered by exchange
 * @access  Public
 * @query   exchange - Optional: 'DFM' or 'ADX'
 */
router.get('/', async (req, res) => {
    try {
        const { exchange } = req.query;
        const filter = {};

        if (exchange && ['DFM', 'ADX'].includes(exchange.toUpperCase())) {
            filter.exchange = exchange.toUpperCase();
        }

        const disclosures = await disclosureService.getDisclosures(filter);

        res.json({
            success: true,
            count: disclosures.length,
            data: disclosures
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch disclosures',
            error: error.message
        });
    }
});

module.exports = router;
