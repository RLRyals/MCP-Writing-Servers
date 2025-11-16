// src/mcps/database-admin-server/handlers/database-handlers.js
// Core Database Admin Handler - Secure CRUD operations across all database tables
// Designed for AI assistants to safely manage database records with comprehensive validation

import { databaseToolsSchema } from '../schemas/database-tools-schema.js';
import { SecurityValidator } from '../utils/security-validator.js';
import { QueryBuilder } from '../utils/query-builder.js';

export class DatabaseHandlers {
    constructor(db) {
        this.db = db;
    }

    // =============================================
    // TOOL DEFINITIONS
    // =============================================
    getDatabaseTools() {
        return databaseToolsSchema;
    }

    // =============================================
    // QUERY RECORDS HANDLER
    // =============================================
    async handleQueryRecords(args) {
        try {
            const { table, columns, where, order_by, limit, offset } = args;

            // Validate table access
            SecurityValidator.validateTable(table);

            // Build and execute query
            const query = QueryBuilder.buildSelectQuery({
                table,
                columns: columns || null,
                where: where || null,
                orderBy: order_by || null,
                limit,
                offset
            });

            console.error(`[DB-ADMIN] Executing query on table '${table}':`, query.text);

            const result = await this.db.query(query.text, query.values);

            // Also get total count if pagination is used
            let totalCount = result.rows.length;
            if (limit || offset) {
                const countQuery = QueryBuilder.buildCountQuery(table, where || null);
                const countResult = await this.db.query(countQuery.text, countQuery.values);
                totalCount = parseInt(countResult.rows[0].count, 10);
            }

            // Format response
            const response = {
                table,
                count: result.rows.length,
                total_count: totalCount,
                records: result.rows
            };

            if (limit) response.limit = limit;
            if (offset) response.offset = offset;

            return {
                content: [
                    {
                        type: 'text',
                        text: `Query Results from '${table}':\n\n` +
                              `Records returned: ${result.rows.length}` +
                              (totalCount !== result.rows.length ? ` (Total: ${totalCount})` : '') + '\n\n' +
                              JSON.stringify(response, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error('[DB-ADMIN] handleQueryRecords error:', error);
            throw new Error(`Failed to query records: ${error.message}`);
        }
    }

    // =============================================
    // INSERT RECORD HANDLER
    // =============================================
    async handleInsertRecord(args) {
        try {
            const { table, data } = args;

            // Validate table is not read-only
            SecurityValidator.validateTable(table);
            SecurityValidator.validateNotReadOnly(table, 'insert into');

            // Build and execute insert query
            const query = QueryBuilder.buildInsertQuery(table, data);

            console.error(`[DB-ADMIN] Executing insert on table '${table}':`, query.text);

            const result = await this.db.query(query.text, query.values);
            const insertedRecord = result.rows[0];

            return {
                content: [
                    {
                        type: 'text',
                        text: `Successfully inserted record into '${table}':\n\n` +
                              JSON.stringify(insertedRecord, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error('[DB-ADMIN] handleInsertRecord error:', error);

            // Provide helpful error messages for common database errors
            if (error.code === '23505') {
                throw new Error(`Failed to insert record: Duplicate key violation. A record with this unique value already exists.`);
            } else if (error.code === '23503') {
                throw new Error(`Failed to insert record: Foreign key violation. Referenced record does not exist.`);
            } else if (error.code === '23502') {
                throw new Error(`Failed to insert record: Not null violation. Required field is missing.`);
            } else {
                throw new Error(`Failed to insert record: ${error.message}`);
            }
        }
    }

    // =============================================
    // UPDATE RECORDS HANDLER
    // =============================================
    async handleUpdateRecords(args) {
        try {
            const { table, data, where } = args;

            // Validate table is not read-only
            SecurityValidator.validateTable(table);
            SecurityValidator.validateNotReadOnly(table, 'update');

            // Ensure WHERE clause is provided for safety
            if (!where || Object.keys(where).length === 0) {
                throw new Error('WHERE clause is required for update operations to prevent accidental mass updates');
            }

            // Build and execute update query
            const query = QueryBuilder.buildUpdateQuery(table, data, where);

            console.error(`[DB-ADMIN] Executing update on table '${table}':`, query.text);

            const result = await this.db.query(query.text, query.values);

            if (result.rows.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No records found in '${table}' matching the WHERE conditions.\n\n` +
                                  `WHERE clause: ${JSON.stringify(where, null, 2)}`
                        }
                    ]
                };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Successfully updated ${result.rows.length} record(s) in '${table}':\n\n` +
                              JSON.stringify(result.rows, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error('[DB-ADMIN] handleUpdateRecords error:', error);

            // Provide helpful error messages for common database errors
            if (error.code === '23505') {
                throw new Error(`Failed to update records: Duplicate key violation. Update would create duplicate unique value.`);
            } else if (error.code === '23503') {
                throw new Error(`Failed to update records: Foreign key violation. Referenced record does not exist.`);
            } else {
                throw new Error(`Failed to update records: ${error.message}`);
            }
        }
    }

    // =============================================
    // DELETE RECORDS HANDLER
    // =============================================
    async handleDeleteRecords(args) {
        try {
            const { table, where, soft_delete } = args;

            // Validate table is not read-only
            SecurityValidator.validateTable(table);
            SecurityValidator.validateNotReadOnly(table, 'delete from');

            // Ensure WHERE clause is provided for safety
            if (!where || Object.keys(where).length === 0) {
                throw new Error('WHERE clause is required for delete operations to prevent accidental mass deletions');
            }

            // Determine if we should use soft delete
            const useSoftDelete = soft_delete !== false && SecurityValidator.supportsSoftDelete(table);

            let query;
            let operationType;

            if (useSoftDelete) {
                query = QueryBuilder.buildSoftDeleteQuery(table, where);
                operationType = 'soft deleted';
            } else {
                query = QueryBuilder.buildDeleteQuery(table, where);
                operationType = 'deleted';
            }

            console.error(`[DB-ADMIN] Executing ${operationType} on table '${table}':`, query.text);

            const result = await this.db.query(query.text, query.values);

            if (result.rows.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No records found in '${table}' matching the WHERE conditions.\n\n` +
                                  `WHERE clause: ${JSON.stringify(where, null, 2)}`
                        }
                    ]
                };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Successfully ${operationType} ${result.rows.length} record(s) from '${table}':\n\n` +
                              JSON.stringify(result.rows, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error('[DB-ADMIN] handleDeleteRecords error:', error);

            // Provide helpful error messages for common database errors
            if (error.code === '23503') {
                throw new Error(`Failed to delete records: Foreign key violation. Other records reference this record.`);
            } else {
                throw new Error(`Failed to delete records: ${error.message}`);
            }
        }
    }

    // =============================================
    // UTILITY METHODS
    // =============================================

    /**
     * Get list of available tables
     * This is a helper method that could be exposed as a tool if needed
     */
    async getAvailableTables() {
        const tables = SecurityValidator.getWhitelistedTables();
        return {
            tables: tables.sort(),
            count: tables.length
        };
    }

    /**
     * Get table schema (columns)
     * This is a helper method that could be exposed as a tool if needed
     */
    async getTableSchema(table) {
        SecurityValidator.validateTable(table);
        const columns = SecurityValidator.getWhitelistedColumns(table);

        return {
            table,
            columns: columns.sort(),
            count: columns.length,
            supports_soft_delete: SecurityValidator.supportsSoftDelete(table),
            read_only: SecurityValidator.READ_ONLY_TABLES.has(table)
        };
    }
}
