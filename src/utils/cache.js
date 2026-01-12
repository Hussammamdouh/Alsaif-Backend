/**
 * In-Memory LRU Cache Implementation
 *
 * Production-grade caching WITHOUT Redis
 * Features:
 * - LRU (Least Recently Used) eviction policy
 * - TTL (Time To Live) support
 * - Automatic cleanup of expired entries
 * - Memory-safe with size limits
 * - Cache statistics for monitoring
 * - Deterministic cache keys
 */

class LRUCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100;         // Maximum number of entries
    this.defaultTTL = options.defaultTTL || 300000; // Default 5 minutes
    this.cache = new Map();                         // key -> { value, expiry, accessCount }
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0
    };

    // Cleanup expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Generate deterministic cache key from parameters
   *
   * @param {string} namespace - Cache namespace (e.g., 'insights', 'users')
   * @param {object} params - Parameters to include in key
   * @returns {string} - Cache key
   */
  static generateKey(namespace, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${JSON.stringify(params[key])}`)
      .join('&');

    return `${namespace}:${sortedParams || 'default'}`;
  }

  /**
   * Get value from cache
   *
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if not found/expired
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access metadata (LRU)
    entry.lastAccess = Date.now();
    entry.accessCount++;

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set value in cache
   *
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds (optional)
   */
  set(key, value, ttl = this.defaultTTL) {
    // Check if we need to evict
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    // Delete old entry if exists
    this.cache.delete(key);

    // Set new entry
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl,
      lastAccess: Date.now(),
      accessCount: 0
    });

    this.stats.sets++;
  }

  /**
   * Delete specific key from cache
   *
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Clear all entries matching pattern
   *
   * SECURITY FIX: Safe pattern matching without regex to prevent ReDoS
   * Supports simple wildcard patterns (e.g., 'insights:*', '*:user:123')
   *
   * @param {string} pattern - Pattern to match (e.g., 'insights:*')
   */
  invalidate(pattern) {
    let deleted = 0;

    // SECURITY: Use simple string matching instead of regex to prevent ReDoS attacks
    // Split pattern by wildcard to create prefix/suffix matching
    if (pattern.includes('*')) {
      const parts = pattern.split('*');

      // Validate pattern doesn't have too many wildcards (prevent abuse)
      if (parts.length > 3) {
        throw new Error('Pattern can contain maximum 2 wildcards for security');
      }

      const prefix = parts[0] || '';
      const suffix = parts[parts.length - 1] || '';
      const middle = parts.length === 3 ? parts[1] : null;

      for (const key of this.cache.keys()) {
        let matches = false;

        if (middle !== null) {
          // Pattern like 'prefix*middle*suffix'
          matches = key.startsWith(prefix) &&
                   key.endsWith(suffix) &&
                   key.includes(middle);
        } else {
          // Pattern like 'prefix*' or '*suffix' or 'prefix*suffix'
          matches = key.startsWith(prefix) && key.endsWith(suffix);
        }

        if (matches) {
          this.cache.delete(key);
          deleted++;
        }
      }
    } else {
      // Exact match (no wildcard)
      if (this.cache.has(pattern)) {
        this.cache.delete(pattern);
        deleted = 1;
      }
    }

    return deleted;
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0
    };
  }

  /**
   * Evict least recently used entry
   * @private
   */
  evictLRU() {
    // Map is ordered by insertion, first entry is LRU
    const firstKey = this.cache.keys().next().value;
    this.cache.delete(firstKey);
    this.stats.evictions++;
  }

  /**
   * Remove expired entries
   * @private
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get cache statistics
   *
   * @returns {object} - Statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: `${hitRate}%`,
      ...this.stats
    };
  }

  /**
   * Get detailed cache information for monitoring
   *
   * @returns {object} - Detailed stats
   */
  getDetailedStats() {
    const entries = [];
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      entries.push({
        key,
        size: JSON.stringify(entry.value).length,
        expiresIn: Math.max(0, entry.expiry - now),
        accessCount: entry.accessCount,
        age: now - (entry.lastAccess - entry.accessCount * 1000) // Rough estimate
      });
    }

    // Sort by access count (most accessed first)
    entries.sort((a, b) => b.accessCount - a.accessCount);

    return {
      ...this.getStats(),
      topEntries: entries.slice(0, 10)
    };
  }

  /**
   * Destroy cache and cleanup intervals
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.clear();
  }
}

// Global cache instances for different purposes
const caches = {
  insights: new LRUCache({ maxSize: 50, defaultTTL: 300000 }),      // 5 min TTL
  users: new LRUCache({ maxSize: 100, defaultTTL: 600000 }),        // 10 min TTL
  dashboardStats: new LRUCache({ maxSize: 10, defaultTTL: 60000 }), // 1 min TTL
  config: new LRUCache({ maxSize: 20, defaultTTL: 3600000 })        // 1 hour TTL
};

/**
 * Get cache instance for specific namespace
 *
 * @param {string} namespace - Cache namespace
 * @returns {LRUCache} - Cache instance
 */
function getCache(namespace) {
  if (!caches[namespace]) {
    caches[namespace] = new LRUCache();
  }
  return caches[namespace];
}

/**
 * Cache middleware factory
 *
 * Creates Express middleware that caches GET responses
 *
 * @param {string} namespace - Cache namespace
 * @param {object} options - Cache options
 * @returns {function} - Express middleware
 */
function cacheMiddleware(namespace, options = {}) {
  const cache = getCache(namespace);
  const keyGenerator = options.keyGenerator || ((req) => req.originalUrl);
  const ttl = options.ttl || cache.defaultTTL;
  const enabled = options.enabled !== false;

  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET' || !enabled) {
      return next();
    }

    const key = LRUCache.generateKey(namespace, { url: keyGenerator(req) });
    const cached = cache.get(key);

    if (cached) {
      return res.status(200).json(cached);
    }

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to cache response
    res.json = function(data) {
      // Only cache successful responses
      if (res.statusCode === 200) {
        cache.set(key, data, ttl);
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Get all cache statistics
 *
 * @returns {object} - All cache stats
 */
function getAllStats() {
  const stats = {};
  for (const [name, cache] of Object.entries(caches)) {
    stats[name] = cache.getStats();
  }
  return stats;
}

/**
 * Clear all caches
 */
function clearAllCaches() {
  for (const cache of Object.values(caches)) {
    cache.clear();
  }
}

/**
 * Graceful shutdown - cleanup all caches
 */
function shutdown() {
  for (const cache of Object.values(caches)) {
    cache.destroy();
  }
}

module.exports = {
  LRUCache,
  getCache,
  cacheMiddleware,
  getAllStats,
  clearAllCaches,
  shutdown,
  caches
};
