/**
 * SECURITY TESTS: XSS Sanitization
 * Tests the DOMPurify-based sanitizer for preventing XSS attacks
 */

const { sanitizeMessage, sanitizeHTML, sanitizePlainText } = require('../src/utils/sanitizer');

describe('XSS Sanitizer', () => {
  describe('sanitizePlainText', () => {
    it('should strip all HTML tags', () => {
      const dirty = '<script>alert("XSS")</script>Hello';
      const clean = sanitizePlainText(dirty);

      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('</script>');
      expect(clean).toContain('Hello');
    });

    it('should remove malicious event handlers', () => {
      const dirty = '<img src=x onerror="alert(1)">';
      const clean = sanitizePlainText(dirty);

      expect(clean).not.toContain('onerror');
      expect(clean).not.toContain('alert');
    });

    it('should handle empty input', () => {
      expect(sanitizePlainText('')).toBe('');
      expect(sanitizePlainText(null)).toBe('');
      expect(sanitizePlainText(undefined)).toBe('');
    });

    it('should preserve safe text', () => {
      const safe = 'This is a normal message with numbers 123 and symbols !@#';
      const clean = sanitizePlainText(safe);

      expect(clean).toBe(safe);
    });

    it('should strip dangerous protocols', () => {
      const dirty = '<a href="javascript:alert(1)">Click</a>';
      const clean = sanitizePlainText(dirty);

      expect(clean).not.toContain('javascript:');
      expect(clean).toContain('Click');
    });

    it('should handle nested HTML tags', () => {
      const dirty = '<div><p><strong><script>alert(1)</script>Text</strong></p></div>';
      const clean = sanitizePlainText(dirty);

      expect(clean).not.toContain('<');
      expect(clean).not.toContain('>');
      expect(clean).toContain('Text');
    });

    it('should strip data URIs in images', () => {
      const dirty = '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">';
      const clean = sanitizePlainText(dirty);

      expect(clean).not.toContain('data:');
      expect(clean).not.toContain('onload');
    });
  });

  describe('sanitizeHTML (with allowed tags)', () => {
    it('should allow safe HTML tags', () => {
      const input = '<p>Hello <strong>world</strong></p>';
      const clean = sanitizeHTML(input, { allowHTML: true });

      expect(clean).toContain('<p>');
      expect(clean).toContain('<strong>');
      expect(clean).toContain('</strong>');
      expect(clean).toContain('</p>');
    });

    it('should remove script tags even when HTML allowed', () => {
      const input = '<p>Hello</p><script>alert(1)</script>';
      const clean = sanitizeHTML(input, { allowHTML: true });

      expect(clean).not.toContain('<script>');
      expect(clean).toContain('<p>');
    });

    it('should sanitize href attributes', () => {
      const input = '<a href="javascript:alert(1)">Click</a>';
      const clean = sanitizeHTML(input, { allowHTML: true });

      expect(clean).not.toContain('javascript:');
    });

    it('should add target="_blank" and rel="noopener" to links', () => {
      const input = '<a href="https://example.com">Link</a>';
      const clean = sanitizeHTML(input, { allowHTML: true });

      expect(clean).toContain('target="_blank"');
      expect(clean).toContain('rel="noopener noreferrer"');
    });
  });

  describe('sanitizeMessage (chat messages)', () => {
    it('should strip HTML by default', () => {
      const message = '<script>alert("XSS")</script>Hello';
      const clean = sanitizeMessage(message, false);

      expect(clean).not.toContain('<script>');
      expect(clean).toContain('Hello');
    });

    it('should trim whitespace', () => {
      const message = '  Hello World  ';
      const clean = sanitizeMessage(message, false);

      expect(clean).toBe('Hello World');
    });

    it('should return empty string for empty input', () => {
      expect(sanitizeMessage('')).toBe('');
      expect(sanitizeMessage('   ')).toBe('');
      expect(sanitizeMessage(null)).toBe('');
    });

    it('should handle malicious payloads', () => {
      const payloads = [
        '<img src=x onerror=alert(1)>',
        '<svg onload=alert(1)>',
        '<iframe src="javascript:alert(1)">',
        '<object data="javascript:alert(1)">',
        '<embed src="javascript:alert(1)">',
        '<link rel="stylesheet" href="javascript:alert(1)">',
        '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">'
      ];

      payloads.forEach(payload => {
        const clean = sanitizeMessage(payload, false);
        expect(clean).not.toContain('javascript:');
        expect(clean).not.toContain('onerror');
        expect(clean).not.toContain('onload');
      });
    });

    it('should preserve emoji and unicode', () => {
      const message = 'Hello 👋 مرحبا 你好';
      const clean = sanitizeMessage(message, false);

      expect(clean).toBe(message);
    });

    it('should handle extremely long input', () => {
      const long = 'A'.repeat(100000);
      const clean = sanitizeMessage(long, false);

      expect(clean).toBe(long);
      expect(clean.length).toBe(100000);
    });
  });

  describe('XSS Attack Vectors (OWASP)', () => {
    it('should block script injection', () => {
      const vectors = [
        '<script>alert("XSS")</script>',
        '<SCRIPT>alert("XSS")</SCRIPT>',
        '<script src="http://evil.com/xss.js"></script>',
        '<script>document.cookie</script>'
      ];

      vectors.forEach(vector => {
        const clean = sanitizePlainText(vector);
        expect(clean).not.toContain('<script');
        expect(clean).not.toContain('SCRIPT');
      });
    });

    it('should block event handler injection', () => {
      const vectors = [
        '<img src=x onerror=alert(1)>',
        '<body onload=alert(1)>',
        '<input onfocus=alert(1) autofocus>',
        '<select onfocus=alert(1) autofocus>',
        '<textarea onfocus=alert(1) autofocus>'
      ];

      vectors.forEach(vector => {
        const clean = sanitizePlainText(vector);
        expect(clean).not.toContain('onerror');
        expect(clean).not.toContain('onload');
        expect(clean).not.toContain('onfocus');
      });
    });

    it('should block javascript: protocol', () => {
      const vectors = [
        '<a href="javascript:alert(1)">Click</a>',
        '<form action="javascript:alert(1)">',
        '<iframe src="javascript:alert(1)">',
        '<object data="javascript:alert(1)">'
      ];

      vectors.forEach(vector => {
        const clean = sanitizePlainText(vector);
        expect(clean).not.toContain('javascript:');
      });
    });

    it('should block data: protocol attacks', () => {
      const vectors = [
        '<img src="data:text/html,<script>alert(1)</script>">',
        '<object data="data:text/html,<script>alert(1)</script>">'
      ];

      vectors.forEach(vector => {
        const clean = sanitizePlainText(vector);
        expect(clean).not.toContain('data:text/html');
        expect(clean).not.toContain('<script');
      });
    });
  });

  describe('Performance & Edge Cases', () => {
    it('should handle non-string input gracefully', () => {
      expect(sanitizePlainText(123)).toBe('');
      expect(sanitizePlainText({})).toBe('');
      expect(sanitizePlainText([])).toBe('');
      expect(sanitizePlainText(true)).toBe('');
    });

    it('should handle special characters', () => {
      const input = '< > & " \' / \\';
      const clean = sanitizePlainText(input);

      expect(clean).toBeTruthy();
    });

    it('should be idempotent (sanitizing twice gives same result)', () => {
      const input = '<script>alert(1)</script>Hello';
      const clean1 = sanitizePlainText(input);
      const clean2 = sanitizePlainText(clean1);

      expect(clean1).toBe(clean2);
    });
  });
});
