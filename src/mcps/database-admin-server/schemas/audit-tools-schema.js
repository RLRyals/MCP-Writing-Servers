// src/mcps/database-admin-server/schemas/audit-tools-schema.js
// Audit Log Tools Schema Definitions

export const auditToolsSchema = [
    {
        name: 'db_query_audit_logs',
        description: `Query audit logs to review database operations history.

Allows filtering by:
- Date range (start_date, end_date)
- Table name
- Operation type (CREATE, READ, UPDATE, DELETE, BATCH_INSERT, BATCH_UPDATE, BATCH_DELETE)
- User ID
- Success/failure status
- Pagination (limit, offset)

Use cases:
- Compliance auditing
- Security investigations
- Performance monitoring
- Troubleshooting errors
- User activity tracking`,
        inputSchema: {
            type: 'object',
            properties: {
                start_date: {
                    type: 'string',
                    description: 'Start date for filtering logs (ISO 8601 format, e.g., "2025-11-01T00:00:00Z")'
                },
                end_date: {
                    type: 'string',
                    description: 'End date for filtering logs (ISO 8601 format, e.g., "2025-11-17T23:59:59Z")'
                },
                table: {
                    type: 'string',
                    description: 'Filter by table name (e.g., "books", "characters")'
                },
                operation: {
                    type: 'string',
                    enum: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'BATCH_INSERT', 'BATCH_UPDATE', 'BATCH_DELETE'],
                    description: 'Filter by operation type'
                },
                user_id: {
                    type: 'string',
                    description: 'Filter by user ID who performed the operation'
                },
                success: {
                    type: 'boolean',
                    description: 'Filter by success status (true for successful operations, false for failures)'
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of logs to return (default: 100, max: 1000)',
                    minimum: 1,
                    maximum: 1000,
                    default: 100
                },
                offset: {
                    type: 'number',
                    description: 'Number of logs to skip for pagination (default: 0)',
                    minimum: 0,
                    default: 0
                }
            },
            required: []
        }
    },
    {
        name: 'db_get_audit_summary',
        description: `Get comprehensive audit summary statistics.

Provides aggregated statistics including:
- Total operations count
- Success/failure rates
- Tables accessed
- Unique users
- Average and max execution times
- Operations breakdown by type
- Top tables by activity

Useful for:
- High-level compliance reporting
- Performance analysis
- System health monitoring
- Usage analytics`,
        inputSchema: {
            type: 'object',
            properties: {
                start_date: {
                    type: 'string',
                    description: 'Start date for summary period (ISO 8601 format, e.g., "2025-11-01T00:00:00Z")'
                },
                end_date: {
                    type: 'string',
                    description: 'End date for summary period (ISO 8601 format, e.g., "2025-11-17T23:59:59Z")'
                },
                table: {
                    type: 'string',
                    description: 'Optional: Limit summary to specific table'
                }
            },
            required: []
        }
    }
];
