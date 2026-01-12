/**
 * Moderation Service
 *
 * Content moderation with profanity filtering and spam detection
 */

const logger = require('../utils/logger');

class ModerationService {
  constructor() {
    // Profanity filter list (basic implementation)
    this.profanityList = [
      'spam', 'scam', 'fake', 'fraud', 'cheat', 'hack', 'illegal',
      // Add more terms as needed
    ];

    // Spam patterns
    this.spamPatterns = [
      /\b(click here|buy now|limited time|act now)\b/i,
      /\b(viagra|cialis|lottery|casino|forex)\b/i,
      /(http|https):\/\/[^\s]{30,}/gi, // Long URLs
      /(.)\1{10,}/g, // Repeated characters
      /\b\d{10,}\b/g // Long numbers (likely phone numbers)
    ];
  }

  /**
   * Check if content contains profanity
   */
  containsProfanity(text) {
    const lowerText = text.toLowerCase();
    return this.profanityList.some(word => lowerText.includes(word));
  }

  /**
   * Check if content is spam
   */
  isSpam(text) {
    return this.spamPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Moderate content (comments, insights, etc.)
   */
  moderateContent(content) {
    const result = {
      approved: true,
      flags: [],
      score: 100 // 0-100, lower is worse
    };

    // Check profanity
    if (this.containsProfanity(content)) {
      result.flags.push('profanity');
      result.score -= 40;
    }

    // Check spam
    if (this.isSpam(content)) {
      result.flags.push('spam');
      result.score -= 50;
    }

    // Check excessive caps
    const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    if (capsRatio > 0.5 && content.length > 20) {
      result.flags.push('excessive_caps');
      result.score -= 20;
    }

    // Auto-reject if score too low
    if (result.score < 30) {
      result.approved = false;
    }

    logger.debug('[ModerationService] Content moderated', {
      approved: result.approved,
      flags: result.flags,
      score: result.score
    });

    return result;
  }

  /**
   * Filter profanity (replace with asterisks)
   */
  filterProfanity(text) {
    let filtered = text;
    this.profanityList.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      filtered = filtered.replace(regex, '*'.repeat(word.length));
    });
    return filtered;
  }

  /**
   * Calculate spam score (0-100, higher is spammier)
   */
  calculateSpamScore(content) {
    let score = 0;

    this.spamPatterns.forEach(pattern => {
      if (pattern.test(content)) score += 20;
    });

    // Check for excessive links
    const linkCount = (content.match(/(http|https):\/\//g) || []).length;
    if (linkCount > 2) score += linkCount * 10;

    // Check for excessive emojis
    const emojiCount = (content.match(/[\u{1F600}-\u{1F6FF}]/gu) || []).length;
    if (emojiCount > 10) score += emojiCount * 2;

    return Math.min(score, 100);
  }

  /**
   * Get moderation recommendations
   */
  getRecommendations(content) {
    const moderationResult = this.moderateContent(content);
    const spamScore = this.calculateSpamScore(content);

    return {
      action: moderationResult.approved ? 'approve' : 'reject',
      confidence: moderationResult.score / 100,
      flags: moderationResult.flags,
      spamScore,
      suggestions: this.generateSuggestions(moderationResult.flags)
    };
  }

  /**
   * Generate moderation suggestions
   */
  generateSuggestions(flags) {
    const suggestions = [];

    if (flags.includes('profanity')) {
      suggestions.push('Content contains inappropriate language');
    }
    if (flags.includes('spam')) {
      suggestions.push('Content appears to be spam');
    }
    if (flags.includes('excessive_caps')) {
      suggestions.push('Excessive use of capital letters');
    }

    return suggestions;
  }
}

module.exports = new ModerationService();
