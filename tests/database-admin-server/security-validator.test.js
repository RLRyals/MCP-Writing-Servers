// tests/database-admin-server/security-validator.test.js
// Comprehensive tests for SecurityValidator
// Tests SQL injection prevention, whitelisting, and validation

import { strict as assert } from 'assert';
import { SecurityValidator, WHITELIST, SOFT_DELETE_TABLES, READ_ONLY_TABLES } from '../../src/mcps/database-admin-server/utils/security-validator.js';

describe('SecurityValidator', () => {
    describe('validateTable', () => {
        it('should accept valid whitelisted table names', () => {
            assert.doesNotThrow(() => SecurityValidator.validateTable('authors'));
            assert.doesNotThrow(() => SecurityValidator.validateTable('books'));
            assert.doesNotThrow(() => SecurityValidator.validateTable('characters'));
        });

        it('should reject non-whitelisted tables', () => {
            assert.throws(
                () => SecurityValidator.validateTable('users'),
                /not whitelisted/
            );
            assert.throws(
                () => SecurityValidator.validateTable('admin'),
                /not whitelisted/
            );
        });

        it('should reject SQL injection attempts in table names', () => {
            assert.throws(
                () => SecurityValidator.validateTable('authors; DROP TABLE users--'),
                /Invalid table name format/
            );
            assert.throws(
                () => SecurityValidator.validateTable('authors OR 1=1'),
                /Invalid table name format/
            );
            assert.throws(
                () => SecurityValidator.validateTable("authors'--"),
                /Invalid table name format/
            );
        });

        it('should reject invalid table name types', () => {
            assert.throws(
                () => SecurityValidator.validateTable(null),
                /must be a non-empty string/
            );
            assert.throws(
                () => SecurityValidator.validateTable(''),
                /must be a non-empty string/
            );
            assert.throws(
                () => SecurityValidator.validateTable(123),
                /must be a non-empty string/
            );
        });
    });

    describe('validateColumns', () => {
        it('should accept valid whitelisted columns', () => {
            assert.doesNotThrow(() => SecurityValidator.validateColumns('authors', 'name'));
            assert.doesNotThrow(() => SecurityValidator.validateColumns('authors', ['name', 'bio']));
            assert.doesNotThrow(() => SecurityValidator.validateColumns('books', ['id', 'title', 'status']));
        });

        it('should reject non-whitelisted columns', () => {
            assert.throws(
                () => SecurityValidator.validateColumns('authors', 'password'),
                /not whitelisted/
            );
            assert.throws(
                () => SecurityValidator.validateColumns('authors', ['name', 'secret_key']),
                /not whitelisted/
            );
        });

        it('should reject SQL injection attempts in column names', () => {
            assert.throws(
                () => SecurityValidator.validateColumns('authors', 'name; DROP TABLE users--'),
                /Invalid column name format/
            );
            assert.throws(
                () => SecurityValidator.validateColumns('authors', 'name OR 1=1'),
                /Invalid column name format/
            );
        });

        it('should reject invalid column types', () => {
            assert.throws(
                () => SecurityValidator.validateColumns('authors', null),
                /must be non-empty strings/
            );
            assert.throws(
                () => SecurityValidator.validateColumns('authors', ['']),
                /must be non-empty strings/
            );
        });
    });

    describe('validateWhereClause', () => {
        it('should accept valid WHERE clauses', () => {
            assert.doesNotThrow(() =>
                SecurityValidator.validateWhereClause('authors', { id: 1 })
            );
            assert.doesNotThrow(() =>
                SecurityValidator.validateWhereClause('authors', { name: 'Test', bio: 'Bio' })
            );
        });

        it('should reject invalid WHERE clause types', () => {
            assert.throws(
                () => SecurityValidator.validateWhereClause('authors', null),
                /must be a non-empty object/
            );
            assert.throws(
                () => SecurityValidator.validateWhereClause('authors', []),
                /must be a non-empty object/
            );
            assert.throws(
                () => SecurityValidator.validateWhereClause('authors', {}),
                /must contain at least one condition/
            );
        });

        it('should reject WHERE clauses with non-whitelisted columns', () => {
            assert.throws(
                () => SecurityValidator.validateWhereClause('authors', { password: 'test' }),
                /not whitelisted/
            );
        });
    });

    describe('validateData', () => {
        it('should accept valid data objects', () => {
            assert.doesNotThrow(() =>
                SecurityValidator.validateData('authors', { name: 'Test', bio: 'Bio' })
            );
        });

        it('should reject invalid data types', () => {
            assert.throws(
                () => SecurityValidator.validateData('authors', null),
                /must be a non-empty object/
            );
            assert.throws(
                () => SecurityValidator.validateData('authors', []),
                /must be a non-empty object/
            );
            assert.throws(
                () => SecurityValidator.validateData('authors', {}),
                /must contain at least one field/
            );
        });

        it('should reject data with non-whitelisted columns', () => {
            assert.throws(
                () => SecurityValidator.validateData('authors', { name: 'Test', hacker: 'field' }),
                /not whitelisted/
            );
        });
    });

    describe('validateOrderBy', () => {
        it('should accept valid order by clauses', () => {
            const result = SecurityValidator.validateOrderBy('authors', [
                { column: 'name', direction: 'ASC' }
            ]);
            assert.deepEqual(result, [{ column: 'name', direction: 'ASC' }]);
        });

        it('should default direction to ASC', () => {
            const result = SecurityValidator.validateOrderBy('authors', [
                { column: 'name' }
            ]);
            assert.deepEqual(result, [{ column: 'name', direction: 'ASC' }]);
        });

        it('should reject invalid directions', () => {
            assert.throws(
                () => SecurityValidator.validateOrderBy('authors', [
                    { column: 'name', direction: 'INVALID' }
                ]),
                /Invalid sort direction/
            );
        });

        it('should reject non-whitelisted columns in order by', () => {
            assert.throws(
                () => SecurityValidator.validateOrderBy('authors', [
                    { column: 'password', direction: 'ASC' }
                ]),
                /not whitelisted/
            );
        });
    });

    describe('validatePagination', () => {
        it('should accept valid pagination parameters', () => {
            const result = SecurityValidator.validatePagination(10, 0);
            assert.deepEqual(result, { limit: 10, offset: 0 });
        });

        it('should reject invalid limit values', () => {
            assert.throws(
                () => SecurityValidator.validatePagination(0, 0),
                /must be between 1 and 1000/
            );
            assert.throws(
                () => SecurityValidator.validatePagination(1001, 0),
                /must be between 1 and 1000/
            );
            assert.throws(
                () => SecurityValidator.validatePagination('invalid', 0),
                /must be between 1 and 1000/
            );
        });

        it('should reject invalid offset values', () => {
            assert.throws(
                () => SecurityValidator.validatePagination(10, -1),
                /must be a non-negative integer/
            );
        });
    });

    describe('validateNotReadOnly', () => {
        it('should allow operations on non-read-only tables', () => {
            assert.doesNotThrow(() =>
                SecurityValidator.validateNotReadOnly('authors')
            );
        });

        it('should reject operations on read-only tables', () => {
            assert.throws(
                () => SecurityValidator.validateNotReadOnly('genres'),
                /table is read-only/
            );
        });
    });

    describe('supportsSoftDelete', () => {
        it('should return true for tables with soft delete support', () => {
            assert.strictEqual(SecurityValidator.supportsSoftDelete('books'), true);
            assert.strictEqual(SecurityValidator.supportsSoftDelete('characters'), true);
        });

        it('should return false for tables without soft delete support', () => {
            assert.strictEqual(SecurityValidator.supportsSoftDelete('authors'), false);
            assert.strictEqual(SecurityValidator.supportsSoftDelete('genres'), false);
        });
    });

    describe('getWhitelistedTables', () => {
        it('should return array of whitelisted tables', () => {
            const tables = SecurityValidator.getWhitelistedTables();
            assert(Array.isArray(tables));
            assert(tables.length > 0);
            assert(tables.includes('authors'));
            assert(tables.includes('books'));
        });
    });

    describe('getWhitelistedColumns', () => {
        it('should return whitelisted columns for valid table', () => {
            const columns = SecurityValidator.getWhitelistedColumns('authors');
            assert(Array.isArray(columns));
            assert(columns.includes('name'));
            assert(columns.includes('bio'));
        });

        it('should throw for invalid table', () => {
            assert.throws(
                () => SecurityValidator.getWhitelistedColumns('invalid_table'),
                /not whitelisted/
            );
        });
    });
});

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('Running SecurityValidator tests...');
    // Note: This requires a test runner like mocha
    // For manual testing, each test would need to be invoked individually
}
