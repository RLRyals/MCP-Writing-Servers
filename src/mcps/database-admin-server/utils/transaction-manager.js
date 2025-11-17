// src/mcps/database-admin-server/utils/transaction-manager.js
// Transaction management utilities for batch database operations
// Provides atomic all-or-nothing semantics with proper rollback

/**
 * TransactionManager class
 * Handles PostgreSQL transactions with proper connection management
 */
export class TransactionManager {
    /**
     * Execute operations within a transaction
     * @param {object} db - Database connection pool
     * @param {function} operations - Async function containing operations to execute
     * @param {number} timeout - Transaction timeout in milliseconds (default: 30000)
     * @returns {Promise<any>} Result from operations function
     */
    static async executeTransaction(db, operations, timeout = 30000) {
        // Get a dedicated client from the pool for this transaction
        const client = await db.pool.connect();

        try {
            // Set statement timeout for this transaction
            await client.query(`SET statement_timeout = ${timeout}`);

            // Begin transaction
            await client.query('BEGIN');

            console.error('[TRANSACTION] Transaction started');

            // Execute operations within transaction context
            const result = await operations(client);

            // Commit transaction if all operations succeeded
            await client.query('COMMIT');
            console.error('[TRANSACTION] Transaction committed successfully');

            return result;
        } catch (error) {
            // Rollback on any error
            try {
                await client.query('ROLLBACK');
                console.error('[TRANSACTION] Transaction rolled back due to error:', error.message);
            } catch (rollbackError) {
                console.error('[TRANSACTION] Error during rollback:', rollbackError.message);
            }

            // Re-throw the original error with enhanced context
            throw this.enhanceTransactionError(error);
        } finally {
            // Always release the client back to the pool
            client.release();
            console.error('[TRANSACTION] Client released back to pool');
        }
    }

    /**
     * Execute a batch insert within a transaction
     * @param {object} client - Database client
     * @param {string} table - Table name
     * @param {array} records - Array of record objects to insert
     * @returns {Promise<object>} Insert results with IDs
     */
    static async batchInsert(client, table, records, queryText) {
        const allResults = [];

        for (const record of records) {
            const columns = Object.keys(record);
            const values = Object.values(record);
            const placeholders = columns.map((_, index) => `$${index + 1}`);

            const query = `
                INSERT INTO ${table} (${columns.join(', ')})
                VALUES (${placeholders.join(', ')})
                RETURNING *
            `.trim();

            const result = await client.query(query, values);
            allResults.push(result.rows[0]);
        }

        return allResults;
    }

    /**
     * Execute batch updates within a transaction
     * @param {object} client - Database client
     * @param {string} table - Table name
     * @param {array} updates - Array of update operations
     * @returns {Promise<object>} Update results
     */
    static async batchUpdate(client, table, updates, buildUpdateQueryFn) {
        const allResults = [];

        for (const update of updates) {
            const { where, data } = update;
            const query = buildUpdateQueryFn(table, data, where);

            const result = await client.query(query.text, query.values);
            allResults.push(...result.rows);
        }

        return allResults;
    }

    /**
     * Execute batch deletes within a transaction
     * @param {object} client - Database client
     * @param {string} table - Table name
     * @param {array} conditions - Array of WHERE conditions
     * @param {boolean} softDelete - Whether to use soft delete
     * @param {function} buildDeleteQueryFn - Function to build delete query
     * @returns {Promise<object>} Delete results
     */
    static async batchDelete(client, table, conditions, softDelete, buildDeleteQueryFn) {
        const allResults = [];

        for (const condition of conditions) {
            const query = buildDeleteQueryFn(table, condition);
            const result = await client.query(query.text, query.values);
            allResults.push(...result.rows);
        }

        return allResults;
    }

    /**
     * Enhance error messages with transaction context
     * @param {Error} error - Original error
     * @returns {Error} Enhanced error
     */
    static enhanceTransactionError(error) {
        // Map PostgreSQL error codes to user-friendly messages
        const errorMessages = {
            '23505': 'Duplicate key violation - a record with this unique value already exists',
            '23503': 'Foreign key violation - referenced record does not exist',
            '23502': 'Not null violation - required field is missing',
            '23514': 'Check constraint violation - data does not meet validation rules',
            '40001': 'Serialization failure - transaction conflict detected, please retry',
            '40P01': 'Deadlock detected - transaction was aborted to resolve deadlock',
            '57014': 'Transaction timeout - operation exceeded time limit',
            '08006': 'Connection failure - database connection was lost',
            '08003': 'Connection does not exist - connection was closed unexpectedly',
            '53300': 'Too many connections - connection pool exhausted'
        };

        if (error.code && errorMessages[error.code]) {
            const enhancedError = new Error(`Transaction failed: ${errorMessages[error.code]}`);
            enhancedError.code = error.code;
            enhancedError.originalError = error;
            return enhancedError;
        }

        // Return original error if no specific mapping
        return error;
    }

    /**
     * Validate batch size
     * @param {number} size - Batch size
     * @param {number} min - Minimum allowed (default: 1)
     * @param {number} max - Maximum allowed (default: 1000)
     * @throws {Error} If batch size is invalid
     */
    static validateBatchSize(size, min = 1, max = 1000) {
        if (!Number.isInteger(size) || size < min || size > max) {
            throw new Error(
                `Batch size must be between ${min} and ${max}. Got: ${size}`
            );
        }
    }

    /**
     * Check if error is retryable (transient failure)
     * @param {Error} error - Error to check
     * @returns {boolean} True if error is retryable
     */
    static isRetryableError(error) {
        const retryableCodes = new Set([
            '40001', // Serialization failure
            '40P01', // Deadlock
            '08006', // Connection failure
            '08003', // Connection does not exist
            '53300'  // Too many connections
        ]);

        return error.code && retryableCodes.has(error.code);
    }
}
