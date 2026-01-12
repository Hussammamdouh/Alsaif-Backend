/**
 * i18n Routes
 *
 * Endpoints for internationalization
 */

const express = require('express');
const router = express.Router();
const i18nController = require('../controllers/i18nController');

/**
 * All i18n routes are public
 */

/**
 * @route   GET /api/i18n/languages
 * @desc    Get supported languages
 * @access  Public
 */
router.get('/languages', i18nController.getSupportedLanguages);

/**
 * @route   GET /api/i18n/translations/:lang
 * @desc    Get all translations for a language
 * @access  Public
 */
router.get('/translations/:lang', i18nController.getTranslations);

/**
 * @route   GET /api/i18n/translate
 * @desc    Translate a specific key
 * @access  Public
 */
router.get('/translate', i18nController.translate);

module.exports = router;
