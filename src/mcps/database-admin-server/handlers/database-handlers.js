// src/mcps/database-admin-server/handlers/database-handlers.js
// Core Database Admin Handler - Secure CRUD operations across all database tables
// Designed for AI assistants to safely manage database records with comprehensive validation

import { databaseToolsSchema } from '../schemas/database-tools-schema.js';
import { SecurityValidator } from '../utils/security-validator.js';
import { QueryBuilder } from '../utils/query-builder.js';
import { AccessControl } from '../utils/access-control.js';
import { AuditLogger } from '../utils/audit-logger.js';
import { DataValidator } from '../utils/data-validator.js';

export class DatabaseHandlers {
    constructor(db) {
        this.db = db;
        this.auditLogger = new AuditLogger(db);
        this.dataValidator = new DataValidator(db);
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
        const startTime = Date.now();
        const { table, columns, where, order_by, limit, offset } = args;

        try {
            // Validate table access
            SecurityValidator.validateTable(table);

            // Access control check
            AccessControl.validateTableAccess(table, 'READ');

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

            // Audit log success
            const executionTime = Date.now() - startTime;
            await this.auditLogger.logRead(table, {
                executionTime,
                queryText: query.text
            });

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

            // Audit log failure
            const executionTime = Date.now() - startTime;
            await this.auditLogger.logFailure('READ', table, error, { executionTime });

            throw new Error(`Failed to query records: ${error.message}`);
        }
    }

    // =============================================
    // INSERT RECORD HANDLER
    // =============================================
    async handleInsertRecord(args) {
        const startTime = Date.now();
        const { table, data } = args;

        try {
            // Validate table is not read-only
            SecurityValidator.validateTable(table);
            SecurityValidator.validateNotReadOnly(table, 'insert into');

            // Access control check
            AccessControl.validateTableAccess(table, 'INSERT');

            // Data validation
            const validationResult = await this.dataValidator.validateComprehensive(table, data, 'insert');
            if (!validationResult.valid) {
                const validationError = new Error('Validation failed');
                validationError.code = 'DB_400_VALIDATION';
                validationError.details = validationResult.errors;
                throw validationError;
            }

            // Build and execute insert query
            const query = QueryBuilder.buildInsertQuery(table, data);

            console.error(`[DB-ADMIN] Executing insert on table '${table}':`, query.text);

            const result = await this.db.query(query.text, query.values);
            const insertedRecord = result.rows[0];

            // Audit log success
            const executionTime = Date.now() - startTime;
            await this.auditLogger.logCreate(table, insertedRecord.id, {
                executionTime,
                queryText: query.text
            });

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

            // Audit log failure
            const executionTime = Date.now() - startTime;
            await this.auditLogger.logFailure('CREATE', table, error, { executionTime });

            // Handle validation errors
            if (error.code === 'DB_400_VALIDATION') {
                throw new Error(
                    `Validation failed:\n${error.details.map(d => `  - ${d}`).join('\n')}`
                );
            }

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
        const startTime = Date.now();
        const { table, data, where } = args;

        try {
            // Validate table is not read-only
            SecurityValidator.validateTable(table);
            SecurityValidator.validateNotReadOnly(table, 'update');

            // Access control check
            AccessControl.validateTableAccess(table, 'UPDATE');

            // Ensure WHERE clause is provided for safety
            if (!where || Object.keys(where).length === 0) {
                throw new Error('WHERE clause is required for update operations to prevent accidental mass updates');
            }

            // Data validation (for update operation)
            const validationResult = await this.dataValidator.validateRecordData(table, data, null, 'update');
            if (!validationResult.valid) {
                const validationError = new Error('Validation failed');
                validationError.code = 'DB_400_VALIDATION';
                validationError.details = validationResult.errors;
                throw validationError;
            }

            // Build and execute update query
            const query = QueryBuilder.buildUpdateQuery(table, data, where);

            console.error(`[DB-ADMIN] Executing update on table '${table}':`, query.text);

            const result = await this.db.query(query.text, query.values);

            if (result.rows.length === 0) {
                // Audit log (no records found is still a successful operation)
                const executionTime = Date.now() - startTime;
                await this.auditLogger.logSuccess('UPDATE', table, {
                    executionTime,
                    queryText: query.text
                });

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

            // Audit log success
            const executionTime = Date.now() - startTime;
            for (const record of result.rows) {
                await this.auditLogger.logUpdate(table, record.id, { old: {}, new: data }, {
                    executionTime,
                    queryText: query.text
                });
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

            // Audit log failure
            const executionTime = Date.now() - startTime;
            await this.auditLogger.logFailure('UPDATE', table, error, { executionTime });

            // Handle validation errors
            if (error.code === 'DB_400_VALIDATION') {
                throw new Error(
                    `Validation failed:\n${error.details.map(d => `  - ${d}`).join('\n')}`
                );
            }

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
        const startTime = Date.now();
        const { table, where, soft_delete } = args;

        try {
            // Validate table is not read-only
            SecurityValidator.validateTable(table);
            SecurityValidator.validateNotReadOnly(table, 'delete from');

            // Access control check
            AccessControl.validateTableAccess(table, 'DELETE');

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
                // Audit log (no records found is still a successful operation)
                const executionTime = Date.now() - startTime;
                await this.auditLogger.logSuccess('DELETE', table, {
                    executionTime,
                    queryText: query.text
                });

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

            // Audit log success
            const executionTime = Date.now() - startTime;
            for (const record of result.rows) {
                await this.auditLogger.logDelete(table, record.id, {
                    executionTime,
                    queryText: query.text
                });
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

            // Audit log failure
            const executionTime = Date.now() - startTime;
            await this.auditLogger.logFailure('DELETE', table, error, { executionTime });

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
