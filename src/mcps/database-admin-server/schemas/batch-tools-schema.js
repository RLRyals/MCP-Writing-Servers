// src/mcps/database-admin-server/schemas/batch-tools-schema.js
// Batch operation tool schema definitions for Database Admin MCP Server
// Provides transactional bulk CRUD operations with atomic all-or-nothing semantics

export const batchToolsSchema = [
    {
        name: 'db_batch_insert',
        description: 'Insert multiple records (1-1000) into a table in a single atomic transaction. All records are inserted or none are (all-or-nothing). Returns all inserted IDs.',
        inputSchema: {
            type: 'object',
            properties: {
                table: {
                    type: 'string',
                    description: 'Table name to insert into (must be whitelisted and not read-only)'
                },
                records: {
                    type: 'array',
                    items: {
                        type: 'object',
                        description: 'Record data as key-value pairs',
                        additionalProperties: true
                    },
                    minItems: 1,
                    maxItems: 1000,
                    description: 'Array of records to insert (1-1000 records). Each record must have whitelisted columns for the table.'
                }
            },
            required: ['table', 'records']
        }
    },
    {
        name: 'db_batch_update',
        description: 'Update multiple sets of records in a single atomic transaction. Each update can have different WHERE conditions and data. All updates succeed or all fail (all-or-nothing).',
        inputSchema: {
            type: 'object',
            properties: {
                table: {
                    type: 'string',
                    description: 'Table name to update (must be whitelisted and not read-only)'
                },
                updates: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            where: {
                                type: 'object',
                                description: 'WHERE clause conditions for this update. Same format as db_query_records.',
                                additionalProperties: true
                            },
                            data: {
                                type: 'object',
                                description: 'Fields to update for records matching the WHERE clause.',
                                additionalProperties: true
                            }
                        },
                        required: ['where', 'data']
                    },
                    minItems: 1,
                    maxItems: 1000,
                    description: 'Array of update operations (1-1000 operations). Each operation specifies WHERE conditions and data to update.'
                },
                return_records: {
                    type: 'boolean',
                    description: 'If true, returns all updated records. If false, returns only count (optional, default: true)'
                }
            },
            required: ['table', 'updates']
        }
    },
    {
        name: 'db_batch_delete',
        description: 'Delete multiple sets of records in a single atomic transaction. Each delete can have different WHERE conditions. All deletes succeed or all fail (all-or-nothing). Supports soft delete.',
        inputSchema: {
            type: 'object',
            properties: {
                table: {
                    type: 'string',
                    description: 'Table name to delete from (must be whitelisted and not read-only)'
                },
                conditions: {
                    type: 'array',
                    items: {
                        type: 'object',
                        description: 'WHERE clause conditions for this delete operation. Same format as db_query_records.',
                        additionalProperties: true
                    },
                    minItems: 1,
                    maxItems: 1000,
                    description: 'Array of WHERE conditions (1-1000 conditions). Each condition identifies records to delete.'
                },
                soft_delete: {
                    type: 'boolean',
                    description: 'If true, sets deleted_at timestamp instead of removing records (optional, default: true if table has deleted_at column)'
                }
            },
            required: ['table', 'conditions']
        }
    }
];
