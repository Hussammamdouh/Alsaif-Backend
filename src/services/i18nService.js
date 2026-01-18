/**
 * i18n Service
 *
 * Multi-language support for insights and UI
 */

const logger = require('../utils/logger');

class I18nService {
  constructor() {
    this.supportedLanguages = ['en', 'ar'];
    this.defaultLanguage = 'en';

    // Translation dictionaries
    this.translations = {
      en: {
        common: {
          welcome: 'Welcome',
          login: 'Login',
          logout: 'Logout',
          news: 'News',
          search: 'Search',
          categories: 'Categories',
          insights: 'Insights',
          readMore: 'Read More',
          share: 'Share',
          like: 'Like',
          comment: 'Comment',
          save: 'Save',
          follow: 'Follow'
        },
        categories: {
          market_analysis: 'Market Analysis',
          stock_news: 'Stock News',
          technical_analysis: 'Technical Analysis',
          investment_tips: 'Investment Tips',
          earnings: 'Earnings Reports',
          ipo: 'IPO News'
        },
        notifications: {
          newInsight: 'New insight published',
          newComment: 'New comment on your insight',
          newFollower: 'has started following you',
          newLike: 'liked your insight'
        },
        errors: {
          notFound: 'Not found',
          unauthorized: 'Unauthorized',
          serverError: 'Server error',
          invalidInput: 'Invalid input'
        }
      },
      ar: {
        common: {
          welcome: 'مرحباً',
          login: 'تسجيل الدخول',
          logout: 'تسجيل الخروج',
          news: 'الأخبار',
          search: 'بحث',
          categories: 'التصنيفات',
          insights: 'التحليلات',
          readMore: 'اقرأ المزيد',
          share: 'مشاركة',
          like: 'إعجاب',
          comment: 'تعليق',
          save: 'حفظ',
          follow: 'متابعة'
        },
        categories: {
          market_analysis: 'تحليل السوق',
          stock_news: 'أخبار الأسهم',
          technical_analysis: 'التحليل الفني',
          investment_tips: 'نصائح الاستثمار',
          earnings: 'تقارير الأرباح',
          ipo: 'أخبار الطرح الأولي'
        },
        notifications: {
          newInsight: 'تم نشر تحليل جديد',
          newComment: 'تعليق جديد على تحليلك',
          newFollower: 'بدأ بمتابعتك',
          newLike: 'أعجب بتحليلك'
        },
        errors: {
          notFound: 'غير موجود',
          unauthorized: 'غير مصرح',
          serverError: 'خطأ في الخادم',
          invalidInput: 'مدخلات غير صالحة'
        }
      }
    };
  }

  /**
   * Get translation
   */
  translate(key, language = 'en', variables = {}) {
    const lang = this.supportedLanguages.includes(language) ? language : this.defaultLanguage;

    // Navigate through nested keys (e.g., 'common.welcome')
    const keys = key.split('.');
    let translation = this.translations[lang];

    for (const k of keys) {
      translation = translation?.[k];
      if (!translation) break;
    }

    // If translation not found, try default language
    if (!translation && lang !== this.defaultLanguage) {
      translation = this.translations[this.defaultLanguage];
      for (const k of keys) {
        translation = translation?.[k];
        if (!translation) break;
      }
    }

    // Replace variables
    if (translation && typeof translation === 'string') {
      Object.keys(variables).forEach(varKey => {
        translation = translation.replace(`{{${varKey}}}`, variables[varKey]);
      });
    }

    return translation || key;
  }

  /**
   * Detect language from request headers
   */
  detectLanguage(req) {
    // Check query parameter
    if (req.query.lang) {
      return this.supportedLanguages.includes(req.query.lang)
        ? req.query.lang
        : this.defaultLanguage;
    }

    // Check Accept-Language header
    const acceptLanguage = req.headers['accept-language'];
    if (acceptLanguage) {
      const preferred = acceptLanguage.split(',')[0].split('-')[0];
      if (this.supportedLanguages.includes(preferred)) {
        return preferred;
      }
    }

    return this.defaultLanguage;
  }

  /**
   * Check if text direction is RTL
   */
  isRTL(language) {
    return language === 'ar';
  }

  /**
   * Get localized content for insight
   */
  getLocalizedInsight(insight, language = 'en') {
    // If insight has translations
    if (insight.translations && insight.translations[language]) {
      return {
        ...insight.toObject(),
        title: insight.translations[language].title || insight.title,
        content: insight.translations[language].content || insight.content,
        excerpt: insight.translations[language].excerpt || insight.excerpt,
        language,
        isRTL: this.isRTL(language)
      };
    }

    // Return default (original language)
    return {
      ...insight.toObject(),
      language: insight.language || 'en',
      isRTL: this.isRTL(insight.language || 'en')
    };
  }

  /**
   * Add translation to existing translations
   */
  addTranslation(category, key, translations) {
    Object.keys(translations).forEach(lang => {
      if (!this.translations[lang]) {
        this.translations[lang] = {};
      }
      if (!this.translations[lang][category]) {
        this.translations[lang][category] = {};
      }
      this.translations[lang][category][key] = translations[lang];
    });

    logger.info('[I18nService] Translation added', { category, key });
  }

  /**
   * Get all translations for a language
   */
  getAllTranslations(language = 'en') {
    return this.translations[language] || this.translations[this.defaultLanguage];
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages() {
    return this.supportedLanguages.map(lang => ({
      code: lang,
      name: lang === 'en' ? 'English' : 'العربية',
      isRTL: this.isRTL(lang)
    }));
  }
}

module.exports = new I18nService();
