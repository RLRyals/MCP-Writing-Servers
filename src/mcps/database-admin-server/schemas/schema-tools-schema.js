// src/mcps/database-admin-server/schemas/schema-tools-schema.js
// Schema introspection tool definitions for MCP

export const schemaToolsSchema = [
    {
        name: 'db_get_schema',
        description: 'Get detailed schema information for a table including columns, data types, constraints, and indexes. Results are cached for 5 minutes for performance.',
        inputSchema: {
            type: 'object',
            properties: {
                table: {
                    type: 'string',
                    description: 'Name of the table to introspect (e.g., "authors", "books", "chapters")',
                    pattern: '^[a-z_]+$'
                },
                refresh_cache: {
                    type: 'boolean',
                    description: 'Optional: Force refresh the schema cache. Default is false.',
                    default: false
                }
            },
            required: ['table']
        }
    },
    {
        name: 'db_list_tables',
        description: 'List all accessible tables in the database with metadata such as row count estimates and table type. System tables are filtered by default.',
        inputSchema: {
            type: 'object',
            properties: {
                include_system_tables: {
                    type: 'boolean',
                    description: 'Optional: Include system/internal tables in the results. Default is false.',
                    default: false
                },
                pattern: {
                    type: 'string',
                    description: 'Optional: Filter tables by name pattern (SQL LIKE syntax, e.g., "book%" or "%_arcs")'
                }
            },
            required: []
        }
    },
    {
        name: 'db_get_relationships',
        description: 'Map foreign key relationships for a table, showing which tables it references (parent tables) and which tables reference it (child tables). Supports multi-hop relationship discovery.',
        inputSchema: {
            type: 'object',
            properties: {
                table: {
                    type: 'string',
                    description: 'Name of the table to get relationships for (e.g., "books", "characters")',
                    pattern: '^[a-z_]+$'
                },
                depth: {
                    type: 'integer',
                    description: 'Optional: How many levels of relationships to traverse (1-3). Default is 1.',
                    minimum: 1,
                    maximum: 3,
                    default: 1
                }
            },
            required: ['table']
        }
    },
    {
        name: 'db_list_table_columns',
        description: 'Get a lightweight list of column names and types for a table. Useful for autocomplete, suggestions, or quick reference. Faster than db_get_schema.',
        inputSchema: {
            type: 'object',
            properties: {
                table: {
                    type: 'string',
                    description: 'Name of the table to list columns for (e.g., "scenes", "characters")',
                    pattern: '^[a-z_]+$'
                },
                include_metadata: {
                    type: 'boolean',
                    description: 'Optional: Include additional metadata like nullable status and default values. Default is false.',
                    default: false
                }
            },
            required: ['table']
        }
    }
];
