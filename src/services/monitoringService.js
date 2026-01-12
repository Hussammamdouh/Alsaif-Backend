/**
 * Monitoring Service
 *
 * Tracks system metrics, performance, and errors
 */

const logger = require('../utils/logger');
const os = require('os');
const process = require('process');

class MonitoringService {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        success: 0,
        errors: 0,
        byEndpoint: new Map(),
        byMethod: new Map(),
        byStatusCode: new Map()
      },
      performance: {
        responseTimes: [],
        avgResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: Infinity
      },
      errors: [],
      system: {
        uptime: 0,
        memory: {},
        cpu: {}
      }
    };

    this.startTime = Date.now();
    this.errorRetentionLimit = 1000; // Keep last 1000 errors
    this.performanceDataLimit = 10000; // Keep last 10000 response times
  }

  /**
   * Record HTTP request
   */
  recordRequest(req, res, responseTime) {
    const { method, path, originalUrl } = req;
    const statusCode = res.statusCode;

    // Total requests
    this.metrics.requests.total++;

    // Success vs errors
    if (statusCode >= 200 && statusCode < 400) {
      this.metrics.requests.success++;
    } else if (statusCode >= 400) {
      this.metrics.requests.errors++;
    }

    // By endpoint
    const endpoint = path || originalUrl;
    const endpointCount = this.metrics.requests.byEndpoint.get(endpoint) || 0;
    this.metrics.requests.byEndpoint.set(endpoint, endpointCount + 1);

    // By method
    const methodCount = this.metrics.requests.byMethod.get(method) || 0;
    this.metrics.requests.byMethod.set(method, methodCount + 1);

    // By status code
    const statusCount = this.metrics.requests.byStatusCode.get(statusCode) || 0;
    this.metrics.requests.byStatusCode.set(statusCode, statusCount + 1);

    // Performance metrics
    this.recordPerformance(responseTime);

    logger.debug('[Monitoring] Request recorded', {
      method,
      endpoint,
      statusCode,
      responseTime
    });
  }

  /**
   * Record performance metrics
   */
  recordPerformance(responseTime) {
    this.metrics.performance.responseTimes.push(responseTime);

    // Keep only recent data
    if (this.metrics.performance.responseTimes.length > this.performanceDataLimit) {
      this.metrics.performance.responseTimes.shift();
    }

    // Update stats
    this.metrics.performance.maxResponseTime = Math.max(
      this.metrics.performance.maxResponseTime,
      responseTime
    );
    this.metrics.performance.minResponseTime = Math.min(
      this.metrics.performance.minResponseTime,
      responseTime
    );

    // Calculate average
    const sum = this.metrics.performance.responseTimes.reduce((a, b) => a + b, 0);
    this.metrics.performance.avgResponseTime =
      sum / this.metrics.performance.responseTimes.length;
  }

  /**
   * Record error
   */
  recordError(error, context = {}) {
    const errorRecord = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      context,
      timestamp: new Date()
    };

    this.metrics.errors.push(errorRecord);

    // Keep only recent errors
    if (this.metrics.errors.length > this.errorRetentionLimit) {
      this.metrics.errors.shift();
    }

    logger.error('[Monitoring] Error recorded', errorRecord);
  }

  /**
   * Get system metrics
   */
  getSystemMetrics() {
    const uptime = Date.now() - this.startTime;

    return {
      uptime: {
        application: uptime,
        system: os.uptime() * 1000,
        formatted: this.formatUptime(uptime)
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        usagePercentage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
        process: process.memoryUsage()
      },
      cpu: {
        cores: os.cpus().length,
        model: os.cpus()[0]?.model,
        loadAverage: os.loadavg(),
        usage: process.cpuUsage()
      },
      platform: {
        type: os.type(),
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        hostname: os.hostname()
      }
    };
  }

  /**
   * Get all metrics
   */
  getMetrics() {
    return {
      requests: {
        total: this.metrics.requests.total,
        success: this.metrics.requests.success,
        errors: this.metrics.requests.errors,
        successRate:
          this.metrics.requests.total > 0
            ? (this.metrics.requests.success / this.metrics.requests.total) * 100
            : 0,
        errorRate:
          this.metrics.requests.total > 0
            ? (this.metrics.requests.errors / this.metrics.requests.total) * 100
            : 0,
        byEndpoint: Object.fromEntries(this.metrics.requests.byEndpoint),
        byMethod: Object.fromEntries(this.metrics.requests.byMethod),
        byStatusCode: Object.fromEntries(this.metrics.requests.byStatusCode)
      },
      performance: {
        avgResponseTime: Math.round(this.metrics.performance.avgResponseTime),
        maxResponseTime: Math.round(this.metrics.performance.maxResponseTime),
        minResponseTime:
          this.metrics.performance.minResponseTime === Infinity
            ? 0
            : Math.round(this.metrics.performance.minResponseTime),
        p95: this.calculatePercentile(95),
        p99: this.calculatePercentile(99)
      },
      errors: {
        total: this.metrics.errors.length,
        recent: this.metrics.errors.slice(-10) // Last 10 errors
      },
      system: this.getSystemMetrics()
    };
  }

  /**
   * Calculate percentile
   */
  calculatePercentile(percentile) {
    if (this.metrics.performance.responseTimes.length === 0) return 0;

    const sorted = [...this.metrics.performance.responseTimes].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return Math.round(sorted[index] || 0);
  }

  /**
   * Get top endpoints by request count
   */
  getTopEndpoints(limit = 10) {
    const endpoints = Array.from(this.metrics.requests.byEndpoint.entries())
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return endpoints;
  }

  /**
   * Get slow endpoints (highest avg response time)
   */
  getSlowEndpoints(limit = 10) {
    // This is a simplified version
    // In production, you'd track per-endpoint response times
    return this.getTopEndpoints(limit);
  }

  /**
   * Get error rate trend
   */
  getErrorRateTrend(minutes = 60) {
    const now = Date.now();
    const cutoff = now - minutes * 60 * 1000;

    const recentErrors = this.metrics.errors.filter(
      (e) => e.timestamp.getTime() > cutoff
    );

    return {
      totalErrors: recentErrors.length,
      errorRate: (recentErrors.length / minutes).toFixed(2),
      period: `${minutes} minutes`
    };
  }

  /**
   * Health check
   */
  getHealthStatus() {
    const metrics = this.getMetrics();
    const system = metrics.system;

    // Check various health indicators
    const checks = {
      memory: system.memory.usagePercentage < 90,
      uptime: system.uptime.application > 1000,
      errorRate: metrics.requests.errorRate < 10,
      responseTime: metrics.performance.avgResponseTime < 1000
    };

    const isHealthy = Object.values(checks).every((check) => check);

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date(),
      uptime: system.uptime.formatted
    };
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      requests: {
        total: 0,
        success: 0,
        errors: 0,
        byEndpoint: new Map(),
        byMethod: new Map(),
        byStatusCode: new Map()
      },
      performance: {
        responseTimes: [],
        avgResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: Infinity
      },
      errors: [],
      system: {
        uptime: 0,
        memory: {},
        cpu: {}
      }
    };

    logger.info('[Monitoring] Metrics reset');
  }

  /**
   * Format uptime
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Export metrics for persistence
   */
  exportMetrics() {
    return {
      timestamp: new Date(),
      ...this.getMetrics()
    };
  }
}

// Singleton instance
const monitoringService = new MonitoringService();

module.exports = monitoringService;
