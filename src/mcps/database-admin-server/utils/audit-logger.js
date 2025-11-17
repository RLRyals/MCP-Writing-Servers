// src/mcps/database-admin-server/utils/audit-logger.js
// Comprehensive Audit Logging for Database Operations
// Logs all operations with before/after state and performance metrics

import crypto from 'crypto';

/**
 * AuditLogger class
 * Provides comprehensive logging of all database operations
 */
export class AuditLogger {
    constructor(db) {
        this.db = db;
        this.pendingLogs = [];
        this.batchInterval = null;
        this.isShuttingDown = false;
    }

    /**
     * Log a database operation
     * @param {object} logEntry - Log entry data
     * @param {string} logEntry.operation - Operation type (CREATE, READ, UPDATE, DELETE, etc.)
     * @param {string} logEntry.table - Table name
     * @param {string|number} logEntry.recordId - Record ID (optional)
     * @param {string} logEntry.userId - User ID (optional)
     * @param {object} logEntry.clientInfo - Client information (optional)
     * @param {object} logEntry.changes - Before/after values for updates (optional)
     * @param {boolean} logEntry.success - Whether operation succeeded
     * @param {string} logEntry.errorMessage - Error message if failed (optional)
     * @param {number} logEntry.executionTime - Execution time in milliseconds (optional)
     * @param {string} logEntry.queryText - Query text for hash generation (optional)
     */
    async log(logEntry) {
        try {
            // Don't log audit log operations to prevent infinite recursion
            if (logEntry.table === 'audit_logs') {
                return;
            }

            // Build the audit log record
            const auditRecord = {
                timestamp: new Date(),
                operation: logEntry.operation,
                table_name: logEntry.table,
                record_id: logEntry.recordId ? String(logEntry.recordId) : null,
                user_id: logEntry.userId || null,
                client_info: logEntry.clientInfo || null,
                changes: logEntry.changes || null,
                success: logEntry.success,
                error_message: logEntry.errorMessage || null,
                execution_time_ms: logEntry.executionTime || null,
                query_hash: logEntry.queryText ? this.hashQuery(logEntry.queryText) : null
            };

            // Insert audit log asynchronously (fire and forget for performance)
            setImmediate(async () => {
                try {
                    await this.insertAuditLog(auditRecord);
                } catch (error) {
                    // Log to stderr but don't throw - audit logging should not break operations
                    console.error('[AUDIT-LOGGER] Failed to insert audit log:', error.message);
                }
            });

        } catch (error) {
            console.error('[AUDIT-LOGGER] Failed to create audit log:', error.message);
        }
    }

    /**
     * Insert audit log record into database
     * @param {object} record - Audit log record
     */
    async insertAuditLog(record) {
        const query = `
            INSERT INTO audit_logs (
                timestamp, operation, table_name, record_id, user_id,
                client_info, changes, success, error_message,
                execution_time_ms, query_hash
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;

        const values = [
            record.timestamp,
            record.operation,
            record.table_name,
            record.record_id,
            record.user_id,
            record.client_info ? JSON.stringify(record.client_info) : null,
            record.changes ? JSON.stringify(record.changes) : null,
            record.success,
            record.error_message,
            record.execution_time_ms,
            record.query_hash
        ];

        await this.db.query(query, values);
    }

    /**
     * Generate hash of query for duplicate detection
     * @param {string} queryText - SQL query text
     * @returns {string} SHA-256 hash of query
     */
    hashQuery(queryText) {
        return crypto.createHash('sha256').update(queryText).digest('hex');
    }

    /**
     * Log a successful operation
     * @param {string} operation - Operation type
     * @param {string} table - Table name
     * @param {object} options - Additional options
     */
    async logSuccess(operation, table, options = {}) {
        await this.log({
            operation,
            table,
            recordId: options.recordId,
            userId: options.userId,
            clientInfo: options.clientInfo,
            changes: options.changes,
            success: true,
            executionTime: options.executionTime,
            queryText: options.queryText
        });
    }

    /**
     * Log a failed operation
     * @param {string} operation - Operation type
     * @param {string} table - Table name
     * @param {Error} error - Error that occurred
     * @param {object} options - Additional options
     */
    async logFailure(operation, table, error, options = {}) {
        await this.log({
            operation,
            table,
            recordId: options.recordId,
            userId: options.userId,
            clientInfo: options.clientInfo,
            success: false,
            errorMessage: error.message,
            executionTime: options.executionTime,
            queryText: options.queryText
        });
    }

    /**
     * Log a READ operation
     * @param {string} table - Table name
     * @param {object} options - Additional options
     */
    async logRead(table, options = {}) {
        await this.logSuccess('READ', table, options);
    }

    /**
     * Log a CREATE operation
     * @param {string} table - Table name
     * @param {string|number} recordId - Created record ID
     * @param {object} options - Additional options
     */
    async logCreate(table, recordId, options = {}) {
        await this.logSuccess('CREATE', table, {
            ...options,
            recordId
        });
    }

    /**
     * Log an UPDATE operation
     * @param {string} table - Table name
     * @param {string|number} recordId - Updated record ID
     * @param {object} changes - Before and after values
     * @param {object} options - Additional options
     */
    async logUpdate(table, recordId, changes, options = {}) {
        await this.logSuccess('UPDATE', table, {
            ...options,
            recordId,
            changes
        });
    }

    /**
     * Log a DELETE operation
     * @param {string} table - Table name
     * @param {string|number} recordId - Deleted record ID
     * @param {object} options - Additional options
     */
    async logDelete(table, recordId, options = {}) {
        await this.logSuccess('DELETE', table, {
            ...options,
            recordId
        });
    }

    /**
     * Query audit logs
     * @param {object} filters - Filter criteria
     * @returns {object} Query results
     */
    async queryAuditLogs(filters = {}) {
        const conditions = [];
        const values = [];
        let paramIndex = 1;

        // Build WHERE clause
        if (filters.startDate) {
            conditions.push(`timestamp >= $${paramIndex++}`);
            values.push(new Date(filters.startDate));
        }

        if (filters.endDate) {
            conditions.push(`timestamp <= $${paramIndex++}`);
            values.push(new Date(filters.endDate));
        }

        if (filters.table) {
            conditions.push(`table_name = $${paramIndex++}`);
            values.push(filters.table);
        }

        if (filters.operation) {
            conditions.push(`operation = $${paramIndex++}`);
            values.push(filters.operation);
        }

        if (filters.userId) {
            conditions.push(`user_id = $${paramIndex++}`);
            values.push(filters.userId);
        }

        if (filters.success !== undefined) {
            conditions.push(`success = $${paramIndex++}`);
            values.push(filters.success);
        }

        // Build query
        let query = 'SELECT * FROM audit_logs';
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY timestamp DESC';

        // Add limit
        const limit = filters.limit || 100;
        query += ` LIMIT $${paramIndex++}`;
        values.push(limit);

        // Add offset
        if (filters.offset) {
            query += ` OFFSET $${paramIndex++}`;
            values.push(filters.offset);
        }

        const result = await this.db.query(query, values);
        return result.rows;
    }

    /**
     * Get audit summary statistics
     * @param {object} filters - Filter criteria
     * @returns {object} Summary statistics
     */
    async getAuditSummary(filters = {}) {
        const conditions = [];
        const values = [];
        let paramIndex = 1;

        // Build WHERE clause
        if (filters.startDate) {
            conditions.push(`timestamp >= $${paramIndex++}`);
            values.push(new Date(filters.startDate));
        }

        if (filters.endDate) {
            conditions.push(`timestamp <= $${paramIndex++}`);
            values.push(new Date(filters.endDate));
        }

        if (filters.table) {
            conditions.push(`table_name = $${paramIndex++}`);
            values.push(filters.table);
        }

        let whereClause = '';
        if (conditions.length > 0) {
            whereClause = 'WHERE ' + conditions.join(' AND ');
        }

        // Get summary statistics
        const summaryQuery = `
            SELECT
                COUNT(*) as total_operations,
                COUNT(*) FILTER (WHERE success = true) as successful_operations,
                COUNT(*) FILTER (WHERE success = false) as failed_operations,
                COUNT(DISTINCT table_name) as tables_accessed,
                COUNT(DISTINCT user_id) as unique_users,
                AVG(execution_time_ms) FILTER (WHERE execution_time_ms IS NOT NULL) as avg_execution_time,
                MAX(execution_time_ms) as max_execution_time,
                MIN(timestamp) as earliest_operation,
                MAX(timestamp) as latest_operation
            FROM audit_logs
            ${whereClause}
        `;

        const summaryResult = await this.db.query(summaryQuery, values);
        const summary = summaryResult.rows[0];

        // Get operation breakdown
        const operationQuery = `
            SELECT
                operation,
                COUNT(*) as count,
                COUNT(*) FILTER (WHERE success = true) as successful,
                COUNT(*) FILTER (WHERE success = false) as failed
            FROM audit_logs
            ${whereClause}
            GROUP BY operation
            ORDER BY count DESC
        `;

        const operationResult = await this.db.query(operationQuery, values);

        // Get table breakdown
        const tableQuery = `
            SELECT
                table_name,
                COUNT(*) as count,
                COUNT(*) FILTER (WHERE success = true) as successful,
                COUNT(*) FILTER (WHERE success = false) as failed
            FROM audit_logs
            ${whereClause}
            GROUP BY table_name
            ORDER BY count DESC
            LIMIT 20
        `;

        const tableResult = await this.db.query(tableQuery, values);

        return {
            summary: {
                totalOperations: parseInt(summary.total_operations),
                successfulOperations: parseInt(summary.successful_operations),
                failedOperations: parseInt(summary.failed_operations),
                successRate: summary.total_operations > 0
                    ? (parseInt(summary.successful_operations) / parseInt(summary.total_operations) * 100).toFixed(2) + '%'
                    : '0%',
                tablesAccessed: parseInt(summary.tables_accessed),
                uniqueUsers: parseInt(summary.unique_users),
                avgExecutionTime: summary.avg_execution_time ? parseFloat(summary.avg_execution_time).toFixed(2) + ' ms' : 'N/A',
                maxExecutionTime: summary.max_execution_time ? summary.max_execution_time + ' ms' : 'N/A',
                timeRange: {
                    earliest: summary.earliest_operation,
                    latest: summary.latest_operation
                }
            },
            byOperation: operationResult.rows,
            byTable: tableResult.rows
        };
    }
}
