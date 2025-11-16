// src/mcps/database-admin-server/schemas/database-tools-schema.js
// Tool schema definitions for Database Admin MCP Server
// Provides CRUD operations across database tables with security and validation

export const databaseToolsSchema = [
    {
        name: 'db_query_records',
        description: 'Query database records with filtering, pagination, and sorting. Supports complex WHERE conditions and multiple sort orders.',
        inputSchema: {
            type: 'object',
            properties: {
                table: {
                    type: 'string',
                    description: 'Table name to query (must be whitelisted)'
                },
                columns: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Columns to select (optional - defaults to all columns). All columns must be whitelisted for the table.'
                },
                where: {
                    type: 'object',
                    description: 'WHERE clause conditions as key-value pairs. Supports: exact match (value), operators ($gt, $lt, $gte, $lte, $ne, $like, $in, $null)',
                    additionalProperties: true
                },
                order_by: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            column: { type: 'string', description: 'Column to sort by' },
                            direction: { type: 'string', enum: ['ASC', 'DESC'], description: 'Sort direction' }
                        },
                        required: ['column']
                    },
                    description: 'Sort order (optional). Example: [{"column": "created_at", "direction": "DESC"}]'
                },
                limit: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 1000,
                    description: 'Maximum number of records to return (optional, max 1000)'
                },
                offset: {
                    type: 'integer',
                    minimum: 0,
                    description: 'Number of records to skip for pagination (optional)'
                }
            },
            required: ['table']
        }
    },
    {
        name: 'db_insert_record',
        description: 'Insert a new record into a database table with field validation. Supports all standard PostgreSQL data types.',
        inputSchema: {
            type: 'object',
            properties: {
                table: {
                    type: 'string',
                    description: 'Table name to insert into (must be whitelisted)'
                },
                data: {
                    type: 'object',
                    description: 'Record data as key-value pairs. Keys must be whitelisted columns for the table.',
                    additionalProperties: true
                }
            },
            required: ['table', 'data']
        }
    },
    {
        name: 'db_update_records',
        description: 'Update existing records in a database table. Supports partial updates and WHERE conditions to target specific records.',
        inputSchema: {
            type: 'object',
            properties: {
                table: {
                    type: 'string',
                    description: 'Table name to update (must be whitelisted)'
                },
                data: {
                    type: 'object',
                    description: 'Fields to update as key-value pairs. Only specified fields will be updated (partial update).',
                    additionalProperties: true
                },
                where: {
                    type: 'object',
                    description: 'WHERE clause conditions to identify records to update. Same format as db_query_records.',
                    additionalProperties: true
                }
            },
            required: ['table', 'data', 'where']
        }
    },
    {
        name: 'db_delete_records',
        description: 'Delete records from a database table. Supports soft-delete (setting deleted_at) or hard delete.',
        inputSchema: {
            type: 'object',
            properties: {
                table: {
                    type: 'string',
                    description: 'Table name to delete from (must be whitelisted)'
                },
                where: {
                    type: 'object',
                    description: 'WHERE clause conditions to identify records to delete. Required for safety.',
                    additionalProperties: true
                },
                soft_delete: {
                    type: 'boolean',
                    description: 'If true, sets deleted_at timestamp instead of removing records (optional, default: true if table has deleted_at column)'
                }
            },
            required: ['table', 'where']
        }
    }
];
