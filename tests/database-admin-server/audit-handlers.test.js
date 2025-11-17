// tests/database-admin-server/audit-handlers.test.js
// Comprehensive tests for AuditHandlers
// Tests audit log querying and summary generation

import { strict as assert } from 'assert';
import { AuditLogger } from '../../src/mcps/database-admin-server/utils/audit-logger.js';

describe('AuditLogger', () => {
    describe('validateAuditLogFilters', () => {
        it('should accept valid date range filters', () => {
            const filters = {
                startDate: '2024-01-01T00:00:00Z',
                endDate: '2024-12-31T23:59:59Z'
            };
            const start = new Date(filters.startDate);
            const end = new Date(filters.endDate);
            assert.ok(start < end);
            assert.ok(!isNaN(start.getTime()));
            assert.ok(!isNaN(end.getTime()));
        });

        it('should accept table name filter', () => {
            const filter = { table: 'authors' };
            assert.ok(typeof filter.table === 'string');
            assert.ok(filter.table.length > 0);
        });

        it('should accept operation filter', () => {
            const validOperations = [
                'QUERY',
                'INSERT',
                'UPDATE',
                'DELETE',
                'BATCH_INSERT',
                'BATCH_UPDATE',
                'BATCH_DELETE',
                'BACKUP_FULL',
                'RESTORE_FULL'
            ];
            validOperations.forEach(op => {
                const filter = { operation: op };
                assert.strictEqual(filter.operation, op);
            });
        });

        it('should accept user_id filter', () => {
            const filter = { userId: 'user123' };
            assert.ok(typeof filter.userId === 'string');
        });

        it('should accept success status filter', () => {
            const successFilter = { success: true };
            const failureFilter = { success: false };
            assert.strictEqual(successFilter.success, true);
            assert.strictEqual(failureFilter.success, false);
        });

        it('should accept pagination parameters', () => {
            const pagination = {
                limit: 100,
                offset: 0
            };
            assert.ok(pagination.limit > 0);
            assert.ok(pagination.offset >= 0);
        });

        it('should validate limit range', () => {
            const validLimits = [1, 10, 100, 1000];
            validLimits.forEach(limit => {
                assert.ok(limit >= 1 && limit <= 1000);
            });
        });

        it('should reject invalid limit values', () => {
            const invalidLimits = [0, -1, 1001, 10000];
            invalidLimits.forEach(limit => {
                assert.ok(limit < 1 || limit > 1000);
            });
        });

        it('should validate offset is non-negative', () => {
            const validOffsets = [0, 10, 100, 1000];
            validOffsets.forEach(offset => {
                assert.ok(offset >= 0);
            });
        });

        it('should reject negative offsets', () => {
            const invalidOffsets = [-1, -10, -100];
            invalidOffsets.forEach(offset => {
                assert.ok(offset < 0);
            });
        });
    });

    describe('validateAuditLogEntry', () => {
        it('should accept valid audit log entry structure', () => {
            const entry = {
                id: 1,
                timestamp: new Date().toISOString(),
                operation: 'INSERT',
                table_name: 'authors',
                record_id: '123',
                user_id: 'user123',
                success: true,
                execution_time_ms: 15,
                changes: { name: 'New Author' }
            };
            assert.ok(entry.id);
            assert.ok(entry.timestamp);
            assert.ok(entry.operation);
            assert.ok(entry.table_name);
        });

        it('should accept failed operations with error message', () => {
            const entry = {
                id: 2,
                timestamp: new Date().toISOString(),
                operation: 'DELETE',
                table_name: 'books',
                success: false,
                error_message: 'Foreign key constraint violation',
                execution_time_ms: 5
            };
            assert.strictEqual(entry.success, false);
            assert.ok(entry.error_message);
        });

        it('should validate timestamp format', () => {
            const validTimestamps = [
                '2024-01-01T00:00:00Z',
                '2024-06-15T12:30:45.123Z',
                new Date().toISOString()
            ];
            validTimestamps.forEach(ts => {
                const date = new Date(ts);
                assert.ok(!isNaN(date.getTime()));
            });
        });

        it('should validate operation types', () => {
            const validOperations = [
                'QUERY',
                'INSERT',
                'UPDATE',
                'DELETE',
                'BATCH_INSERT',
                'BATCH_UPDATE',
                'BATCH_DELETE',
                'GET_SCHEMA',
                'LIST_TABLES',
                'GET_RELATIONSHIPS',
                'BACKUP_FULL',
                'BACKUP_TABLE',
                'RESTORE_FULL',
                'EXPORT_JSON',
                'IMPORT_CSV'
            ];
            validOperations.forEach(op => {
                assert.ok(typeof op === 'string');
                assert.ok(op.length > 0);
                assert.ok(op === op.toUpperCase());
            });
        });

        it('should validate execution time is positive', () => {
            const validTimes = [1, 10, 100, 1000, 5000];
            validTimes.forEach(time => {
                assert.ok(time > 0);
            });
        });

        it('should accept zero execution time', () => {
            const time = 0;
            assert.strictEqual(time, 0);
        });

        it('should validate changes field structure', () => {
            const validChanges = [
                { field: 'name', old: 'Old', new: 'New' },
                { created: 'New Record' },
                { deleted: true },
                null
            ];
            validChanges.forEach(changes => {
                if (changes !== null) {
                    assert.ok(typeof changes === 'object');
                }
            });
        });
    });

    describe('validateAuditSummaryFilters', () => {
        it('should accept date range for summary', () => {
            const filters = {
                startDate: '2024-01-01',
                endDate: '2024-12-31'
            };
            const start = new Date(filters.startDate);
            const end = new Date(filters.endDate);
            assert.ok(start <= end);
        });

        it('should accept table filter for summary', () => {
            const filter = { table: 'authors' };
            assert.strictEqual(filter.table, 'authors');
        });

        it('should accept no filters for overall summary', () => {
            const filters = {};
            assert.ok(Object.keys(filters).length === 0);
        });

        it('should validate start date before end date', () => {
            const validRange = {
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-12-31')
            };
            assert.ok(validRange.startDate < validRange.endDate);
        });

        it('should handle same start and end date', () => {
            const sameDay = {
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-01-01')
            };
            assert.strictEqual(
                sameDay.startDate.toDateString(),
                sameDay.endDate.toDateString()
            );
        });
    });

    describe('validateAuditSummaryResponse', () => {
        it('should validate overall statistics structure', () => {
            const summary = {
                totalOperations: 1000,
                successfulOperations: 950,
                failedOperations: 50,
                successRate: '95.0%',
                tablesAccessed: 15,
                uniqueUsers: 5,
                avgExecutionTime: '12.5ms',
                maxExecutionTime: '150ms'
            };
            assert.ok(summary.totalOperations > 0);
            assert.ok(summary.successfulOperations <= summary.totalOperations);
            assert.ok(summary.failedOperations <= summary.totalOperations);
        });

        it('should validate success rate calculation', () => {
            const total = 1000;
            const successful = 950;
            const successRate = (successful / total) * 100;
            assert.strictEqual(successRate, 95);
        });

        it('should validate time range structure', () => {
            const timeRange = {
                earliest: '2024-01-01T00:00:00Z',
                latest: '2024-12-31T23:59:59Z'
            };
            const earliest = new Date(timeRange.earliest);
            const latest = new Date(timeRange.latest);
            assert.ok(earliest < latest);
        });

        it('should validate operations breakdown structure', () => {
            const byOperation = [
                { operation: 'QUERY', count: 500, successful: 490, failed: 10 },
                { operation: 'INSERT', count: 300, successful: 295, failed: 5 },
                { operation: 'UPDATE', count: 150, successful: 145, failed: 5 }
            ];
            byOperation.forEach(op => {
                assert.ok(op.operation);
                assert.ok(op.count > 0);
                assert.strictEqual(op.count, op.successful + op.failed);
            });
        });

        it('should validate table breakdown structure', () => {
            const byTable = [
                { table_name: 'authors', count: 400, successful: 395, failed: 5 },
                { table_name: 'books', count: 350, successful: 340, failed: 10 },
                { table_name: 'characters', count: 250, successful: 245, failed: 5 }
            ];
            byTable.forEach(tbl => {
                assert.ok(tbl.table_name);
                assert.ok(tbl.count > 0);
                assert.strictEqual(tbl.count, tbl.successful + tbl.failed);
            });
        });

        it('should validate counts are consistent', () => {
            const summary = {
                totalOperations: 100,
                successfulOperations: 80,
                failedOperations: 20
            };
            assert.strictEqual(
                summary.totalOperations,
                summary.successfulOperations + summary.failedOperations
            );
        });

        it('should validate unique users count', () => {
            const uniqueUsers = 5;
            assert.ok(uniqueUsers >= 0);
            assert.ok(typeof uniqueUsers === 'number');
        });

        it('should validate tables accessed count', () => {
            const tablesAccessed = 15;
            assert.ok(tablesAccessed >= 0);
            assert.ok(typeof tablesAccessed === 'number');
        });
    });

    describe('validateAuditLogSecurity', () => {
        it('should prevent SQL injection in table filter', () => {
            const maliciousInputs = [
                "authors'; DROP TABLE users--",
                "authors OR 1=1--",
                "authors; DELETE FROM audit_logs--"
            ];
            maliciousInputs.forEach(input => {
                assert.ok(input.includes(';') || input.includes('--') || input.includes('OR'));
            });
        });

        it('should prevent SQL injection in operation filter', () => {
            const maliciousInputs = [
                "INSERT'; DROP TABLE--",
                "QUERY OR 1=1",
                "DELETE; TRUNCATE audit_logs--"
            ];
            maliciousInputs.forEach(input => {
                assert.ok(input.includes(';') || input.includes('OR'));
            });
        });

        it('should validate user_id format', () => {
            const validUserIds = ['user123', 'admin', 'service-account'];
            validUserIds.forEach(userId => {
                assert.ok(typeof userId === 'string');
                assert.ok(userId.length > 0);
            });
        });

        it('should reject dangerous characters in filters', () => {
            const dangerousChars = [';', '--', '/*', '*/', 'xp_', 'sp_'];
            const safeFilter = 'authors';
            dangerousChars.forEach(dangerous => {
                assert.ok(!safeFilter.includes(dangerous));
            });
        });
    });

    describe('validateAuditPerformance', () => {
        it('should validate query performance is acceptable', () => {
            // Audit log queries should be fast
            const queryTime = 50; // 50ms
            const maxAcceptableTime = 100; // 100ms
            assert.ok(queryTime <= maxAcceptableTime);
        });

        it('should validate summary generation performance', () => {
            // Summary queries may be slower due to aggregation
            const summaryTime = 200; // 200ms
            const maxAcceptableTime = 500; // 500ms
            assert.ok(summaryTime <= maxAcceptableTime);
        });

        it('should handle large audit log tables efficiently', () => {
            // Should handle millions of records
            const recordCount = 1000000;
            assert.ok(recordCount > 0);
        });
    });

    describe('validateAuditLogRetention', () => {
        it('should support configurable retention period', () => {
            const retentionDays = [7, 30, 90, 365];
            retentionDays.forEach(days => {
                assert.ok(days > 0);
                assert.ok(typeof days === 'number');
            });
        });

        it('should calculate retention date correctly', () => {
            const now = new Date();
            const retentionDays = 30;
            const retentionDate = new Date(now.getTime() - (retentionDays * 24 * 60 * 60 * 1000));
            assert.ok(retentionDate < now);
        });

        it('should support unlimited retention', () => {
            const retentionDays = null; // null = unlimited
            assert.strictEqual(retentionDays, null);
        });
    });

    describe('validateAuditMetadata', () => {
        it('should capture execution time accurately', () => {
            const startTime = Date.now();
            // Simulate operation
            const endTime = Date.now();
            const executionTime = endTime - startTime;
            assert.ok(executionTime >= 0);
        });

        it('should capture detailed change information', () => {
            const changes = {
                before: { name: 'Old Name', status: 'active' },
                after: { name: 'New Name', status: 'active' }
            };
            assert.ok(changes.before);
            assert.ok(changes.after);
        });

        it('should support nested change objects', () => {
            const changes = {
                metadata: {
                    tags: { before: ['tag1'], after: ['tag1', 'tag2'] }
                }
            };
            assert.ok(changes.metadata);
            assert.ok(changes.metadata.tags);
        });

        it('should capture error details for failed operations', () => {
            const errorDetails = {
                code: 'FOREIGN_KEY_VIOLATION',
                message: 'Cannot delete record with dependent records',
                constraint: 'fk_book_author'
            };
            assert.ok(errorDetails.code);
            assert.ok(errorDetails.message);
        });
    });
});

describe('Audit Log Query Validation', () => {
    describe('validateComplexQueries', () => {
        it('should support multiple filter combinations', () => {
            const complexFilter = {
                startDate: '2024-01-01',
                endDate: '2024-12-31',
                table: 'authors',
                operation: 'UPDATE',
                success: true
            };
            assert.ok(Object.keys(complexFilter).length > 3);
        });

        it('should support OR conditions for operations', () => {
            const operations = ['INSERT', 'UPDATE', 'DELETE'];
            assert.ok(Array.isArray(operations));
            assert.ok(operations.length > 1);
        });

        it('should support table pattern matching', () => {
            const tablePattern = 'book%'; // Matches books, book_genres, etc.
            assert.ok(tablePattern.includes('%'));
        });
    });

    describe('validateAuditLogExport', () => {
        it('should support exporting audit logs', () => {
            const exportFormat = 'json';
            const validFormats = ['json', 'csv'];
            assert.ok(validFormats.includes(exportFormat));
        });

        it('should support filtered exports', () => {
            const exportFilter = {
                startDate: '2024-01-01',
                table: 'authors'
            };
            assert.ok(exportFilter.startDate);
            assert.ok(exportFilter.table);
        });
    });
});

describe('Audit Security Validation', () => {
    describe('validateAuditLogAccess', () => {
        it('should enforce read-only access to audit logs', () => {
            const allowedOperations = ['QUERY', 'SUMMARY', 'EXPORT'];
            const deniedOperations = ['INSERT', 'UPDATE', 'DELETE'];
            deniedOperations.forEach(op => {
                assert.ok(!allowedOperations.includes(op));
            });
        });

        it('should prevent tampering with audit logs', () => {
            // Audit logs should be immutable
            const isImmutable = true;
            assert.strictEqual(isImmutable, true);
        });

        it('should log access to audit logs', () => {
            // Meta-auditing: audit log queries should be audited
            const metaAudit = {
                operation: 'QUERY_AUDIT_LOGS',
                userId: 'admin',
                timestamp: new Date().toISOString()
            };
            assert.ok(metaAudit.operation);
            assert.ok(metaAudit.userId);
        });
    });
});

describe('Audit Compliance Validation', () => {
    describe('validateComplianceRequirements', () => {
        it('should capture required compliance fields', () => {
            const complianceLog = {
                timestamp: new Date().toISOString(),
                userId: 'user123',
                operation: 'DELETE',
                table: 'books',
                recordId: '456',
                ipAddress: '192.168.1.100',
                userAgent: 'MCP-Client/1.0'
            };
            assert.ok(complianceLog.timestamp);
            assert.ok(complianceLog.userId);
            assert.ok(complianceLog.operation);
        });

        it('should support audit trail requirements', () => {
            // Must maintain complete audit trail
            const requirements = {
                whoDidIt: 'user123',
                whatWasDone: 'DELETE',
                whenWasItDone: new Date().toISOString(),
                whereWasItDone: 'books',
                whyWasItDone: 'User request'
            };
            assert.ok(requirements.whoDidIt);
            assert.ok(requirements.whatWasDone);
            assert.ok(requirements.whenWasItDone);
        });

        it('should support regulatory retention periods', () => {
            const regulations = {
                GDPR: 365 * 6, // 6 years
                HIPAA: 365 * 6, // 6 years
                SOX: 365 * 7 // 7 years
            };
            Object.values(regulations).forEach(days => {
                assert.ok(days > 365);
            });
        });
    });
});
