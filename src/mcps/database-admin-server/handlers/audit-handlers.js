// src/mcps/database-admin-server/handlers/audit-handlers.js
// Audit Log Query Handlers
// Provides tools to query and analyze audit logs

import { auditToolsSchema } from '../schemas/audit-tools-schema.js';
import { AuditLogger } from '../utils/audit-logger.js';

export class AuditHandlers {
    constructor(db) {
        this.db = db;
        this.auditLogger = new AuditLogger(db);
    }

    // =============================================
    // TOOL DEFINITIONS
    // =============================================
    getAuditTools() {
        return auditToolsSchema;
    }

    // =============================================
    // QUERY AUDIT LOGS HANDLER
    // =============================================
    async handleQueryAuditLogs(args) {
        try {
            const {
                start_date,
                end_date,
                table,
                operation,
                user_id,
                success,
                limit = 100,
                offset = 0
            } = args;

            console.error(`[DB-ADMIN] Querying audit logs with filters:`, {
                start_date,
                end_date,
                table,
                operation,
                user_id,
                success,
                limit,
                offset
            });

            // Query audit logs using the audit logger
            const logs = await this.auditLogger.queryAuditLogs({
                startDate: start_date,
                endDate: end_date,
                table,
                operation,
                userId: user_id,
                success,
                limit,
                offset
            });

            // Format response
            const response = {
                count: logs.length,
                limit,
                offset,
                logs: logs.map(log => ({
                    id: log.id,
                    timestamp: log.timestamp,
                    operation: log.operation,
                    table: log.table_name,
                    recordId: log.record_id,
                    userId: log.user_id,
                    success: log.success,
                    errorMessage: log.error_message,
                    executionTime: log.execution_time_ms,
                    changes: log.changes
                }))
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: `Audit Log Query Results:\n\n` +
                              `Found ${logs.length} audit log entries\n\n` +
                              JSON.stringify(response, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error('[DB-ADMIN] handleQueryAuditLogs error:', error);
            throw new Error(`Failed to query audit logs: ${error.message}`);
        }
    }

    // =============================================
    // GET AUDIT SUMMARY HANDLER
    // =============================================
    async handleGetAuditSummary(args) {
        try {
            const {
                start_date,
                end_date,
                table
            } = args;

            console.error(`[DB-ADMIN] Generating audit summary with filters:`, {
                start_date,
                end_date,
                table
            });

            // Get audit summary using the audit logger
            const summary = await this.auditLogger.getAuditSummary({
                startDate: start_date,
                endDate: end_date,
                table
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: `Audit Summary:\n\n` +
                              `=== Overall Statistics ===\n` +
                              `Total Operations: ${summary.summary.totalOperations}\n` +
                              `Successful: ${summary.summary.successfulOperations}\n` +
                              `Failed: ${summary.summary.failedOperations}\n` +
                              `Success Rate: ${summary.summary.successRate}\n` +
                              `Tables Accessed: ${summary.summary.tablesAccessed}\n` +
                              `Unique Users: ${summary.summary.uniqueUsers}\n` +
                              `Average Execution Time: ${summary.summary.avgExecutionTime}\n` +
                              `Max Execution Time: ${summary.summary.maxExecutionTime}\n\n` +
                              `Time Range: ${summary.summary.timeRange.earliest} to ${summary.summary.timeRange.latest}\n\n` +
                              `=== Operations Breakdown ===\n` +
                              summary.byOperation.map(op =>
                                  `${op.operation}: ${op.count} total (${op.successful} successful, ${op.failed} failed)`
                              ).join('\n') + '\n\n' +
                              `=== Top Tables ===\n` +
                              summary.byTable.map(tbl =>
                                  `${tbl.table_name}: ${tbl.count} operations (${tbl.successful} successful, ${tbl.failed} failed)`
                              ).join('\n') + '\n\n' +
                              `Full details:\n` +
                              JSON.stringify(summary, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error('[DB-ADMIN] handleGetAuditSummary error:', error);
            throw new Error(`Failed to get audit summary: ${error.message}`);
        }
    }
}
