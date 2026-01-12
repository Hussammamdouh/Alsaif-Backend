/**
 * i18n Controller
 *
 * Handles translation endpoints
 */

const i18nService = require('../services/i18nService');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');

/**
 * Get translations for a language
 * GET /api/i18n/translations/:lang
 */
exports.getTranslations = async (req, res) => {
  try {
    const { lang } = req.params;

    const translations = i18nService.getAllTranslations(lang);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        language: lang,
        translations
      }
    });
  } catch (error) {
    logger.error('[I18nController] Get translations failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve translations',
      error: error.message
    });
  }
};

/**
 * Get supported languages
 * GET /api/i18n/languages
 */
exports.getSupportedLanguages = async (req, res) => {
  try {
    const languages = i18nService.getSupportedLanguages();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: languages
    });
  } catch (error) {
    logger.error('[I18nController] Get languages failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve languages',
      error: error.message
    });
  }
};

/**
 * Translate a key
 * GET /api/i18n/translate
 */
exports.translate = async (req, res) => {
  try {
    const { key, lang = 'en', ...variables } = req.query;

    if (!key) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Translation key is required'
      });
    }

    const translation = i18nService.translate(key, lang, variables);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        key,
        language: lang,
        translation
      }
    });
  } catch (error) {
    logger.error('[I18nController] Translate failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to translate',
      error: error.message
    });
  }
};
