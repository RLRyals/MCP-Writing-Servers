// tests/security-phase4.test.js
// Comprehensive Security Tests for Phase 4 Implementation
// Tests SQL injection prevention, access control, audit logging, and data validation

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { SecurityValidator } from '../src/mcps/database-admin-server/utils/security-validator.js';
import { AccessControl } from '../src/mcps/database-admin-server/utils/access-control.js';

describe('Phase 4: Security Controls & Audit Logging', () => {

    // ==============================================
    // SQL INJECTION PREVENTION TESTS
    // ==============================================
    describe('SQL Injection Prevention', () => {
        it('should reject table names with SQL injection attempts', () => {
            const maliciousTableNames = [
                "books'; DROP TABLE books; --",
                "books; DELETE FROM books; --",
                "books UNION SELECT * FROM users",
                "books' OR '1'='1",
                "books--",
                "books/**/",
                "books' AND 1=1--"
            ];

            maliciousTableNames.forEach(tableName => {
                expect(() => {
                    SecurityValidator.validateTable(tableName);
                }).toThrow(/Invalid table name format/);
            });
        });

        it('should reject column names with SQL injection attempts', () => {
            const maliciousColumnNames = [
                "id'; DROP TABLE books; --",
                "id OR 1=1",
                "id/**/",
                "id--comment",
                "id' UNION SELECT",
                "id; DELETE FROM"
            ];

            maliciousColumnNames.forEach(columnName => {
                expect(() => {
                    SecurityValidator.validateColumns('books', [columnName]);
                }).toThrow(/Invalid column name format/);
            });
        });

        it('should only allow alphanumeric and underscore characters in table names', () => {
            // Valid table names
            expect(() => SecurityValidator.validateTable('books')).not.toThrow();
            expect(() => SecurityValidator.validateTable('book_genres')).not.toThrow();
            expect(() => SecurityValidator.validateTable('character_arcs')).not.toThrow();

            // Invalid table names
            expect(() => SecurityValidator.validateTable('books-data')).toThrow();
            expect(() => SecurityValidator.validateTable('books.data')).toThrow();
            expect(() => SecurityValidator.validateTable('books data')).toThrow();
            expect(() => SecurityValidator.validateTable('BOOKS')).toThrow(); // uppercase not allowed
        });

        it('should only allow whitelisted table names', () => {
            // Valid whitelisted tables
            expect(() => SecurityValidator.validateTable('books')).not.toThrow();
            expect(() => SecurityValidator.validateTable('characters')).not.toThrow();
            expect(() => SecurityValidator.validateTable('audit_logs')).not.toThrow();

            // Non-whitelisted tables
            expect(() => SecurityValidator.validateTable('malicious_table')).toThrow(/not whitelisted/);
            expect(() => SecurityValidator.validateTable('users')).toThrow(/not whitelisted/);
        });

        it('should only allow whitelisted columns for each table', () => {
            // Valid columns for 'books' table
            expect(() => SecurityValidator.validateColumns('books', ['id', 'title', 'author_id'])).not.toThrow();

            // Invalid columns for 'books' table
            expect(() => SecurityValidator.validateColumns('books', ['password'])).toThrow(/not whitelisted/);
            expect(() => SecurityValidator.validateColumns('books', ['malicious_column'])).toThrow(/not whitelisted/);
        });
    });

    // ==============================================
    // ACCESS CONTROL TESTS
    // ==============================================
    describe('Access Control', () => {
        it('should allow READ operations on allowed tables', () => {
            expect(() => AccessControl.validateTableAccess('books', 'READ')).not.toThrow();
            expect(() => AccessControl.validateTableAccess('characters', 'READ')).not.toThrow();
            expect(() => AccessControl.validateTableAccess('audit_logs', 'READ')).not.toThrow();
        });

        it('should allow WRITE operations on writable tables', () => {
            expect(() => AccessControl.validateTableAccess('books', 'WRITE')).not.toThrow();
            expect(() => AccessControl.validateTableAccess('characters', 'INSERT')).not.toThrow();
            expect(() => AccessControl.validateTableAccess('scenes', 'UPDATE')).not.toThrow();
        });

        it('should deny WRITE operations on read-only tables', () => {
            expect(() => AccessControl.validateTableAccess('genres', 'WRITE'))
                .toThrow(/WRITE permission denied/);
            expect(() => AccessControl.validateTableAccess('audit_logs', 'INSERT'))
                .toThrow(/WRITE permission denied/);
        });

        it('should allow DELETE operations on deletable tables', () => {
            expect(() => AccessControl.validateTableAccess('books', 'DELETE')).not.toThrow();
            expect(() => AccessControl.validateTableAccess('scenes', 'DELETE')).not.toThrow();
        });

        it('should deny DELETE operations on non-deletable tables', () => {
            expect(() => AccessControl.validateTableAccess('authors', 'DELETE'))
                .toThrow(/DELETE permission denied/);
            expect(() => AccessControl.validateTableAccess('genres', 'DELETE'))
                .toThrow(/DELETE permission denied/);
        });

        it('should deny access to restricted tables', () => {
            const restrictedTables = ['users', 'auth_tokens', 'system_config'];

            restrictedTables.forEach(table => {
                // Note: These should fail at the whitelist level first
                // If they were whitelisted, they should be blocked by access control
                expect(() => SecurityValidator.validateTable(table)).toThrow();
            });
        });

        it('should provide clear error messages for access denied', () => {
            try {
                AccessControl.validateTableAccess('genres', 'WRITE');
                fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).toContain('Access Denied');
                expect(error.message).toContain('genres');
                expect(error.message).toContain('WRITE');
                expect(error.code).toBe('DB_403_ACCESS_DENIED');
            }
        });

        it('should support batch operation access control', () => {
            expect(() => AccessControl.validateTableAccess('books', 'BATCH_INSERT')).not.toThrow();
            expect(() => AccessControl.validateTableAccess('characters', 'BATCH_UPDATE')).not.toThrow();
            expect(() => AccessControl.validateTableAccess('scenes', 'BATCH_DELETE')).not.toThrow();
        });
    });

    // ==============================================
    // DATA VALIDATION TESTS
    // ==============================================
    describe('Data Validation', () => {
        it('should validate that data is an object', () => {
            expect(() => SecurityValidator.validateData('books', null)).toThrow(/must be a non-empty object/);
            expect(() => SecurityValidator.validateData('books', [])).toThrow(/must be a non-empty object/);
            expect(() => SecurityValidator.validateData('books', 'string')).toThrow(/must be a non-empty object/);
        });

        it('should validate that data contains at least one field', () => {
            expect(() => SecurityValidator.validateData('books', {})).toThrow(/must contain at least one field/);
        });

        it('should validate that all data fields are whitelisted columns', () => {
            // Valid data
            expect(() => SecurityValidator.validateData('books', { title: 'Test Book' })).not.toThrow();

            // Invalid column in data
            expect(() => SecurityValidator.validateData('books', { malicious_field: 'value' }))
                .toThrow(/not whitelisted/);
        });

        it('should validate WHERE clauses', () => {
            // Valid WHERE clause
            expect(() => SecurityValidator.validateWhereClause('books', { id: 1 })).not.toThrow();
            expect(() => SecurityValidator.validateWhereClause('books', { title: 'Test', status: 'published' }))
                .not.toThrow();

            // Invalid WHERE clause - not an object
            expect(() => SecurityValidator.validateWhereClause('books', null)).toThrow(/must be a non-empty object/);
            expect(() => SecurityValidator.validateWhereClause('books', [])).toThrow(/must be a non-empty object/);

            // Invalid WHERE clause - empty object
            expect(() => SecurityValidator.validateWhereClause('books', {})).toThrow(/must contain at least one condition/);

            // Invalid WHERE clause - invalid column
            expect(() => SecurityValidator.validateWhereClause('books', { malicious_column: 'value' }))
                .toThrow(/not whitelisted/);
        });

        it('should validate order by clauses', () => {
            // Valid order by
            expect(() => SecurityValidator.validateOrderBy('books', [{ column: 'title', direction: 'ASC' }]))
                .not.toThrow();
            expect(() => SecurityValidator.validateOrderBy('books', [{ column: 'created_at', direction: 'DESC' }]))
                .not.toThrow();

            // Invalid order by - not an array
            expect(() => SecurityValidator.validateOrderBy('books', 'title')).toThrow(/must be an array/);

            // Invalid order by - invalid column
            expect(() => SecurityValidator.validateOrderBy('books', [{ column: 'malicious_column' }]))
                .toThrow(/not whitelisted/);

            // Invalid order by - invalid direction
            expect(() => SecurityValidator.validateOrderBy('books', [{ column: 'title', direction: 'INVALID' }]))
                .toThrow(/Invalid sort direction/);
        });

        it('should validate pagination parameters', () => {
            // Valid pagination
            expect(SecurityValidator.validatePagination(10, 0)).toEqual({ limit: 10, offset: 0 });
            expect(SecurityValidator.validatePagination(100, 50)).toEqual({ limit: 100, offset: 50 });

            // Invalid limit - out of range
            expect(() => SecurityValidator.validatePagination(0, 0)).toThrow(/must be between 1 and 1000/);
            expect(() => SecurityValidator.validatePagination(1001, 0)).toThrow(/must be between 1 and 1000/);

            // Invalid offset - negative
            expect(() => SecurityValidator.validatePagination(10, -1)).toThrow(/must be a non-negative integer/);
        });
    });

    // ==============================================
    // SECURITY VALIDATOR TESTS
    // ==============================================
    describe('Security Validator - Comprehensive', () => {
        it('should prevent all common SQL injection vectors', () => {
            const injectionVectors = [
                // Classic SQL injection
                "'; DROP TABLE books; --",
                "' OR '1'='1",
                "1; DELETE FROM books",

                // Union-based injection
                "UNION SELECT * FROM users",
                "' UNION ALL SELECT NULL,NULL,NULL--",

                // Comment injection
                "id--",
                "id/**/",
                "id#comment",

                // Stacked queries
                "1; UPDATE books SET title='hacked'",
                "'; INSERT INTO users VALUES ('hacker')--",

                // Boolean-based blind injection
                "' AND 1=1--",
                "' AND 1=0--",

                // Time-based blind injection
                "'; WAITFOR DELAY '00:00:05'--",
                "'; SELECT SLEEP(5)--",

                // Special characters
                "id'",
                "id\"",
                "id;",
                "id|",
                "id&"
            ];

            injectionVectors.forEach(vector => {
                expect(() => {
                    SecurityValidator.validateTable(vector);
                }).toThrow();
            });
        });

        it('should validate read-only table enforcement', () => {
            const readOnlyTables = ['genres', 'lookup_values', 'audit_logs'];

            readOnlyTables.forEach(table => {
                expect(() => SecurityValidator.validateNotReadOnly(table, 'modify'))
                    .toThrow(/read-only/);
            });

            // Non-read-only tables should not throw
            expect(() => SecurityValidator.validateNotReadOnly('books', 'modify')).not.toThrow();
        });

        it('should correctly identify tables that support soft delete', () => {
            // Tables with soft delete
            expect(SecurityValidator.supportsSoftDelete('books')).toBe(true);
            expect(SecurityValidator.supportsSoftDelete('characters')).toBe(true);
            expect(SecurityValidator.supportsSoftDelete('scenes')).toBe(true);

            // Tables without soft delete
            expect(SecurityValidator.supportsSoftDelete('genres')).toBe(false);
            expect(SecurityValidator.supportsSoftDelete('series_genres')).toBe(false);
        });
    });

    // ==============================================
    // ACCESS CONTROL - OPERATION MAPPING
    // ==============================================
    describe('Access Control - Operation Mapping', () => {
        it('should correctly map operations to permissions', () => {
            expect(AccessControl.mapOperationToPermission('READ')).toBe('READ');
            expect(AccessControl.mapOperationToPermission('QUERY')).toBe('READ');
            expect(AccessControl.mapOperationToPermission('SELECT')).toBe('READ');

            expect(AccessControl.mapOperationToPermission('INSERT')).toBe('WRITE');
            expect(AccessControl.mapOperationToPermission('UPDATE')).toBe('WRITE');
            expect(AccessControl.mapOperationToPermission('BATCH_INSERT')).toBe('WRITE');
            expect(AccessControl.mapOperationToPermission('BATCH_UPDATE')).toBe('WRITE');

            expect(AccessControl.mapOperationToPermission('DELETE')).toBe('DELETE');
            expect(AccessControl.mapOperationToPermission('BATCH_DELETE')).toBe('DELETE');
        });

        it('should get allowed operations for a table', () => {
            const booksPermissions = AccessControl.getAllowedOperations('books');
            expect(booksPermissions.canRead).toBe(true);
            expect(booksPermissions.canWrite).toBe(true);
            expect(booksPermissions.canDelete).toBe(true);
            expect(booksPermissions.isRestricted).toBe(false);

            const genresPermissions = AccessControl.getAllowedOperations('genres');
            expect(genresPermissions.canRead).toBe(true);
            expect(genresPermissions.canWrite).toBe(false);
            expect(genresPermissions.canDelete).toBe(false);
        });

        it('should list tables with specific permissions', () => {
            const readableTables = AccessControl.getTablesWithPermission('read');
            expect(readableTables).toContain('books');
            expect(readableTables).toContain('audit_logs');

            const writableTables = AccessControl.getTablesWithPermission('write');
            expect(writableTables).toContain('books');
            expect(writableTables).not.toContain('audit_logs');

            const deletableTables = AccessControl.getTablesWithPermission('delete');
            expect(deletableTables).toContain('books');
            expect(deletableTables).not.toContain('authors');
        });
    });

    // ==============================================
    // INTEGRATION TESTS
    // ==============================================
    describe('Security Integration', () => {
        it('should enforce complete security chain: whitelist -> access control -> validation', () => {
            // Step 1: Table must be whitelisted
            expect(() => SecurityValidator.validateTable('malicious_table')).toThrow();

            // Step 2: Table must pass access control
            expect(() => {
                SecurityValidator.validateTable('audit_logs');
                SecurityValidator.validateNotReadOnly('audit_logs', 'write');
            }).toThrow(/read-only/);

            // Step 3: Data must be validated
            expect(() => {
                SecurityValidator.validateTable('books');
                SecurityValidator.validateNotReadOnly('books', 'write');
                SecurityValidator.validateData('books', { malicious_field: 'value' });
            }).toThrow(/not whitelisted/);

            // All steps should pass for valid operation
            expect(() => {
                SecurityValidator.validateTable('books');
                SecurityValidator.validateNotReadOnly('books', 'write');
                AccessControl.validateTableAccess('books', 'WRITE');
                SecurityValidator.validateData('books', { title: 'Valid Book' });
            }).not.toThrow();
        });
    });
});

console.log('\n=== Phase 4 Security Tests ===');
console.log('Run these tests with: npm test tests/security-phase4.test.js');
console.log('All tests verify SQL injection prevention, access control, and data validation.');
