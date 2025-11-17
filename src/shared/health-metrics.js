// src/shared/health-metrics.js
// Comprehensive health check and metrics collection for MCP Writing Servers
// Provides:
// - Database health checks
// - System resource monitoring
// - Request latency tracking (p50, p95, p99)
// - Error rate monitoring

import os from 'os';

class HealthMetrics {
    constructor() {
        this.requestLatencies = [];
        this.requestCount = 0;
        this.errorCount = 0;
        this.startTime = Date.now();

        // Keep last 1000 latencies for percentile calculations
        this.maxLatencyHistory = 1000;

        // Error tracking
        this.errorsByType = new Map();
    }

    // Record request latency
    recordLatency(latencyMs) {
        this.requestLatencies.push(latencyMs);
        this.requestCount++;

        // Keep only recent latencies
        if (this.requestLatencies.length > this.maxLatencyHistory) {
            this.requestLatencies.shift();
        }
    }

    // Record error
    recordError(errorType = 'unknown') {
        this.errorCount++;
        const count = this.errorsByType.get(errorType) || 0;
        this.errorsByType.set(errorType, count + 1);
    }

    // Calculate percentiles
    calculatePercentile(percentile) {
        if (this.requestLatencies.length === 0) return 0;

        const sorted = [...this.requestLatencies].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    // Get latency percentiles
    getLatencyPercentiles() {
        return {
            p50: this.calculatePercentile(50),
            p95: this.calculatePercentile(95),
            p99: this.calculatePercentile(99),
            count: this.requestLatencies.length
        };
    }

    // Get error rate
    getErrorRate() {
        if (this.requestCount === 0) return 0;
        return (this.errorCount / this.requestCount) * 100;
    }

    // Get system metrics
    getSystemMetrics() {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;

        return {
            memory: {
                total: totalMemory,
                free: freeMemory,
                used: usedMemory,
                usagePercent: ((usedMemory / totalMemory) * 100).toFixed(2)
            },
            cpu: {
                loadAverage: os.loadavg(),
                cores: os.cpus().length
            },
            uptime: {
                process: process.uptime(),
                system: os.uptime()
            },
            nodejs: {
                version: process.version,
                memoryUsage: process.memoryUsage()
            }
        };
    }

    // Get uptime in human-readable format
    getUptime() {
        const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        const days = Math.floor(uptimeSeconds / 86400);
        const hours = Math.floor((uptimeSeconds % 86400) / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;

        return {
            seconds: uptimeSeconds,
            formatted: `${days}d ${hours}h ${minutes}m ${seconds}s`
        };
    }

    // Comprehensive health check
    async checkHealth(db) {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: this.getUptime(),
            system: this.getSystemMetrics(),
            metrics: {
                requests: {
                    total: this.requestCount,
                    errors: this.errorCount,
                    errorRate: this.getErrorRate().toFixed(2) + '%'
                },
                latency: this.getLatencyPercentiles()
            }
        };

        // Database health check
        if (db) {
            try {
                const dbHealth = await db.healthCheck();
                health.database = {
                    status: dbHealth.healthy ? 'healthy' : 'unhealthy',
                    ...dbHealth
                };

                if (!dbHealth.healthy) {
                    health.status = 'degraded';
                }
            } catch (error) {
                health.database = {
                    status: 'error',
                    error: error.message
                };
                health.status = 'unhealthy';
            }
        }

        // Check if error rate is too high
        if (this.getErrorRate() > 5) {
            health.status = 'degraded';
            health.warning = 'High error rate detected';
        }

        // Check memory usage
        const memoryUsagePercent = parseFloat(health.system.memory.usagePercent);
        if (memoryUsagePercent > 90) {
            health.status = 'degraded';
            health.warning = 'High memory usage';
        }

        return health;
    }

    // Reset metrics
    reset() {
        this.requestLatencies = [];
        this.requestCount = 0;
        this.errorCount = 0;
        this.errorsByType.clear();
    }

    // Get Prometheus-formatted metrics
    getPrometheusMetrics(serviceName) {
        const latencies = this.getLatencyPercentiles();
        const system = this.getSystemMetrics();

        const metrics = [];

        // Request metrics
        metrics.push(`# HELP mcp_requests_total Total number of requests`);
        metrics.push(`# TYPE mcp_requests_total counter`);
        metrics.push(`mcp_requests_total{service="${serviceName}"} ${this.requestCount}`);

        metrics.push(`# HELP mcp_errors_total Total number of errors`);
        metrics.push(`# TYPE mcp_errors_total counter`);
        metrics.push(`mcp_errors_total{service="${serviceName}"} ${this.errorCount}`);

        // Latency percentiles
        metrics.push(`# HELP mcp_request_duration_ms Request duration percentiles`);
        metrics.push(`# TYPE mcp_request_duration_ms gauge`);
        metrics.push(`mcp_request_duration_ms{service="${serviceName}",quantile="0.5"} ${latencies.p50}`);
        metrics.push(`mcp_request_duration_ms{service="${serviceName}",quantile="0.95"} ${latencies.p95}`);
        metrics.push(`mcp_request_duration_ms{service="${serviceName}",quantile="0.99"} ${latencies.p99}`);

        // Memory metrics
        metrics.push(`# HELP mcp_memory_usage_bytes Memory usage in bytes`);
        metrics.push(`# TYPE mcp_memory_usage_bytes gauge`);
        metrics.push(`mcp_memory_usage_bytes{service="${serviceName}",type="used"} ${system.memory.used}`);
        metrics.push(`mcp_memory_usage_bytes{service="${serviceName}",type="free"} ${system.memory.free}`);

        // Uptime
        const uptime = this.getUptime();
        metrics.push(`# HELP mcp_uptime_seconds Process uptime in seconds`);
        metrics.push(`# TYPE mcp_uptime_seconds gauge`);
        metrics.push(`mcp_uptime_seconds{service="${serviceName}"} ${uptime.seconds}`);

        return metrics.join('\n');
    }
}

// Create singleton instance
const healthMetrics = new HealthMetrics();

export { HealthMetrics, healthMetrics };
