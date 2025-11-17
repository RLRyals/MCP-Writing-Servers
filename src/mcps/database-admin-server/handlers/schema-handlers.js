// src/mcps/database-admin-server/handlers/schema-handlers.js
// Schema introspection handlers for database-admin-server

import { schemaToolsSchema } from '../schemas/schema-tools-schema.js';
import { schemaCache, SchemaCache } from '../utils/schema-cache.js';
import { RelationshipMapper } from '../utils/relationship-mapper.js';
import { SecurityValidator } from '../utils/security-validator.js';

export class SchemaHandlers {
    constructor(db) {
        this.db = db;
        this.cache = schemaCache;
        this.relationshipMapper = new RelationshipMapper(db);
    }

    /**
     * Get tool schemas for MCP registration
     */
    getSchemaTools() {
        return schemaToolsSchema;
    }

    /**
     * Handler for db_get_schema tool
     * Gets detailed schema information for a table
     */
    async handleGetSchema(params) {
        const { table, refresh_cache = false } = params;

        try {
            // Validate table exists in whitelist
            SecurityValidator.validateTable(table);

            // Check cache first (unless refresh requested)
            const cacheKey = SchemaCache.generateKey(table, 'schema');
            if (!refresh_cache) {
                const cached = this.cache.get(cacheKey);
                if (cached) {
                    return {
                        success: true,
                        cached: true,
                        ...cached
                    };
                }
            }

            // Query information_schema for detailed table information
            const schemaQuery = `
                SELECT
                    c.column_name,
                    c.data_type,
                    c.character_maximum_length,
                    c.numeric_precision,
                    c.numeric_scale,
                    c.is_nullable,
                    c.column_default,
                    c.udt_name,
                    pg_catalog.col_description(
                        (SELECT c2.oid FROM pg_catalog.pg_class c2
                         JOIN pg_catalog.pg_namespace n ON n.oid = c2.relnamespace
                         WHERE c2.relname = c.table_name AND n.nspname = c.table_schema),
                        c.ordinal_position
                    ) AS column_comment
                FROM information_schema.columns c
                WHERE c.table_schema = 'public'
                    AND c.table_name = $1
                ORDER BY c.ordinal_position;
            `;

            const columnsResult = await this.db.query(schemaQuery, [table]);

            if (columnsResult.rows.length === 0) {
                return {
                    success: false,
                    error: `Table '${table}' not found in database`
                };
            }

            // Get constraints (primary keys, unique constraints, etc.)
            const constraintsQuery = `
                SELECT
                    tc.constraint_name,
                    tc.constraint_type,
                    kcu.column_name,
                    tc.is_deferrable,
                    tc.initially_deferred
                FROM information_schema.table_constraints tc
                LEFT JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                WHERE tc.table_schema = 'public'
                    AND tc.table_name = $1
                ORDER BY tc.constraint_type, kcu.ordinal_position;
            `;

            const constraintsResult = await this.db.query(constraintsQuery, [table]);

            // Get indexes
            const indexesQuery = `
                SELECT
                    i.relname AS index_name,
                    a.attname AS column_name,
                    ix.indisunique AS is_unique,
                    ix.indisprimary AS is_primary,
                    am.amname AS index_type
                FROM pg_class t
                JOIN pg_index ix ON t.oid = ix.indrelid
                JOIN pg_class i ON i.oid = ix.indexrelid
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
                JOIN pg_am am ON i.relam = am.oid
                WHERE t.relkind = 'r'
                    AND t.relname = $1
                    AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
                ORDER BY i.relname, a.attnum;
            `;

            const indexesResult = await this.db.query(indexesQuery, [table]);

            // Format the response
            const schema = {
                table,
                columns: columnsResult.rows.map(col => ({
                    name: col.column_name,
                    type: col.data_type,
                    udt_name: col.udt_name,
                    nullable: col.is_nullable === 'YES',
                    default: col.column_default,
                    max_length: col.character_maximum_length,
                    numeric_precision: col.numeric_precision,
                    numeric_scale: col.numeric_scale,
                    comment: col.column_comment
                })),
                constraints: this._groupConstraints(constraintsResult.rows),
                indexes: this._groupIndexes(indexesResult.rows)
            };

            // Cache the result
            this.cache.set(cacheKey, schema);

            return {
                success: true,
                cached: false,
                ...schema
            };

        } catch (error) {
            console.error('[SCHEMA-HANDLERS] Error in handleGetSchema:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handler for db_list_tables tool
     * Lists all accessible tables with metadata
     */
    async handleListTables(params) {
        const { include_system_tables = false, pattern } = params;

        try {
            // Build query based on parameters
            let query = `
                SELECT
                    t.table_name,
                    t.table_type,
                    pg_catalog.obj_description(
                        (SELECT c.oid FROM pg_catalog.pg_class c
                         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                         WHERE c.relname = t.table_name AND n.nspname = t.table_schema),
                        'pg_class'
                    ) AS table_comment,
                    (SELECT COUNT(*) FROM information_schema.columns c
                     WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) AS column_count,
                    pg_catalog.pg_relation_size(
                        (SELECT c.oid FROM pg_catalog.pg_class c
                         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                         WHERE c.relname = t.table_name AND n.nspname = t.table_schema)
                    ) AS table_size_bytes
                FROM information_schema.tables t
                WHERE t.table_schema = 'public'
            `;

            const queryParams = [];
            let paramCount = 1;

            // Filter by pattern if provided
            if (pattern) {
                query += ` AND t.table_name LIKE $${paramCount++}`;
                queryParams.push(pattern);
            }

            // Filter out system tables unless requested
            if (!include_system_tables) {
                query += ` AND t.table_name NOT LIKE 'pg_%' AND t.table_name NOT LIKE 'sql_%'`;
            }

            query += ` ORDER BY t.table_name`;

            const result = await this.db.query(query, queryParams);

            // Filter to only whitelisted tables for security
            const whitelistedTables = result.rows.filter(row => {
                try {
                    SecurityValidator.validateTable(row.table_name);
                    return true;
                } catch (error) {
                    return false;
                }
            });

            return {
                success: true,
                count: whitelistedTables.length,
                total_in_database: result.rows.length,
                tables: whitelistedTables.map(row => ({
                    name: row.table_name,
                    type: row.table_type,
                    comment: row.table_comment,
                    column_count: parseInt(row.column_count),
                    size_bytes: parseInt(row.table_size_bytes) || 0,
                    size_human: this._formatBytes(parseInt(row.table_size_bytes) || 0),
                    is_whitelisted: true
                }))
            };

        } catch (error) {
            console.error('[SCHEMA-HANDLERS] Error in handleListTables:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handler for db_get_relationships tool
     * Maps foreign key relationships for a table
     */
    async handleGetRelationships(params) {
        const { table, depth = 1 } = params;

        try {
            // Validate table exists in whitelist
            SecurityValidator.validateTable(table);

            // Validate depth
            if (depth < 1 || depth > 3) {
                return {
                    success: false,
                    error: 'Depth must be between 1 and 3'
                };
            }

            // Check cache first
            const cacheKey = SchemaCache.generateKey(table, 'relationships', { depth });
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return {
                    success: true,
                    cached: true,
                    ...cached
                };
            }

            // Get relationships using RelationshipMapper
            const relationships = await this.relationshipMapper.getRelationships(table, depth);

            // Cache the result
            this.cache.set(cacheKey, relationships);

            return {
                success: true,
                cached: false,
                ...relationships
            };

        } catch (error) {
            console.error('[SCHEMA-HANDLERS] Error in handleGetRelationships:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handler for db_list_table_columns tool
     * Lightweight column listing for autocomplete/suggestions
     */
    async handleListTableColumns(params) {
        const { table, include_metadata = false } = params;

        try {
            // Validate table exists in whitelist
            SecurityValidator.validateTable(table);

            // Check cache first
            const cacheKey = SchemaCache.generateKey(table, 'columns', { include_metadata });
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return {
                    success: true,
                    cached: true,
                    ...cached
                };
            }

            // Query for column information
            const query = `
                SELECT
                    column_name,
                    data_type,
                    is_nullable,
                    column_default,
                    udt_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                    AND table_name = $1
                ORDER BY ordinal_position;
            `;

            const result = await this.db.query(query, [table]);

            if (result.rows.length === 0) {
                return {
                    success: false,
                    error: `Table '${table}' not found in database`
                };
            }

            // Format response based on include_metadata flag
            const columns = include_metadata
                ? result.rows.map(col => ({
                    name: col.column_name,
                    type: col.data_type,
                    udt_name: col.udt_name,
                    nullable: col.is_nullable === 'YES',
                    default: col.column_default
                }))
                : result.rows.map(col => ({
                    name: col.column_name,
                    type: col.data_type
                }));

            const response = {
                table,
                count: columns.length,
                columns
            };

            // Cache the result
            this.cache.set(cacheKey, response);

            return {
                success: true,
                cached: false,
                ...response
            };

        } catch (error) {
            console.error('[SCHEMA-HANDLERS] Error in handleListTableColumns:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Group constraints by type for better organization
     * @private
     */
    _groupConstraints(rows) {
        const grouped = {
            primary_key: [],
            foreign_key: [],
            unique: [],
            check: []
        };

        for (const row of rows) {
            const constraint = {
                name: row.constraint_name,
                column: row.column_name,
                deferrable: row.is_deferrable === 'YES',
                initially_deferred: row.initially_deferred === 'YES'
            };

            switch (row.constraint_type) {
                case 'PRIMARY KEY':
                    grouped.primary_key.push(constraint);
                    break;
                case 'FOREIGN KEY':
                    grouped.foreign_key.push(constraint);
                    break;
                case 'UNIQUE':
                    grouped.unique.push(constraint);
                    break;
                case 'CHECK':
                    grouped.check.push(constraint);
                    break;
            }
        }

        return grouped;
    }

    /**
     * Group indexes for better organization
     * @private
     */
    _groupIndexes(rows) {
        const indexMap = new Map();

        for (const row of rows) {
            if (!indexMap.has(row.index_name)) {
                indexMap.set(row.index_name, {
                    name: row.index_name,
                    columns: [],
                    unique: row.is_unique,
                    primary: row.is_primary,
                    type: row.index_type
                });
            }

            indexMap.get(row.index_name).columns.push(row.column_name);
        }

        return Array.from(indexMap.values());
    }

    /**
     * Format bytes to human-readable size
     * @private
     */
    _formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }
}
