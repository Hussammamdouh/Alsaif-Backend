/**
 * i18n Middleware
 *
 * Detects and sets language for requests
 */

const i18nService = require('../services/i18nService');

/**
 * Language detection middleware
 */
const detectLanguage = (req, res, next) => {
  const language = i18nService.detectLanguage(req);
  req.language = language;
  req.t = (key, variables) => i18nService.translate(key, language, variables);
  next();
};

module.exports = {
  detectLanguage
};
