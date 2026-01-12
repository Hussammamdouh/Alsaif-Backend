/**
 * SECURITY TESTS: Socket.IO Rate Limiting
 * Tests in-memory rate limiter for socket events
 */

const {
  checkSocketRateLimit,
  rateLimitedHandler,
  getRateLimitStatus,
  clearUserRateLimit
} = require('../src/middleware/socketRateLimit');

describe('Socket Rate Limiting', () => {
  beforeEach(() => {
    // Clear all rate limits before each test
    clearUserRateLimit('test-user-1');
    clearUserRateLimit('test-user-2');
  });

  describe('checkSocketRateLimit', () => {
    it('should allow first request', () => {
      const result = checkSocketRateLimit('user1', 10, 60000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it('should track multiple requests', () => {
      const userId = 'user2';

      const result1 = checkSocketRateLimit(userId, 5, 60000);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(4);

      const result2 = checkSocketRateLimit(userId, 5, 60000);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(3);

      const result3 = checkSocketRateLimit(userId, 5, 60000);
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(2);
    });

    it('should block after exceeding limit', () => {
      const userId = 'user3';
      const maxEvents = 3;

      // Exhaust the limit
      checkSocketRateLimit(userId, maxEvents, 60000); // 1
      checkSocketRateLimit(userId, maxEvents, 60000); // 2
      checkSocketRateLimit(userId, maxEvents, 60000); // 3

      // This should be blocked
      const blocked = checkSocketRateLimit(userId, maxEvents, 60000);

      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it('should reset after time window', (done) => {
      const userId = 'user4';
      const windowMs = 100; // 100ms window for testing

      // Exhaust limit
      checkSocketRateLimit(userId, 2, windowMs);
      checkSocketRateLimit(userId, 2, windowMs);

      const blocked = checkSocketRateLimit(userId, 2, windowMs);
      expect(blocked.allowed).toBe(false);

      // Wait for window to expire
      setTimeout(() => {
        const afterReset = checkSocketRateLimit(userId, 2, windowMs);
        expect(afterReset.allowed).toBe(true);
        expect(afterReset.remaining).toBe(1);
        done();
      }, 150); // Wait longer than window
    }, 300);

    it('should handle different users independently', () => {
      const result1 = checkSocketRateLimit('userA', 5, 60000);
      const result2 = checkSocketRateLimit('userB', 5, 60000);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result1.remaining).toBe(4);
      expect(result2.remaining).toBe(4);
    });

    it('should enforce default limits (20 events/minute)', () => {
      const userId = 'user5';

      // Make 20 requests (should all pass)
      for (let i = 0; i < 20; i++) {
        const result = checkSocketRateLimit(userId, 20, 60000);
        expect(result.allowed).toBe(true);
      }

      // 21st request should be blocked
      const blocked = checkSocketRateLimit(userId, 20, 60000);
      expect(blocked.allowed).toBe(false);
    });
  });

  describe('rateLimitedHandler', () => {
    it('should call handler if under limit', async () => {
      const mockHandler = jest.fn(async function(data, callback) {
        callback({ success: true });
      });

      const wrappedHandler = rateLimitedHandler(mockHandler, {
        maxEvents: 5,
        windowMs: 60000
      });

      const mockSocket = {
        user: { id: 'user6' }
      };

      const mockCallback = jest.fn();
      await wrappedHandler.call(mockSocket, { test: 'data' }, mockCallback);

      expect(mockHandler).toHaveBeenCalled();
      expect(mockCallback).toHaveBeenCalledWith({ success: true });
    });

    it('should block handler if over limit', async () => {
      const mockHandler = jest.fn();
      const wrappedHandler = rateLimitedHandler(mockHandler, {
        maxEvents: 2,
        windowMs: 60000,
        errorMessage: 'Too many requests'
      });

      const mockSocket = {
        user: { id: 'user7' }
      };

      const mockCallback = jest.fn();

      // First 2 requests should succeed
      await wrappedHandler.call(mockSocket, {}, mockCallback);
      await wrappedHandler.call(mockSocket, {}, mockCallback);

      // Third request should be blocked
      await wrappedHandler.call(mockSocket, {}, mockCallback);

      expect(mockHandler).toHaveBeenCalledTimes(2);
      expect(mockCallback).toHaveBeenLastCalledWith({
        error: 'Too many requests',
        resetAt: expect.any(Number)
      });
    });

    it('should reject unauthenticated sockets', async () => {
      const mockHandler = jest.fn();
      const wrappedHandler = rateLimitedHandler(mockHandler);

      const mockSocket = {}; // No user property

      const mockCallback = jest.fn();
      await wrappedHandler.call(mockSocket, {}, mockCallback);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockCallback).toHaveBeenCalledWith({
        error: 'Not authenticated'
      });
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return status for user', () => {
      const userId = 'user8';

      checkSocketRateLimit(userId, 10, 60000);
      checkSocketRateLimit(userId, 10, 60000);

      const status = getRateLimitStatus(userId);

      expect(status).toBeDefined();
      expect(status.count).toBe(2);
      expect(status.resetAt).toBeGreaterThan(Date.now());
    });

    it('should return null for unknown user', () => {
      const status = getRateLimitStatus('unknown-user');
      expect(status).toBeNull();
    });
  });

  describe('clearUserRateLimit', () => {
    it('should clear rate limit for user', () => {
      const userId = 'user9';

      checkSocketRateLimit(userId, 5, 60000);
      checkSocketRateLimit(userId, 5, 60000);

      let status = getRateLimitStatus(userId);
      expect(status.count).toBe(2);

      clearUserRateLimit(userId);

      status = getRateLimitStatus(userId);
      expect(status).toBeNull();
    });
  });

  describe('Security & Edge Cases', () => {
    it('should handle rapid-fire requests', () => {
      const userId = 'rapid-user';
      const results = [];

      // Fire 100 requests rapidly
      for (let i = 0; i < 100; i++) {
        results.push(checkSocketRateLimit(userId, 20, 60000));
      }

      const allowed = results.filter(r => r.allowed).length;
      const blocked = results.filter(r => !r.allowed).length;

      expect(allowed).toBe(20);
      expect(blocked).toBe(80);
    });

    it('should handle concurrent users', () => {
      const users = ['user10', 'user11', 'user12', 'user13', 'user14'];

      users.forEach(userId => {
        const result = checkSocketRateLimit(userId, 5, 60000);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4);
      });
    });

    it('should prevent integer overflow', () => {
      const userId = 'overflow-user';

      // Make many requests to test counter integrity
      for (let i = 0; i < 1000; i++) {
        checkSocketRateLimit(userId, 10, 60000);
      }

      const status = getRateLimitStatus(userId);
      expect(status.count).toBeGreaterThan(10);
      expect(status.count).toBeLessThan(100000); // Reasonable upper bound
    });

    it('should handle missing userId gracefully', () => {
      const result1 = checkSocketRateLimit(null, 5, 60000);
      const result2 = checkSocketRateLimit(undefined, 5, 60000);

      // Should still create entries but with null/undefined keys
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should handle high throughput', () => {
      const start = Date.now();

      // Simulate 1000 events from 100 different users
      for (let i = 0; i < 1000; i++) {
        const userId = `perf-user-${i % 100}`;
        checkSocketRateLimit(userId, 20, 60000);
      }

      const duration = Date.now() - start;

      // Should complete in under 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should cleanup expired entries automatically', (done) => {
      const userId = 'cleanup-user';

      // Create entry with short window
      checkSocketRateLimit(userId, 5, 50);

      let status = getRateLimitStatus(userId);
      expect(status).not.toBeNull();

      // Wait for expiry
      setTimeout(() => {
        // Make new request which should trigger cleanup
        const result = checkSocketRateLimit(userId, 5, 50);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4); // Should be fresh limit
        done();
      }, 100);
    }, 200);
  });
});
