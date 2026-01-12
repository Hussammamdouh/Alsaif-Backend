/**
 * Performance Monitoring Service
 *
 * Advanced server and application performance monitoring
 */

const os = require('os');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

class PerformanceMonitoringService {
  constructor() {
    this.metrics = {
      server: {
        startTime: Date.now(),
        requests: {
          total: 0,
          perSecond: 0,
          perMinute: 0
        },
        responses: {
          avg: 0,
          p50: 0,
          p95: 0,
          p99: 0
        }
      },
      cpu: {
        usage: [],
        average: 0,
        peak: 0
      },
      memory: {
        usage: [],
        average: 0,
        peak: 0
      },
      database: {
        connections: 0,
        queries: {
          total: 0,
          slow: 0,
          failed: 0
        },
        avgQueryTime: 0
      },
      endpoints: new Map(),
      errors: [],
      alerts: []
    };

    this.responseTimes = [];
    this.requestTimestamps = [];
    this.maxDataPoints = 1000;
  }

  /**
   * Initialize monitoring
   */
  initialize() {
    // Start CPU monitoring
    this.startCPUMonitoring();

    // Start memory monitoring
    this.startMemoryMonitoring();

    // Start database monitoring
    this.startDatabaseMonitoring();

    // Clean old data periodically
    setInterval(() => this.cleanOldData(), 60000); // Every minute

    logger.info('[PerformanceMonitor] Initialized');
  }

  /**
   * Start CPU monitoring
   */
  startCPUMonitoring() {
    setInterval(() => {
      const cpus = os.cpus();
      const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
      const totalTick = cpus.reduce((acc, cpu) =>
        acc + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq, 0
      );

      const usage = 100 - (totalIdle / totalTick * 100);

      this.metrics.cpu.usage.push({
        timestamp: Date.now(),
        value: usage
      });

      // Keep only last 1000 data points
      if (this.metrics.cpu.usage.length > this.maxDataPoints) {
        this.metrics.cpu.usage.shift();
      }

      // Update average and peak
      this.metrics.cpu.average = this.metrics.cpu.usage.reduce((acc, item) => acc + item.value, 0) / this.metrics.cpu.usage.length;
      this.metrics.cpu.peak = Math.max(...this.metrics.cpu.usage.map(item => item.value));

      // Alert if CPU usage is high
      if (usage > 80) {
        this.addAlert('high_cpu', `CPU usage is ${usage.toFixed(2)}%`, 'warning');
      }
      if (usage > 95) {
        this.addAlert('critical_cpu', `CPU usage is ${usage.toFixed(2)}%`, 'critical');
      }
    }, 5000); // Every 5 seconds
  }

  /**
   * Start memory monitoring
   */
  startMemoryMonitoring() {
    setInterval(() => {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const usage = (usedMem / totalMem) * 100;

      const processMemory = process.memoryUsage();

      this.metrics.memory.usage.push({
        timestamp: Date.now(),
        system: {
          total: totalMem,
          free: freeMem,
          used: usedMem,
          percentage: usage
        },
        process: {
          rss: processMemory.rss,
          heapTotal: processMemory.heapTotal,
          heapUsed: processMemory.heapUsed,
          external: processMemory.external
        }
      });

      // Keep only last 1000 data points
      if (this.metrics.memory.usage.length > this.maxDataPoints) {
        this.metrics.memory.usage.shift();
      }

      // Update average and peak
      this.metrics.memory.average = this.metrics.memory.usage.reduce((acc, item) => acc + item.system.percentage, 0) / this.metrics.memory.usage.length;
      this.metrics.memory.peak = Math.max(...this.metrics.memory.usage.map(item => item.system.percentage));

      // Alert if memory usage is high
      if (usage > 85) {
        this.addAlert('high_memory', `Memory usage is ${usage.toFixed(2)}%`, 'warning');
      }
      if (usage > 95) {
        this.addAlert('critical_memory', `Memory usage is ${usage.toFixed(2)}%`, 'critical');
      }
    }, 5000); // Every 5 seconds
  }

  /**
   * Start database monitoring
   */
  startDatabaseMonitoring() {
    setInterval(() => {
      if (mongoose.connection.readyState === 1) {
        this.metrics.database.connections = mongoose.connection.client?.s?.options?.maxPoolSize || 0;
      }
    }, 10000); // Every 10 seconds
  }

  /**
   * Record HTTP request
   */
  recordRequest(req, res, responseTime) {
    this.metrics.server.requests.total++;
    this.requestTimestamps.push(Date.now());

    // Keep only last 1000 timestamps
    if (this.requestTimestamps.length > this.maxDataPoints) {
      this.requestTimestamps.shift();
    }

    // Calculate requests per second/minute
    this.calculateRequestRates();

    // Record response time
    this.recordResponseTime(responseTime, req.path, req.method);

    // Track endpoint usage
    const endpoint = `${req.method} ${req.path}`;
    const endpointData = this.metrics.endpoints.get(endpoint) || {
      count: 0,
      totalTime: 0,
      avgTime: 0,
      minTime: Infinity,
      maxTime: 0,
      errors: 0
    };

    endpointData.count++;
    endpointData.totalTime += responseTime;
    endpointData.avgTime = endpointData.totalTime / endpointData.count;
    endpointData.minTime = Math.min(endpointData.minTime, responseTime);
    endpointData.maxTime = Math.max(endpointData.maxTime, responseTime);

    if (res.statusCode >= 400) {
      endpointData.errors++;
    }

    this.metrics.endpoints.set(endpoint, endpointData);

    // Alert on slow requests
    if (responseTime > 3000) {
      this.addAlert('slow_request', `Slow request: ${endpoint} took ${responseTime}ms`, 'warning');
    }
  }

  /**
   * Record response time
   */
  recordResponseTime(time, path, method) {
    this.responseTimes.push({
      timestamp: Date.now(),
      time,
      path,
      method
    });

    // Keep only last 1000 data points
    if (this.responseTimes.length > this.maxDataPoints) {
      this.responseTimes.shift();
    }

    // Calculate percentiles
    this.calculateResponsePercentiles();
  }

  /**
   * Calculate request rates
   */
  calculateRequestRates() {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const oneMinuteAgo = now - 60000;

    this.metrics.server.requests.perSecond = this.requestTimestamps.filter(t => t > oneSecondAgo).length;
    this.metrics.server.requests.perMinute = this.requestTimestamps.filter(t => t > oneMinuteAgo).length;
  }

  /**
   * Calculate response time percentiles
   */
  calculateResponsePercentiles() {
    if (this.responseTimes.length === 0) return;

    const times = this.responseTimes.map(r => r.time).sort((a, b) => a - b);

    this.metrics.server.responses.avg = times.reduce((a, b) => a + b, 0) / times.length;
    this.metrics.server.responses.p50 = this.getPercentile(times, 50);
    this.metrics.server.responses.p95 = this.getPercentile(times, 95);
    this.metrics.server.responses.p99 = this.getPercentile(times, 99);
  }

  /**
   * Get percentile value
   */
  getPercentile(sorted, percentile) {
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  /**
   * Record error
   */
  recordError(error, context = {}) {
    this.metrics.errors.push({
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      context
    });

    // Keep only last 100 errors
    if (this.metrics.errors.length > 100) {
      this.metrics.errors.shift();
    }

    this.addAlert('error', error.message, 'error');
  }

  /**
   * Add alert
   */
  addAlert(type, message, severity = 'info') {
    const alert = {
      type,
      message,
      severity,
      timestamp: Date.now()
    };

    this.metrics.alerts.push(alert);

    // Keep only last 50 alerts
    if (this.metrics.alerts.length > 50) {
      this.metrics.alerts.shift();
    }

    if (severity === 'critical') {
      logger.error(`[PerformanceMonitor] CRITICAL ALERT: ${message}`);
    } else if (severity === 'warning') {
      logger.warn(`[PerformanceMonitor] WARNING: ${message}`);
    }
  }

  /**
   * Clean old data
   */
  cleanOldData() {
    const oneHourAgo = Date.now() - 3600000;

    // Clean old alerts
    this.metrics.alerts = this.metrics.alerts.filter(a => a.timestamp > oneHourAgo);

    // Clean old errors
    this.metrics.errors = this.metrics.errors.filter(e => e.timestamp > oneHourAgo);
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      endpoints: Array.from(this.metrics.endpoints.entries()).map(([endpoint, data]) => ({
        endpoint,
        ...data
      })),
      server: {
        ...this.metrics.server,
        uptime: Date.now() - this.metrics.server.startTime
      }
    };
  }

  /**
   * Get system information
   */
  getSystemInfo() {
    const cpus = os.cpus();

    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: {
        count: cpus.length,
        model: cpus[0]?.model,
        speed: cpus[0]?.speed
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem()
      },
      uptime: os.uptime(),
      loadAverage: os.loadavg(),
      node: {
        version: process.version,
        pid: process.pid,
        uptime: process.uptime()
      }
    };
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const cpuUsage = this.metrics.cpu.usage[this.metrics.cpu.usage.length - 1]?.value || 0;
    const memUsage = this.metrics.memory.usage[this.metrics.memory.usage.length - 1]?.system.percentage || 0;
    const avgResponseTime = this.metrics.server.responses.avg;

    let status = 'healthy';
    const issues = [];

    if (cpuUsage > 80) {
      status = 'degraded';
      issues.push('High CPU usage');
    }

    if (memUsage > 85) {
      status = 'degraded';
      issues.push('High memory usage');
    }

    if (avgResponseTime > 1000) {
      status = 'degraded';
      issues.push('Slow response times');
    }

    if (cpuUsage > 95 || memUsage > 95) {
      status = 'critical';
    }

    return {
      status,
      issues,
      metrics: {
        cpu: cpuUsage.toFixed(2),
        memory: memUsage.toFixed(2),
        avgResponseTime: avgResponseTime.toFixed(2),
        requestsPerSecond: this.metrics.server.requests.perSecond
      }
    };
  }

  /**
   * Get top slow endpoints
   */
  getTopSlowEndpoints(limit = 10) {
    const endpoints = Array.from(this.metrics.endpoints.entries())
      .map(([endpoint, data]) => ({
        endpoint,
        avgTime: data.avgTime,
        maxTime: data.maxTime,
        count: data.count,
        errors: data.errors
      }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, limit);

    return endpoints;
  }

  /**
   * Get endpoint statistics
   */
  getEndpointStats() {
    const endpoints = Array.from(this.metrics.endpoints.entries()).map(([endpoint, data]) => ({
      endpoint,
      ...data,
      errorRate: (data.errors / data.count * 100).toFixed(2)
    }));

    return {
      total: endpoints.length,
      topByRequests: endpoints.sort((a, b) => b.count - a.count).slice(0, 10),
      topByErrors: endpoints.sort((a, b) => b.errors - a.errors).slice(0, 10),
      slowest: endpoints.sort((a, b) => b.avgTime - a.avgTime).slice(0, 10)
    };
  }

  /**
   * Get real-time metrics (for WebSocket streaming)
   */
  getRealTimeMetrics() {
    const latest = {
      cpu: this.metrics.cpu.usage[this.metrics.cpu.usage.length - 1],
      memory: this.metrics.memory.usage[this.metrics.memory.usage.length - 1],
      requests: {
        perSecond: this.metrics.server.requests.perSecond,
        perMinute: this.metrics.server.requests.perMinute
      },
      responseTime: {
        avg: this.metrics.server.responses.avg,
        p95: this.metrics.server.responses.p95,
        p99: this.metrics.server.responses.p99
      },
      alerts: this.metrics.alerts.slice(-5)
    };

    return latest;
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      server: {
        startTime: Date.now(),
        requests: { total: 0, perSecond: 0, perMinute: 0 },
        responses: { avg: 0, p50: 0, p95: 0, p99: 0 }
      },
      cpu: { usage: [], average: 0, peak: 0 },
      memory: { usage: [], average: 0, peak: 0 },
      database: { connections: 0, queries: { total: 0, slow: 0, failed: 0 }, avgQueryTime: 0 },
      endpoints: new Map(),
      errors: [],
      alerts: []
    };

    this.responseTimes = [];
    this.requestTimestamps = [];

    logger.info('[PerformanceMonitor] Metrics reset');
  }
}

module.exports = new PerformanceMonitoringService();
