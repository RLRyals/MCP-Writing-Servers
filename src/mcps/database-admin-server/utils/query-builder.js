// src/mcps/database-admin-server/utils/query-builder.js
// Safe SQL query builder using ONLY parameterized queries
// SECURITY: Never uses string concatenation - all values are parameterized

import { SecurityValidator } from './security-validator.js';

/**
 * QueryBuilder class
 * Builds safe parameterized SQL queries with comprehensive operator support
 */
export class QueryBuilder {
    /**
     * Build a SELECT query with filtering, sorting, and pagination
     * @param {object} options - Query options
     * @returns {object} { text: SQL query, values: parameter values }
     */
    static buildSelectQuery(options) {
        const { table, columns, where, orderBy, limit, offset } = options;

        // Validate inputs
        SecurityValidator.validateTable(table);

        // Build column list
        let columnList = '*';
        if (columns && columns.length > 0) {
            SecurityValidator.validateColumns(table, columns);
            columnList = columns.join(', ');
        }

        // Start building query
        let query = `SELECT ${columnList} FROM ${table}`;
        const values = [];
        let paramCount = 1;

        // Build WHERE clause if provided
        if (where && Object.keys(where).length > 0) {
            const { clause, params, nextParam } = this.buildWhereClause(table, where, paramCount);
            query += ` WHERE ${clause}`;
            values.push(...params);
            paramCount = nextParam;
        }

        // Build ORDER BY clause if provided
        if (orderBy && orderBy.length > 0) {
            const validatedOrderBy = SecurityValidator.validateOrderBy(table, orderBy);
            const orderClauses = validatedOrderBy.map(order =>
                `${order.column} ${order.direction}`
            );
            query += ` ORDER BY ${orderClauses.join(', ')}`;
        }

        // Add LIMIT and OFFSET if provided
        const pagination = SecurityValidator.validatePagination(limit, offset);
        if (pagination.limit) {
            query += ` LIMIT $${paramCount++}`;
            values.push(pagination.limit);
        }
        if (pagination.offset) {
            query += ` OFFSET $${paramCount++}`;
            values.push(pagination.offset);
        }

        return { text: query, values };
    }

    /**
     * Build an INSERT query
     * @param {string} table - Table name
     * @param {object} data - Data to insert
     * @returns {object} { text: SQL query, values: parameter values }
     */
    static buildInsertQuery(table, data) {
        // Validate inputs
        SecurityValidator.validateTable(table);
        SecurityValidator.validateData(table, data);

        const columns = Object.keys(data);
        const values = Object.values(data);

        // Build parameterized placeholders ($1, $2, etc.)
        const placeholders = columns.map((_, index) => `$${index + 1}`);

        const query = `
            INSERT INTO ${table} (${columns.join(', ')})
            VALUES (${placeholders.join(', ')})
            RETURNING *
        `.trim();

        return { text: query, values };
    }

    /**
     * Build an UPDATE query
     * @param {string} table - Table name
     * @param {object} data - Data to update
     * @param {object} where - WHERE conditions
     * @returns {object} { text: SQL query, values: parameter values }
     */
    static buildUpdateQuery(table, data, where) {
        // Validate inputs
        SecurityValidator.validateTable(table);
        SecurityValidator.validateData(table, data);
        SecurityValidator.validateWhereClause(table, where);

        const columns = Object.keys(data);
        const values = Object.values(data);
        let paramCount = 1;

        // Build SET clause with parameterized values
        const setClauses = columns.map((column) => {
            return `${column} = $${paramCount++}`;
        });

        // Always update updated_at if the column exists
        const whitelistedColumns = SecurityValidator.getWhitelistedColumns(table);
        if (whitelistedColumns.includes('updated_at')) {
            setClauses.push('updated_at = CURRENT_TIMESTAMP');
        }

        // Build WHERE clause
        const { clause: whereClause, params: whereParams } = this.buildWhereClause(table, where, paramCount);

        const query = `
            UPDATE ${table}
            SET ${setClauses.join(', ')}
            WHERE ${whereClause}
            RETURNING *
        `.trim();

        return {
            text: query,
            values: [...values, ...whereParams]
        };
    }

    /**
     * Build a DELETE query (hard delete)
     * @param {string} table - Table name
     * @param {object} where - WHERE conditions
     * @returns {object} { text: SQL query, values: parameter values }
     */
    static buildDeleteQuery(table, where) {
        // Validate inputs
        SecurityValidator.validateTable(table);
        SecurityValidator.validateWhereClause(table, where);

        // Build WHERE clause
        const { clause: whereClause, params } = this.buildWhereClause(table, where, 1);

        const query = `
            DELETE FROM ${table}
            WHERE ${whereClause}
            RETURNING *
        `.trim();

        return { text: query, values: params };
    }

    /**
     * Build a soft DELETE query (sets deleted_at)
     * @param {string} table - Table name
     * @param {object} where - WHERE conditions
     * @returns {object} { text: SQL query, values: parameter values }
     */
    static buildSoftDeleteQuery(table, where) {
        // Validate inputs
        SecurityValidator.validateTable(table);
        SecurityValidator.validateWhereClause(table, where);

        // Verify table supports soft delete
        if (!SecurityValidator.supportsSoftDelete(table)) {
            throw new Error(`Table '${table}' does not support soft delete`);
        }

        // Build WHERE clause
        const { clause: whereClause, params } = this.buildWhereClause(table, where, 1);

        const query = `
            UPDATE ${table}
            SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE ${whereClause} AND deleted_at IS NULL
            RETURNING *
        `.trim();

        return { text: query, values: params };
    }

    /**
     * Build WHERE clause with support for operators
     * Supports: =, >, <, >=, <=, !=, LIKE, IN, IS NULL
     * @param {string} table - Table name
     * @param {object} where - WHERE conditions
     * @param {number} startParam - Starting parameter number
     * @returns {object} { clause: WHERE clause, params: parameter values, nextParam: next parameter number }
     */
    static buildWhereClause(table, where, startParam = 1) {
        const conditions = [];
        const params = [];
        let paramCount = startParam;

        // Validate all columns in WHERE clause
        const columns = Object.keys(where);
        SecurityValidator.validateColumns(table, columns);

        for (const [column, value] of Object.entries(where)) {
            if (value === null) {
                // Handle NULL check
                conditions.push(`${column} IS NULL`);
            } else if (typeof value === 'object' && !Array.isArray(value)) {
                // Handle operators: { $gt: 5, $lt: 10, etc. }
                for (const [operator, operatorValue] of Object.entries(value)) {
                    switch (operator) {
                        case '$gt':
                            conditions.push(`${column} > $${paramCount++}`);
                            params.push(operatorValue);
                            break;
                        case '$gte':
                            conditions.push(`${column} >= $${paramCount++}`);
                            params.push(operatorValue);
                            break;
                        case '$lt':
                            conditions.push(`${column} < $${paramCount++}`);
                            params.push(operatorValue);
                            break;
                        case '$lte':
                            conditions.push(`${column} <= $${paramCount++}`);
                            params.push(operatorValue);
                            break;
                        case '$ne':
                            conditions.push(`${column} != $${paramCount++}`);
                            params.push(operatorValue);
                            break;
                        case '$like':
                            conditions.push(`${column} LIKE $${paramCount++}`);
                            params.push(operatorValue);
                            break;
                        case '$ilike':
                            conditions.push(`${column} ILIKE $${paramCount++}`);
                            params.push(operatorValue);
                            break;
                        case '$in':
                            if (!Array.isArray(operatorValue)) {
                                throw new Error('$in operator requires an array value');
                            }
                            if (operatorValue.length === 0) {
                                throw new Error('$in operator requires non-empty array');
                            }
                            conditions.push(`${column} = ANY($${paramCount++})`);
                            params.push(operatorValue);
                            break;
                        case '$null':
                            if (operatorValue === true) {
                                conditions.push(`${column} IS NULL`);
                            } else {
                                conditions.push(`${column} IS NOT NULL`);
                            }
                            break;
                        default:
                            throw new Error(`Unsupported operator: ${operator}`);
                    }
                }
            } else if (Array.isArray(value)) {
                // Handle array as IN clause
                if (value.length === 0) {
                    throw new Error(`Empty array for column ${column}. Use $in operator with non-empty array.`);
                }
                conditions.push(`${column} = ANY($${paramCount++})`);
                params.push(value);
            } else {
                // Handle simple equality
                conditions.push(`${column} = $${paramCount++}`);
                params.push(value);
            }
        }

        if (conditions.length === 0) {
            throw new Error('WHERE clause must contain at least one condition');
        }

        return {
            clause: conditions.join(' AND '),
            params,
            nextParam: paramCount
        };
    }

    /**
     * Build a COUNT query
     * @param {string} table - Table name
     * @param {object} where - WHERE conditions (optional)
     * @returns {object} { text: SQL query, values: parameter values }
     */
    static buildCountQuery(table, where = null) {
        SecurityValidator.validateTable(table);

        let query = `SELECT COUNT(*) as count FROM ${table}`;
        let values = [];

        if (where && Object.keys(where).length > 0) {
            const { clause, params } = this.buildWhereClause(table, where, 1);
            query += ` WHERE ${clause}`;
            values = params;
        }

        return { text: query, values };
    }
}
