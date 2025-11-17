// src/shared/logger.js
// Structured JSON logging utility for MCP Writing Servers
// Provides consistent logging across all services with:
// - Multiple log levels (DEBUG, INFO, WARN, ERROR)
// - JSON formatting for log aggregation
// - Request tracking and correlation IDs
// - Performance metrics

import { randomUUID } from 'crypto';

// Log levels
const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

class Logger {
    constructor(serviceName, options = {}) {
        this.serviceName = serviceName;
        this.logLevel = this._parseLogLevel(options.logLevel || process.env.LOG_LEVEL || 'INFO');
        this.format = options.format || process.env.LOG_FORMAT || 'json';
        this.enableConsole = options.enableConsole !== false;
        this.requestIdHeader = options.requestIdHeader || 'x-request-id';
    }

    _parseLogLevel(level) {
        const normalized = level.toUpperCase();
        return LOG_LEVELS[normalized] !== undefined ? LOG_LEVELS[normalized] : LOG_LEVELS.INFO;
    }

    _shouldLog(level) {
        return LOG_LEVELS[level] >= this.logLevel;
    }

    _formatMessage(level, message, metadata = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: level,
            service: this.serviceName,
            message: message,
            ...metadata
        };

        // Add error stack if present
        if (metadata.error && metadata.error instanceof Error) {
            logEntry.error = {
                message: metadata.error.message,
                stack: metadata.error.stack,
                name: metadata.error.name
            };
            delete logEntry.error; // Remove the Error object to avoid circular reference
        }

        if (this.format === 'json') {
            return JSON.stringify(logEntry);
        }

        // Human-readable format for development
        const parts = [
            `[${logEntry.timestamp}]`,
            `[${level.padEnd(5)}]`,
            `[${this.serviceName}]`,
            message
        ];

        if (Object.keys(metadata).length > 0) {
            parts.push(JSON.stringify(metadata));
        }

        return parts.join(' ');
    }

    _write(level, message, metadata = {}) {
        if (!this._shouldLog(level)) {
            return;
        }

        const formattedMessage = this._formatMessage(level, message, metadata);

        // Write to stderr for compatibility with MCP stdio mode
        if (this.enableConsole) {
            if (level === 'ERROR') {
                console.error(formattedMessage);
            } else {
                console.error(formattedMessage);
            }
        }
    }

    debug(message, metadata = {}) {
        this._write('DEBUG', message, metadata);
    }

    info(message, metadata = {}) {
        this._write('INFO', message, metadata);
    }

    warn(message, metadata = {}) {
        this._write('WARN', message, metadata);
    }

    error(message, metadata = {}) {
        this._write('ERROR', message, metadata);
    }

    // Request logging middleware for Express
    requestLogger() {
        return (req, res, next) => {
            const requestId = req.headers[this.requestIdHeader] || randomUUID();
            const startTime = Date.now();

            // Attach request ID to request object
            req.requestId = requestId;
            res.setHeader('X-Request-ID', requestId);

            // Log request
            this.info('Incoming request', {
                requestId,
                method: req.method,
                path: req.path,
                query: req.query,
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent']
            });

            // Log response when finished
            const originalEnd = res.end;
            res.end = function(...args) {
                const duration = Date.now() - startTime;
                const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';

                this._write(level, 'Request completed', {
                    requestId,
                    method: req.method,
                    path: req.path,
                    statusCode: res.statusCode,
                    duration: `${duration}ms`
                });

                originalEnd.apply(res, args);
            }.bind(this);

            next();
        };
    }

    // Performance tracking
    startTimer(label) {
        const startTime = process.hrtime.bigint();
        return {
            end: (metadata = {}) => {
                const endTime = process.hrtime.bigint();
                const durationNs = endTime - startTime;
                const durationMs = Number(durationNs) / 1000000;

                this.info(`${label} completed`, {
                    ...metadata,
                    duration: `${durationMs.toFixed(2)}ms`,
                    durationMs: durationMs
                });

                return durationMs;
            }
        };
    }

    // Database query logging
    logQuery(query, duration, metadata = {}) {
        this.debug('Database query executed', {
            query: query.substring(0, 200), // Truncate long queries
            duration: `${duration.toFixed(2)}ms`,
            ...metadata
        });
    }

    // Audit logging for sensitive operations
    audit(action, userId, metadata = {}) {
        this.info('Audit log', {
            action,
            userId,
            ...metadata,
            auditLog: true
        });
    }
}

// Create default logger instance
export function createLogger(serviceName, options = {}) {
    return new Logger(serviceName, options);
}

// Export Logger class for custom instances
export { Logger, LOG_LEVELS };
