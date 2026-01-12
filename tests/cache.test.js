/**
 * PERFORMANCE TESTS: LRU Cache System
 * Tests in-memory caching without Redis
 */

const { LRUCache, getCache, clearAllCaches, shutdown } = require('../src/utils/cache');

describe('LRU Cache System', () => {
  let cache;

  beforeEach(() => {
    cache = new LRUCache({ maxSize: 5, defaultTTL: 1000 });
  });

  afterEach(() => {
    if (cache) {
      cache.destroy();
    }
  });

  afterAll(() => {
    shutdown(); // Clean up all global cache intervals
  });

  describe('Basic Operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1');
      const result = cache.get('key1');

      expect(result).toBe('value1');
    });

    it('should return null for missing keys', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should delete values', () => {
      cache.set('key1', 'value1');
      cache.delete('key1');

      const result = cache.get('key1');
      expect(result).toBeNull();
    });

    it('should clear all values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should expire after TTL', (done) => {
      cache.set('expiring', 'value', 50); // 50ms TTL

      // Should exist immediately
      expect(cache.get('expiring')).toBe('value');

      // Should be expired after TTL
      setTimeout(() => {
        expect(cache.get('expiring')).toBeNull();
        done();
      }, 100);
    }, 200);

    it('should use default TTL when not specified', (done) => {
      cache.set('default-ttl', 'value'); // Uses defaultTTL: 1000ms

      expect(cache.get('default-ttl')).toBe('value');

      setTimeout(() => {
        expect(cache.get('default-ttl')).toBeNull();
        done();
      }, 1100);
    }, 1500);

    it('should allow different TTLs for different keys', (done) => {
      cache.set('short', 'value1', 50);
      cache.set('long', 'value2', 200);

      setTimeout(() => {
        expect(cache.get('short')).toBeNull();
        expect(cache.get('long')).toBe('value2');
        done();
      }, 100);
    }, 300);
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used when full', () => {
      const smallCache = new LRUCache({ maxSize: 3 });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');

      // All should exist
      expect(smallCache.get('key1')).toBe('value1');
      expect(smallCache.get('key2')).toBe('value2');
      expect(smallCache.get('key3')).toBe('value3');

      // Adding 4th should evict key1 (least recently used)
      smallCache.set('key4', 'value4');

      expect(smallCache.get('key1')).toBeNull();
      expect(smallCache.get('key2')).toBe('value2');
      expect(smallCache.get('key3')).toBe('value3');
      expect(smallCache.get('key4')).toBe('value4');

      smallCache.destroy();
    });

    it('should update LRU order on get', () => {
      const smallCache = new LRUCache({ maxSize: 3 });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');

      // Access key1 to make it most recently used
      smallCache.get('key1');

      // Add key4 - should evict key2 (now least recently used)
      smallCache.set('key4', 'value4');

      expect(smallCache.get('key1')).toBe('value1');
      expect(smallCache.get('key2')).toBeNull();
      expect(smallCache.get('key3')).toBe('value3');
      expect(smallCache.get('key4')).toBe('value4');

      smallCache.destroy();
    });

    it('should track eviction count', () => {
      const smallCache = new LRUCache({ maxSize: 2 });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3'); // Evicts key1
      smallCache.set('key4', 'value4'); // Evicts key2

      const stats = smallCache.getStats();
      expect(stats.evictions).toBe(2);

      smallCache.destroy();
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache hits', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // Hit
      cache.get('key1'); // Hit

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
    });

    it('should track cache misses', () => {
      cache.get('nonexistent1'); // Miss
      cache.get('nonexistent2'); // Miss

      const stats = cache.getStats();
      expect(stats.misses).toBe(2);
    });

    it('should calculate hit rate correctly', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('nonexistent'); // Miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBe('75.00%'); // 3 hits / 4 total
    });

    it('should track set operations', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      const stats = cache.getStats();
      expect(stats.sets).toBe(3);
    });

    it('should track cache size', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(5);
    });
  });

  describe('Pattern-Based Invalidation', () => {
    it('should invalidate by exact match', () => {
      cache.set('insights:1', 'data1');
      cache.set('insights:2', 'data2');
      cache.set('users:1', 'user1');

      const deleted = cache.invalidate('insights:1');

      expect(deleted).toBe(1);
      expect(cache.get('insights:1')).toBeNull();
      expect(cache.get('insights:2')).toBe('data2');
      expect(cache.get('users:1')).toBe('user1');
    });

    it('should invalidate by wildcard pattern', () => {
      cache.set('insights:1', 'data1');
      cache.set('insights:2', 'data2');
      cache.set('insights:3', 'data3');
      cache.set('users:1', 'user1');

      const deleted = cache.invalidate('insights:*');

      expect(deleted).toBe(3);
      expect(cache.get('insights:1')).toBeNull();
      expect(cache.get('insights:2')).toBeNull();
      expect(cache.get('insights:3')).toBeNull();
      expect(cache.get('users:1')).toBe('user1');
    });

    it('should invalidate all with * pattern', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      const deleted = cache.invalidate('*');

      expect(deleted).toBe(3);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });

    it('should handle complex patterns', () => {
      cache.set('insights:featured:limit=5', 'data1');
      cache.set('insights:featured:limit=10', 'data2');
      cache.set('insights:published:limit=5', 'data3');

      const deleted = cache.invalidate('insights:featured:*');

      expect(deleted).toBe(2);
      expect(cache.get('insights:featured:limit=5')).toBeNull();
      expect(cache.get('insights:featured:limit=10')).toBeNull();
      expect(cache.get('insights:published:limit=5')).toBe('data3');
    });
  });

  describe('Key Generation', () => {
    it('should generate deterministic keys', () => {
      const key1 = LRUCache.generateKey('insights', { limit: 5, type: 'premium' });
      const key2 = LRUCache.generateKey('insights', { limit: 5, type: 'premium' });

      expect(key1).toBe(key2);
    });

    it('should be order-independent', () => {
      const key1 = LRUCache.generateKey('insights', { limit: 5, type: 'premium' });
      const key2 = LRUCache.generateKey('insights', { type: 'premium', limit: 5 });

      expect(key1).toBe(key2);
    });

    it('should create different keys for different params', () => {
      const key1 = LRUCache.generateKey('insights', { limit: 5 });
      const key2 = LRUCache.generateKey('insights', { limit: 10 });

      expect(key1).not.toBe(key2);
    });

    it('should handle empty params', () => {
      const key = LRUCache.generateKey('insights');
      expect(key).toBe('insights:default');
    });

    it('should handle complex objects', () => {
      const key = LRUCache.generateKey('insights', {
        limit: 5,
        filters: { category: 'tech', status: 'published' }
      });

      expect(key).toContain('insights:');
      expect(key).toContain('limit=5');
      expect(key).toContain('filters=');
    });
  });

  describe('Automatic Cleanup', () => {
    it('should remove expired entries on cleanup', (done) => {
      const testCache = new LRUCache({ maxSize: 10, defaultTTL: 50 });

      testCache.set('key1', 'value1', 50);
      testCache.set('key2', 'value2', 50);
      testCache.set('key3', 'value3', 5000); // Long TTL

      setTimeout(() => {
        const cleaned = testCache.cleanup();

        expect(cleaned).toBe(2); // key1 and key2 expired
        expect(testCache.get('key1')).toBeNull();
        expect(testCache.get('key2')).toBeNull();
        expect(testCache.get('key3')).toBe('value3');

        testCache.destroy();
        done();
      }, 100);
    }, 200);
  });

  describe('Global Cache Instances', () => {
    it('should retrieve named cache instances', () => {
      const insightsCache = getCache('insights');
      const usersCache = getCache('users');

      expect(insightsCache).toBeDefined();
      expect(usersCache).toBeDefined();
      expect(insightsCache).not.toBe(usersCache);
    });

    it('should create new cache for unknown namespace', () => {
      const customCache = getCache('custom-namespace');

      expect(customCache).toBeDefined();
      expect(customCache instanceof LRUCache).toBe(true);
    });

    it('should reuse existing cache instances', () => {
      const cache1 = getCache('test');
      const cache2 = getCache('test');

      expect(cache1).toBe(cache2);
    });
  });

  describe('Performance & Stress Tests', () => {
    it('should handle large number of entries', () => {
      const bigCache = new LRUCache({ maxSize: 1000, defaultTTL: 60000 });

      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        bigCache.set(`key${i}`, `value${i}`);
      }

      const setDuration = Date.now() - start;

      // Should complete in under 100ms
      expect(setDuration).toBeLessThan(100);

      const getStart = Date.now();

      for (let i = 0; i < 1000; i++) {
        bigCache.get(`key${i}`);
      }

      const getDuration = Date.now() - getStart;

      // Should complete in under 50ms
      expect(getDuration).toBeLessThan(50);

      bigCache.destroy();
    });

    it('should handle rapid set/get operations', () => {
      const start = Date.now();

      for (let i = 0; i < 10000; i++) {
        cache.set(`key${i % 5}`, `value${i}`);
        cache.get(`key${i % 5}`);
      }

      const duration = Date.now() - start;

      // 20,000 operations should complete in under 200ms
      expect(duration).toBeLessThan(200);
    });

    it('should not leak memory on evictions', () => {
      const memCache = new LRUCache({ maxSize: 10 });

      // Add 1000 items (should trigger many evictions)
      for (let i = 0; i < 1000; i++) {
        memCache.set(`key${i}`, `value${i}`);
      }

      const stats = memCache.getStats();

      // Should maintain max size
      expect(stats.size).toBe(10);
      expect(stats.evictions).toBe(990);

      memCache.destroy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined values', () => {
      cache.set('null-key', null);
      cache.set('undefined-key', undefined);

      expect(cache.get('null-key')).toBeNull();
      expect(cache.get('undefined-key')).toBeUndefined();
    });

    it('should handle complex objects', () => {
      const complexObj = {
        id: 123,
        nested: {
          array: [1, 2, 3],
          date: new Date()
        }
      };

      cache.set('complex', complexObj);
      const result = cache.get('complex');

      expect(result).toEqual(complexObj);
      expect(result.nested.array).toEqual([1, 2, 3]);
    });

    it('should handle empty strings and whitespace', () => {
      cache.set('', 'empty-key');
      cache.set(' ', 'whitespace-key');

      expect(cache.get('')).toBe('empty-key');
      expect(cache.get(' ')).toBe('whitespace-key');
    });

    it('should handle special characters in keys', () => {
      const specialKeys = [
        'key:with:colons',
        'key/with/slashes',
        'key?with=query',
        'key#with#hash',
        'key@with@at'
      ];

      specialKeys.forEach((key, index) => {
        cache.set(key, `value${index}`);
        expect(cache.get(key)).toBe(`value${index}`);
      });
    });

    it('should handle zero TTL (immediately expired)', (done) => {
      cache.set('zero-ttl', 'value', 0);

      // With 0 TTL, it expires immediately but may need a tick
      setImmediate(() => {
        expect(cache.get('zero-ttl')).toBeNull();
        done();
      });
    });

    it('should handle negative TTL', () => {
      cache.set('negative-ttl', 'value', -1000);

      // Should be immediately expired
      expect(cache.get('negative-ttl')).toBeNull();
    });
  });

  describe('Cache Security', () => {
    it('should not allow cache poisoning via key injection', () => {
      // Try to inject wildcard into key
      cache.set('malicious:*:admin', 'poisoned');
      cache.set('normal:1:admin', 'normal');

      // Invalidate should only match literal key
      const deleted = cache.invalidate('malicious:*:admin');

      expect(deleted).toBe(1);
      expect(cache.get('normal:1:admin')).toBe('normal');
    });

    it('should handle extremely long keys', () => {
      const longKey = 'x'.repeat(10000);

      cache.set(longKey, 'value');
      expect(cache.get(longKey)).toBe('value');
    });

    it('should handle extremely large values', () => {
      const largeValue = 'x'.repeat(1000000); // 1MB string

      cache.set('large', largeValue);
      expect(cache.get('large')).toBe(largeValue);
    });
  });
});
