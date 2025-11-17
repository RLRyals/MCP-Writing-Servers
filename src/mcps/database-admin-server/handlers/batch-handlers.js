// src/mcps/database-admin-server/handlers/batch-handlers.js
// Batch Database Operations Handler - Transactional bulk CRUD operations
// Provides atomic all-or-nothing batch operations with comprehensive validation

import { batchToolsSchema } from '../schemas/batch-tools-schema.js';
import { SecurityValidator } from '../utils/security-validator.js';
import { QueryBuilder } from '../utils/query-builder.js';
import { TransactionManager } from '../utils/transaction-manager.js';

export class BatchHandlers {
    constructor(db) {
        this.db = db;
    }

    // =============================================
    // TOOL DEFINITIONS
    // =============================================
    getBatchTools() {
        return batchToolsSchema;
    }

    // =============================================
    // BATCH INSERT HANDLER
    // =============================================
    async handleBatchInsert(args) {
        try {
            const { table, records } = args;

            // Validate table access
            SecurityValidator.validateTable(table);
            SecurityValidator.validateNotReadOnly(table, 'batch insert into');

            // Validate batch size
            if (!Array.isArray(records)) {
                throw new Error('records must be an array');
            }
            TransactionManager.validateBatchSize(records.length);

            // Validate each record's data
            for (let i = 0; i < records.length; i++) {
                try {
                    SecurityValidator.validateData(table, records[i]);
                } catch (error) {
                    throw new Error(`Invalid data at record index ${i}: ${error.message}`);
                }
            }

            console.error(`[DB-ADMIN] Starting batch insert of ${records.length} records into '${table}'`);

            // Execute batch insert within transaction
            const result = await TransactionManager.executeTransaction(
                this.db,
                async (client) => {
                    return await TransactionManager.batchInsert(client, table, records);
                }
            );

            // Extract IDs from inserted records
            const insertedIds = result.map(record => record.id);

            // Format response
            const response = {
                success: true,
                insertedCount: result.length,
                insertedIds: insertedIds,
                records: result,
                message: `Successfully inserted ${result.length} record(s) into '${table}'`
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: `Batch Insert Results:\n\n` +
                              `Table: ${table}\n` +
                              `Records inserted: ${result.length}\n` +
                              `IDs: [${insertedIds.join(', ')}]\n\n` +
                              JSON.stringify(response, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error('[DB-ADMIN] handleBatchInsert error:', error);

            // Provide context about which operation failed
            let errorMessage = `Batch insert failed: ${error.message}`;

            // Add retry suggestion for transient errors
            if (TransactionManager.isRetryableError(error)) {
                errorMessage += '\n\nThis is a transient error. Please retry the operation.';
            }

            throw new Error(errorMessage);
        }
    }

    // =============================================
    // BATCH UPDATE HANDLER
    // =============================================
    async handleBatchUpdate(args) {
        try {
            const { table, updates, return_records = true } = args;

            // Validate table access
            SecurityValidator.validateTable(table);
            SecurityValidator.validateNotReadOnly(table, 'batch update');

            // Validate updates array
            if (!Array.isArray(updates)) {
                throw new Error('updates must be an array');
            }
            TransactionManager.validateBatchSize(updates.length);

            // Validate each update operation
            for (let i = 0; i < updates.length; i++) {
                const update = updates[i];

                if (!update.where || !update.data) {
                    throw new Error(`Update at index ${i} must have both 'where' and 'data' properties`);
                }

                try {
                    SecurityValidator.validateWhereClause(table, update.where);
                    SecurityValidator.validateData(table, update.data);
                } catch (error) {
                    throw new Error(`Invalid update at index ${i}: ${error.message}`);
                }
            }

            console.error(`[DB-ADMIN] Starting batch update of ${updates.length} operations on '${table}'`);

            // Execute batch update within transaction
            const result = await TransactionManager.executeTransaction(
                this.db,
                async (client) => {
                    return await TransactionManager.batchUpdate(
                        client,
                        table,
                        updates,
                        QueryBuilder.buildUpdateQuery.bind(QueryBuilder)
                    );
                }
            );

            // Format response
            const response = {
                success: true,
                updatedCount: result.length,
                message: `Successfully updated ${result.length} record(s) in '${table}'`
            };

            if (return_records) {
                response.records = result;
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Batch Update Results:\n\n` +
                              `Table: ${table}\n` +
                              `Records updated: ${result.length}\n\n` +
                              JSON.stringify(response, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error('[DB-ADMIN] handleBatchUpdate error:', error);

            let errorMessage = `Batch update failed: ${error.message}`;

            if (TransactionManager.isRetryableError(error)) {
                errorMessage += '\n\nThis is a transient error. Please retry the operation.';
            }

            throw new Error(errorMessage);
        }
    }

    // =============================================
    // BATCH DELETE HANDLER
    // =============================================
    async handleBatchDelete(args) {
        try {
            const { table, conditions, soft_delete } = args;

            // Validate table access
            SecurityValidator.validateTable(table);
            SecurityValidator.validateNotReadOnly(table, 'batch delete from');

            // Validate conditions array
            if (!Array.isArray(conditions)) {
                throw new Error('conditions must be an array');
            }
            TransactionManager.validateBatchSize(conditions.length);

            // Validate each condition
            for (let i = 0; i < conditions.length; i++) {
                try {
                    SecurityValidator.validateWhereClause(table, conditions[i]);
                } catch (error) {
                    throw new Error(`Invalid condition at index ${i}: ${error.message}`);
                }
            }

            // Determine if we should use soft delete
            const useSoftDelete = soft_delete !== false && SecurityValidator.supportsSoftDelete(table);
            const operationType = useSoftDelete ? 'soft deleted' : 'deleted';

            console.error(`[DB-ADMIN] Starting batch ${operationType} of ${conditions.length} conditions on '${table}'`);

            // Execute batch delete within transaction
            const result = await TransactionManager.executeTransaction(
                this.db,
                async (client) => {
                    return await TransactionManager.batchDelete(
                        client,
                        table,
                        conditions,
                        useSoftDelete,
                        useSoftDelete
                            ? QueryBuilder.buildSoftDeleteQuery.bind(QueryBuilder)
                            : QueryBuilder.buildDeleteQuery.bind(QueryBuilder)
                    );
                }
            );

            // Format response
            const response = {
                success: true,
                deletedCount: result.length,
                message: `Successfully ${operationType} ${result.length} record(s) from '${table}'`
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: `Batch Delete Results:\n\n` +
                              `Table: ${table}\n` +
                              `Records ${operationType}: ${result.length}\n` +
                              `Operation: ${useSoftDelete ? 'Soft delete (set deleted_at)' : 'Hard delete (permanent)'}\n\n` +
                              JSON.stringify(response, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error('[DB-ADMIN] handleBatchDelete error:', error);

            let errorMessage = `Batch delete failed: ${error.message}`;

            if (TransactionManager.isRetryableError(error)) {
                errorMessage += '\n\nThis is a transient error. Please retry the operation.';
            }

            throw new Error(errorMessage);
        }
    }
}
