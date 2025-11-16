// tests/database-admin-server/query-builder.test.js
// Comprehensive tests for QueryBuilder
// Tests parameterized query generation and SQL injection prevention

import { strict as assert } from 'assert';
import { QueryBuilder } from '../../src/mcps/database-admin-server/utils/query-builder.js';

describe('QueryBuilder', () => {
    describe('buildSelectQuery', () => {
        it('should build basic SELECT query', () => {
            const result = QueryBuilder.buildSelectQuery({
                table: 'authors'
            });

            assert.strictEqual(result.text, 'SELECT * FROM authors');
            assert.deepEqual(result.values, []);
        });

        it('should build SELECT query with specific columns', () => {
            const result = QueryBuilder.buildSelectQuery({
                table: 'authors',
                columns: ['id', 'name']
            });

            assert.strictEqual(result.text, 'SELECT id, name FROM authors');
            assert.deepEqual(result.values, []);
        });

        it('should build SELECT query with WHERE clause', () => {
            const result = QueryBuilder.buildSelectQuery({
                table: 'authors',
                where: { id: 1 }
            });

            assert.strictEqual(result.text, 'SELECT * FROM authors WHERE id = $1');
            assert.deepEqual(result.values, [1]);
        });

        it('should build SELECT query with multiple WHERE conditions', () => {
            const result = QueryBuilder.buildSelectQuery({
                table: 'authors',
                where: { id: 1, name: 'Test' }
            });

            assert(result.text.includes('WHERE'));
            assert(result.text.includes('id = $1'));
            assert(result.text.includes('name = $2'));
            assert(result.text.includes('AND'));
            assert.deepEqual(result.values, [1, 'Test']);
        });

        it('should build SELECT query with ORDER BY', () => {
            const result = QueryBuilder.buildSelectQuery({
                table: 'authors',
                orderBy: [{ column: 'name', direction: 'ASC' }]
            });

            assert.strictEqual(result.text, 'SELECT * FROM authors ORDER BY name ASC');
        });

        it('should build SELECT query with LIMIT', () => {
            const result = QueryBuilder.buildSelectQuery({
                table: 'authors',
                limit: 10
            });

            assert.strictEqual(result.text, 'SELECT * FROM authors LIMIT $1');
            assert.deepEqual(result.values, [10]);
        });

        it('should build SELECT query with OFFSET', () => {
            const result = QueryBuilder.buildSelectQuery({
                table: 'authors',
                limit: 10,
                offset: 20
            });

            assert.strictEqual(result.text, 'SELECT * FROM authors LIMIT $1 OFFSET $2');
            assert.deepEqual(result.values, [10, 20]);
        });

        it('should build complex SELECT query with all options', () => {
            const result = QueryBuilder.buildSelectQuery({
                table: 'authors',
                columns: ['id', 'name'],
                where: { bio: 'Test bio' },
                orderBy: [{ column: 'name', direction: 'DESC' }],
                limit: 5,
                offset: 10
            });

            assert(result.text.includes('SELECT id, name FROM authors'));
            assert(result.text.includes('WHERE bio = $1'));
            assert(result.text.includes('ORDER BY name DESC'));
            assert(result.text.includes('LIMIT $2'));
            assert(result.text.includes('OFFSET $3'));
            assert.deepEqual(result.values, ['Test bio', 5, 10]);
        });
    });

    describe('buildWhereClause', () => {
        it('should handle equality operator', () => {
            const result = QueryBuilder.buildWhereClause('authors', { name: 'Test' }, 1);
            assert.strictEqual(result.clause, 'name = $1');
            assert.deepEqual(result.params, ['Test']);
            assert.strictEqual(result.nextParam, 2);
        });

        it('should handle $gt operator', () => {
            const result = QueryBuilder.buildWhereClause('authors', { id: { $gt: 5 } }, 1);
            assert.strictEqual(result.clause, 'id > $1');
            assert.deepEqual(result.params, [5]);
        });

        it('should handle $gte operator', () => {
            const result = QueryBuilder.buildWhereClause('authors', { id: { $gte: 5 } }, 1);
            assert.strictEqual(result.clause, 'id >= $1');
            assert.deepEqual(result.params, [5]);
        });

        it('should handle $lt operator', () => {
            const result = QueryBuilder.buildWhereClause('authors', { id: { $lt: 10 } }, 1);
            assert.strictEqual(result.clause, 'id < $1');
            assert.deepEqual(result.params, [10]);
        });

        it('should handle $lte operator', () => {
            const result = QueryBuilder.buildWhereClause('authors', { id: { $lte: 10 } }, 1);
            assert.strictEqual(result.clause, 'id <= $1');
            assert.deepEqual(result.params, [10]);
        });

        it('should handle $ne operator', () => {
            const result = QueryBuilder.buildWhereClause('authors', { name: { $ne: 'Test' } }, 1);
            assert.strictEqual(result.clause, 'name != $1');
            assert.deepEqual(result.params, ['Test']);
        });

        it('should handle $like operator', () => {
            const result = QueryBuilder.buildWhereClause('authors', { name: { $like: '%Test%' } }, 1);
            assert.strictEqual(result.clause, 'name LIKE $1');
            assert.deepEqual(result.params, ['%Test%']);
        });

        it('should handle $in operator with array', () => {
            const result = QueryBuilder.buildWhereClause('authors', { id: { $in: [1, 2, 3] } }, 1);
            assert.strictEqual(result.clause, 'id = ANY($1)');
            assert.deepEqual(result.params, [[1, 2, 3]]);
        });

        it('should handle $null operator', () => {
            const result = QueryBuilder.buildWhereClause('authors', { bio: { $null: true } }, 1);
            assert.strictEqual(result.clause, 'bio IS NULL');
            assert.deepEqual(result.params, []);
        });

        it('should handle NULL value directly', () => {
            const result = QueryBuilder.buildWhereClause('authors', { bio: null }, 1);
            assert.strictEqual(result.clause, 'bio IS NULL');
            assert.deepEqual(result.params, []);
        });

        it('should handle array as IN clause', () => {
            const result = QueryBuilder.buildWhereClause('authors', { id: [1, 2, 3] }, 1);
            assert.strictEqual(result.clause, 'id = ANY($1)');
            assert.deepEqual(result.params, [[1, 2, 3]]);
        });

        it('should handle multiple conditions', () => {
            const result = QueryBuilder.buildWhereClause('authors', { id: 1, name: 'Test' }, 1);
            assert(result.clause.includes('id = $1'));
            assert(result.clause.includes('name = $2'));
            assert(result.clause.includes('AND'));
            assert.deepEqual(result.params, [1, 'Test']);
            assert.strictEqual(result.nextParam, 3);
        });

        it('should reject unsupported operators', () => {
            assert.throws(
                () => QueryBuilder.buildWhereClause('authors', { id: { $invalid: 5 } }, 1),
                /Unsupported operator/
            );
        });

        it('should reject empty array for $in', () => {
            assert.throws(
                () => QueryBuilder.buildWhereClause('authors', { id: { $in: [] } }, 1),
                /requires non-empty array/
            );
        });
    });

    describe('buildInsertQuery', () => {
        it('should build INSERT query with single column', () => {
            const result = QueryBuilder.buildInsertQuery('authors', { name: 'Test' });

            assert(result.text.includes('INSERT INTO authors (name)'));
            assert(result.text.includes('VALUES ($1)'));
            assert(result.text.includes('RETURNING *'));
            assert.deepEqual(result.values, ['Test']);
        });

        it('should build INSERT query with multiple columns', () => {
            const result = QueryBuilder.buildInsertQuery('authors', {
                name: 'Test',
                bio: 'Test bio'
            });

            assert(result.text.includes('INSERT INTO authors (name, bio)'));
            assert(result.text.includes('VALUES ($1, $2)'));
            assert(result.text.includes('RETURNING *'));
            assert.deepEqual(result.values, ['Test', 'Test bio']);
        });

        it('should use parameterized values (no string concatenation)', () => {
            const result = QueryBuilder.buildInsertQuery('authors', {
                name: "'; DROP TABLE users--"
            });

            // Should use parameterized query, not string concatenation
            assert(result.text.includes('$1'));
            assert(!result.text.includes("'; DROP TABLE"));
            assert.deepEqual(result.values, ["'; DROP TABLE users--"]);
        });
    });

    describe('buildUpdateQuery', () => {
        it('should build UPDATE query with single column', () => {
            const result = QueryBuilder.buildUpdateQuery('authors', { name: 'New Name' }, { id: 1 });

            assert(result.text.includes('UPDATE authors'));
            assert(result.text.includes('SET name = $1'));
            assert(result.text.includes('WHERE id = $2'));
            assert(result.text.includes('RETURNING *'));
            assert.deepEqual(result.values, ['New Name', 1]);
        });

        it('should build UPDATE query with multiple columns', () => {
            const result = QueryBuilder.buildUpdateQuery(
                'authors',
                { name: 'New Name', bio: 'New Bio' },
                { id: 1 }
            );

            assert(result.text.includes('UPDATE authors'));
            assert(result.text.includes('name = $1'));
            assert(result.text.includes('bio = $2'));
            assert(result.text.includes('WHERE id = $3'));
            assert.deepEqual(result.values, ['New Name', 'New Bio', 1]);
        });

        it('should automatically add updated_at if column exists', () => {
            const result = QueryBuilder.buildUpdateQuery('authors', { name: 'Test' }, { id: 1 });

            assert(result.text.includes('updated_at = CURRENT_TIMESTAMP'));
        });

        it('should use parameterized values in WHERE clause', () => {
            const result = QueryBuilder.buildUpdateQuery(
                'authors',
                { name: 'Test' },
                { id: 1, bio: 'Match' }
            );

            assert(result.text.includes('WHERE'));
            assert(result.text.includes('id = $2'));
            assert(result.text.includes('bio = $3'));
            assert.deepEqual(result.values, ['Test', 1, 'Match']);
        });
    });

    describe('buildDeleteQuery', () => {
        it('should build DELETE query', () => {
            const result = QueryBuilder.buildDeleteQuery('authors', { id: 1 });

            assert(result.text.includes('DELETE FROM authors'));
            assert(result.text.includes('WHERE id = $1'));
            assert(result.text.includes('RETURNING *'));
            assert.deepEqual(result.values, [1]);
        });

        it('should build DELETE query with multiple conditions', () => {
            const result = QueryBuilder.buildDeleteQuery('authors', { id: 1, name: 'Test' });

            assert(result.text.includes('DELETE FROM authors'));
            assert(result.text.includes('WHERE'));
            assert(result.text.includes('id = $1'));
            assert(result.text.includes('name = $2'));
            assert.deepEqual(result.values, [1, 'Test']);
        });
    });

    describe('buildSoftDeleteQuery', () => {
        it('should build soft DELETE query', () => {
            const result = QueryBuilder.buildSoftDeleteQuery('books', { id: 1 });

            assert(result.text.includes('UPDATE books'));
            assert(result.text.includes('SET deleted_at = CURRENT_TIMESTAMP'));
            assert(result.text.includes('updated_at = CURRENT_TIMESTAMP'));
            assert(result.text.includes('WHERE id = $1 AND deleted_at IS NULL'));
            assert(result.text.includes('RETURNING *'));
            assert.deepEqual(result.values, [1]);
        });

        it('should throw error for tables without soft delete support', () => {
            assert.throws(
                () => QueryBuilder.buildSoftDeleteQuery('authors', { id: 1 }),
                /does not support soft delete/
            );
        });
    });

    describe('buildCountQuery', () => {
        it('should build COUNT query without WHERE clause', () => {
            const result = QueryBuilder.buildCountQuery('authors');

            assert.strictEqual(result.text, 'SELECT COUNT(*) as count FROM authors');
            assert.deepEqual(result.values, []);
        });

        it('should build COUNT query with WHERE clause', () => {
            const result = QueryBuilder.buildCountQuery('authors', { bio: 'Test' });

            assert(result.text.includes('SELECT COUNT(*) as count FROM authors'));
            assert(result.text.includes('WHERE bio = $1'));
            assert.deepEqual(result.values, ['Test']);
        });
    });

    describe('SQL Injection Prevention', () => {
        it('should prevent SQL injection in table names', () => {
            assert.throws(
                () => QueryBuilder.buildSelectQuery({
                    table: 'authors; DROP TABLE users--'
                }),
                /Invalid table name format/
            );
        });

        it('should prevent SQL injection in column names', () => {
            assert.throws(
                () => QueryBuilder.buildSelectQuery({
                    table: 'authors',
                    columns: ['name; DROP TABLE users--']
                }),
                /Invalid column name format/
            );
        });

        it('should safely handle malicious values in WHERE clause', () => {
            const result = QueryBuilder.buildSelectQuery({
                table: 'authors',
                where: { name: "'; DROP TABLE users--" }
            });

            // Malicious value should be parameterized, not concatenated
            assert(result.text.includes('$1'));
            assert(!result.text.includes('DROP TABLE'));
            assert.deepEqual(result.values, ["'; DROP TABLE users--"]);
        });

        it('should safely handle malicious values in INSERT', () => {
            const result = QueryBuilder.buildInsertQuery('authors', {
                name: "'; DELETE FROM authors--"
            });

            assert(result.text.includes('$1'));
            assert(!result.text.includes('DELETE FROM'));
            assert.deepEqual(result.values, ["'; DELETE FROM authors--"]);
        });

        it('should safely handle malicious values in UPDATE', () => {
            const result = QueryBuilder.buildUpdateQuery(
                'authors',
                { name: "'; DROP TABLE users--" },
                { id: 1 }
            );

            assert(result.text.includes('$1'));
            assert(!result.text.includes('DROP TABLE'));
            assert.deepEqual(result.values, ["'; DROP TABLE users--", 1]);
        });
    });
});
