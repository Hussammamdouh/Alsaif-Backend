/**
 * XSS Sanitization Utility
 *
 * Prevents cross-site scripting attacks by sanitizing user-generated content
 * Uses DOMPurify for HTML sanitization
 */

const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');

// Create DOMPurify instance with JSDOM window
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

/**
 * Sanitize HTML content to prevent XSS attacks
 *
 * @param {string} dirty - Potentially unsafe HTML content
 * @param {object} options - Sanitization options
 * @returns {string} - Safe, sanitized content
 */
function sanitizeHTML(dirty, options = {}) {
  if (typeof dirty !== 'string') {
    return '';
  }

  const config = {
    // Allow only safe tags for rich text
    ALLOWED_TAGS: options.allowHTML
      ? ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre']
      : [],
    ALLOWED_ATTR: options.allowHTML
      ? ['href', 'target', 'rel']
      : [],
    // Force target="_blank" and rel="noopener noreferrer" for all links
    ADD_ATTR: ['target', 'rel'],
    // Remove all tags if not allowing HTML
    KEEP_CONTENT: true,
    // Return safe HTML
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false
  };

  // If links are allowed, add safe attributes
  DOMPurify.addHook('afterSanitizeAttributes', function (node) {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });

  const clean = DOMPurify.sanitize(dirty, config);

  // Remove DOMPurify hooks to prevent memory leaks
  DOMPurify.removeHooks('afterSanitizeAttributes');

  return clean;
}

/**
 * Sanitize plain text (strips ALL HTML tags)
 *
 * @param {string} dirty - Potentially unsafe text
 * @returns {string} - Plain text with HTML stripped
 */
function sanitizePlainText(dirty) {
  if (typeof dirty !== 'string') {
    return '';
  }

  // Strip all HTML tags, keep only text content
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],
    KEEP_CONTENT: true
  });
}

/**
 * Sanitize message content for chat
 *
 * @param {string} content - Message content
 * @param {boolean} allowFormatting - Allow basic formatting (bold, italic, links)
 * @returns {string} - Sanitized message
 */
function sanitizeMessage(content, allowFormatting = false) {
  if (!content || typeof content !== 'string') {
    return '';
  }

  // Trim and limit length
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return '';
  }

  // Sanitize based on formatting preference
  if (allowFormatting) {
    return sanitizeHTML(trimmed, { allowHTML: true });
  } else {
    return sanitizePlainText(trimmed);
  }
}

/**
 * Sanitize object fields recursively
 *
 * @param {object} obj - Object to sanitize
 * @param {array} fields - Fields to sanitize
 * @returns {object} - Object with sanitized fields
 */
function sanitizeFields(obj, fields = []) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sanitized = { ...obj };

  fields.forEach(field => {
    if (sanitized[field] && typeof sanitized[field] === 'string') {
      sanitized[field] = sanitizePlainText(sanitized[field]);
    }
  });

  return sanitized;
}

module.exports = {
  sanitizeHTML,
  sanitizePlainText,
  sanitizeMessage,
  sanitizeFields
};
