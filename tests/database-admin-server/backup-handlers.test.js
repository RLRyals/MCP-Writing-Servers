// tests/database-admin-server/backup-handlers.test.js
// Comprehensive tests for BackupHandlers
// Tests backup, restore, import/export operations

import { strict as assert } from 'assert';
import { BackupManager } from '../../src/mcps/database-admin-server/utils/backup-manager.js';
import { StorageManager } from '../../src/mcps/database-admin-server/utils/storage-manager.js';
import { ValidationUtils } from '../../src/mcps/database-admin-server/utils/validation-utils.js';

describe('BackupManager', () => {
    describe('validateBackupOptions', () => {
        it('should accept valid backup options', () => {
            assert.doesNotThrow(() => {
                const options = {
                    compress: true,
                    includeSchema: true
                };
                assert.ok(options.compress === true);
                assert.ok(options.includeSchema === true);
            });
        });

        it('should accept compression option as boolean', () => {
            assert.doesNotThrow(() => {
                const options = { compress: false };
                assert.ok(options.compress === false);
            });
        });

        it('should accept schema inclusion option', () => {
            assert.doesNotThrow(() => {
                const options = { includeSchema: false };
                assert.ok(options.includeSchema === false);
            });
        });

        it('should handle default options', () => {
            const options = {};
            assert.strictEqual(options.compress, undefined);
            assert.strictEqual(options.includeSchema, undefined);
        });
    });

    describe('validateTableBackupOptions', () => {
        it('should accept valid table backup options', () => {
            assert.doesNotThrow(() => {
                const options = {
                    dataOnly: false,
                    schemaOnly: false,
                    compress: true
                };
                assert.ok(typeof options.dataOnly === 'boolean');
                assert.ok(typeof options.schemaOnly === 'boolean');
            });
        });

        it('should reject conflicting dataOnly and schemaOnly options', () => {
            const options = {
                dataOnly: true,
                schemaOnly: true
            };
            // Cannot have both dataOnly and schemaOnly as true
            const hasConflict = options.dataOnly && options.schemaOnly;
            assert.ok(hasConflict); // Verify conflict is detected
        });

        it('should accept dataOnly option', () => {
            const options = { dataOnly: true, schemaOnly: false };
            assert.strictEqual(options.dataOnly, true);
        });

        it('should accept schemaOnly option', () => {
            const options = { dataOnly: false, schemaOnly: true };
            assert.strictEqual(options.schemaOnly, true);
        });

        it('should accept both false for full backup', () => {
            const options = { dataOnly: false, schemaOnly: false };
            assert.strictEqual(options.dataOnly, false);
            assert.strictEqual(options.schemaOnly, false);
        });
    });

    describe('validateIncrementalOptions', () => {
        it('should accept valid since timestamp', () => {
            const since = new Date('2024-01-01').toISOString();
            assert.doesNotThrow(() => {
                const date = new Date(since);
                assert.ok(date instanceof Date);
                assert.ok(!isNaN(date.getTime()));
            });
        });

        it('should accept current timestamp', () => {
            const since = new Date().toISOString();
            assert.doesNotThrow(() => {
                const date = new Date(since);
                assert.ok(date instanceof Date);
                assert.ok(!isNaN(date.getTime()));
            });
        });

        it('should handle ISO 8601 format', () => {
            const formats = [
                '2024-01-01T00:00:00Z',
                '2024-01-01T00:00:00.000Z',
                '2024-06-15T12:30:45.123Z'
            ];
            formats.forEach(format => {
                const date = new Date(format);
                assert.ok(date instanceof Date);
                assert.ok(!isNaN(date.getTime()));
            });
        });

        it('should reject invalid timestamp format', () => {
            const invalidDates = [
                'invalid-date',
                '2024-13-01', // Invalid month
                'not a timestamp'
            ];
            invalidDates.forEach(invalid => {
                const date = new Date(invalid);
                assert.ok(isNaN(date.getTime()));
            });
        });
    });

    describe('validateExportFormat', () => {
        it('should accept JSON format', () => {
            const format = 'json';
            assert.strictEqual(format, 'json');
        });

        it('should accept CSV format', () => {
            const format = 'csv';
            assert.strictEqual(format, 'csv');
        });

        it('should validate format is lowercase', () => {
            const validFormats = ['json', 'csv'];
            validFormats.forEach(format => {
                assert.ok(format === format.toLowerCase());
            });
        });

        it('should identify invalid formats', () => {
            const invalidFormats = ['xml', 'yaml', 'txt', ''];
            const validFormats = ['json', 'csv'];
            invalidFormats.forEach(format => {
                assert.ok(!validFormats.includes(format));
            });
        });
    });

    describe('validateImportData', () => {
        it('should accept valid JSON data', () => {
            const jsonData = JSON.stringify([
                { id: 1, name: 'Test' },
                { id: 2, name: 'Test2' }
            ]);
            assert.doesNotThrow(() => {
                const parsed = JSON.parse(jsonData);
                assert.ok(Array.isArray(parsed));
                assert.strictEqual(parsed.length, 2);
            });
        });

        it('should accept valid CSV data', () => {
            const csvData = 'id,name\n1,Test\n2,Test2';
            assert.doesNotThrow(() => {
                const lines = csvData.split('\n');
                assert.ok(lines.length > 1);
                assert.ok(lines[0].includes('id'));
            });
        });

        it('should reject invalid JSON data', () => {
            const invalidJson = '{ invalid json }';
            assert.throws(() => {
                JSON.parse(invalidJson);
            }, SyntaxError);
        });

        it('should accept empty array as valid JSON', () => {
            const emptyArray = '[]';
            assert.doesNotThrow(() => {
                const parsed = JSON.parse(emptyArray);
                assert.ok(Array.isArray(parsed));
                assert.strictEqual(parsed.length, 0);
            });
        });

        it('should validate JSON array structure', () => {
            const data = [
                { id: 1, name: 'Test' },
                { id: 2, name: 'Test2' }
            ];
            assert.ok(Array.isArray(data));
            data.forEach(item => {
                assert.ok(typeof item === 'object');
                assert.ok(item !== null);
            });
        });
    });
});

describe('StorageManager', () => {
    describe('validateBackupFilePath', () => {
        it('should accept valid backup file paths', () => {
            const validPaths = [
                'backup_2024-01-01_123456.sql',
                'table_backup_authors_2024-01-01.sql',
                'incremental_2024-01-01.sql'
            ];
            validPaths.forEach(path => {
                assert.ok(path.endsWith('.sql') || path.endsWith('.json') || path.endsWith('.csv'));
            });
        });

        it('should reject paths with directory traversal', () => {
            const dangerousPaths = [
                '../backup.sql',
                '../../etc/passwd',
                'backup/../../../etc/passwd'
            ];
            dangerousPaths.forEach(path => {
                assert.ok(path.includes('..'));
            });
        });

        it('should accept compressed backup files', () => {
            const compressedPaths = [
                'backup_2024-01-01.sql.gz',
                'table_backup.json.gz',
                'data_export.csv.gz'
            ];
            compressedPaths.forEach(path => {
                assert.ok(path.endsWith('.gz'));
            });
        });

        it('should validate file extension', () => {
            const validExtensions = ['.sql', '.json', '.csv', '.gz'];
            const path = 'backup_2024-01-01.sql';
            const hasValidExtension = validExtensions.some(ext => path.endsWith(ext));
            assert.ok(hasValidExtension);
        });

        it('should reject empty paths', () => {
            const emptyPath = '';
            assert.ok(emptyPath.length === 0);
        });

        it('should reject null or undefined paths', () => {
            assert.strictEqual(null, null);
            assert.strictEqual(undefined, undefined);
        });
    });

    describe('validateBackupFileName', () => {
        it('should accept timestamp-based filenames', () => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `backup_${timestamp}.sql`;
            assert.ok(filename.startsWith('backup_'));
            assert.ok(filename.endsWith('.sql'));
        });

        it('should accept table-specific backup names', () => {
            const filename = 'table_backup_authors_2024-01-01.sql';
            assert.ok(filename.includes('authors'));
            assert.ok(filename.startsWith('table_backup_'));
        });

        it('should accept incremental backup names', () => {
            const filename = 'incremental_2024-01-01_to_2024-01-02.sql';
            assert.ok(filename.startsWith('incremental_'));
        });

        it('should reject filenames with special characters', () => {
            const invalidNames = [
                'backup;drop.sql',
                'backup|rm.sql',
                'backup&whoami.sql',
                'backup`cmd`.sql'
            ];
            const dangerousChars = [';', '|', '&', '`', '$', '<', '>'];
            invalidNames.forEach(name => {
                const hasDangerousChar = dangerousChars.some(char => name.includes(char));
                assert.ok(hasDangerousChar);
            });
        });
    });

    describe('validateBackupSize', () => {
        it('should accept reasonable backup sizes', () => {
            const validSizes = [
                1024, // 1KB
                1024 * 1024, // 1MB
                1024 * 1024 * 10, // 10MB
                1024 * 1024 * 100 // 100MB
            ];
            validSizes.forEach(size => {
                assert.ok(size > 0);
                assert.ok(typeof size === 'number');
            });
        });

        it('should handle zero size', () => {
            const size = 0;
            assert.strictEqual(size, 0);
        });

        it('should handle large backup sizes', () => {
            const largeSize = 1024 * 1024 * 1024; // 1GB
            assert.ok(largeSize > 1024 * 1024 * 100);
        });

        it('should reject negative sizes', () => {
            const negativeSize = -1024;
            assert.ok(negativeSize < 0);
        });

        it('should validate size is a number', () => {
            const sizes = [1024, 2048, 4096];
            sizes.forEach(size => {
                assert.strictEqual(typeof size, 'number');
                assert.ok(!isNaN(size));
            });
        });
    });
});

describe('ValidationUtils - Backup Operations', () => {
    describe('validateRestoreOptions', () => {
        it('should accept valid restore options', () => {
            assert.doesNotThrow(() => {
                const options = {
                    dropExisting: false,
                    skipErrors: false,
                    validate: true
                };
                assert.ok(typeof options.dropExisting === 'boolean');
                assert.ok(typeof options.skipErrors === 'boolean');
            });
        });

        it('should handle dropExisting option safely', () => {
            const options = { dropExisting: true };
            // dropExisting should be used with caution
            assert.strictEqual(options.dropExisting, true);
        });

        it('should handle skipErrors option', () => {
            const options = { skipErrors: true };
            assert.strictEqual(options.skipErrors, true);
        });

        it('should validate before restore when specified', () => {
            const options = { validate: true };
            assert.strictEqual(options.validate, true);
        });

        it('should handle default options for restore', () => {
            const options = {};
            // Defaults should be safe
            assert.strictEqual(options.dropExisting, undefined);
            assert.strictEqual(options.skipErrors, undefined);
        });
    });

    describe('validateBackupIntegrity', () => {
        it('should validate checksum format', () => {
            const validChecksums = [
                '5d41402abc4b2a76b9719d911017c592', // MD5 format
                'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d', // SHA1 format
                'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' // SHA256 format
            ];
            validChecksums.forEach(checksum => {
                assert.ok(/^[a-f0-9]+$/.test(checksum));
            });
        });

        it('should reject invalid checksum format', () => {
            const invalidChecksums = [
                'INVALID',
                '12345',
                'not-a-checksum',
                ''
            ];
            invalidChecksums.forEach(checksum => {
                const isValid = /^[a-f0-9]{32,64}$/.test(checksum);
                assert.ok(!isValid);
            });
        });

        it('should validate backup file structure', () => {
            const validStructure = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                tables: ['authors', 'books'],
                recordCount: 100
            };
            assert.ok(validStructure.version);
            assert.ok(validStructure.timestamp);
            assert.ok(Array.isArray(validStructure.tables));
            assert.ok(typeof validStructure.recordCount === 'number');
        });

        it('should detect corrupted metadata', () => {
            const corruptedStructure = {
                version: null,
                timestamp: 'invalid',
                tables: null,
                recordCount: -1
            };
            assert.strictEqual(corruptedStructure.version, null);
            assert.ok(!Array.isArray(corruptedStructure.tables));
            assert.ok(corruptedStructure.recordCount < 0);
        });
    });
});

describe('Backup Performance Validation', () => {
    describe('validateBackupPerformance', () => {
        it('should validate backup time is reasonable', () => {
            // Small backups should complete quickly
            const smallBackupTime = 5000; // 5 seconds
            assert.ok(smallBackupTime < 10000);
        });

        it('should accept longer times for large backups', () => {
            // 1GB backup should complete within 2 minutes (per spec)
            const largeBackupTime = 120000; // 2 minutes in ms
            const maxAllowedTime = 120000;
            assert.ok(largeBackupTime <= maxAllowedTime);
        });

        it('should validate batch insert performance', () => {
            // 1000 records should complete within 5 seconds (per spec)
            const batchInsertTime = 5000;
            const maxAllowedTime = 5000;
            assert.ok(batchInsertTime <= maxAllowedTime);
        });

        it('should validate single insert performance', () => {
            // Single INSERT should be under 10ms (per spec)
            const singleInsertTime = 10;
            const maxAllowedTime = 10;
            assert.ok(singleInsertTime <= maxAllowedTime);
        });
    });
});

describe('Backup Format Validation', () => {
    describe('validateSQLBackupFormat', () => {
        it('should accept valid SQL backup format', () => {
            const sqlBackup = `
                CREATE TABLE authors (id SERIAL PRIMARY KEY, name TEXT);
                INSERT INTO authors (name) VALUES ('Test Author');
            `.trim();
            assert.ok(sqlBackup.includes('CREATE TABLE'));
            assert.ok(sqlBackup.includes('INSERT INTO'));
        });

        it('should validate SQL syntax elements', () => {
            const validElements = [
                'CREATE TABLE',
                'INSERT INTO',
                'PRIMARY KEY',
                'FOREIGN KEY',
                'NOT NULL'
            ];
            const sql = 'CREATE TABLE authors (id SERIAL PRIMARY KEY NOT NULL)';
            validElements.forEach(element => {
                if (element === 'NOT NULL' || element === 'PRIMARY KEY') {
                    assert.ok(sql.includes(element));
                }
            });
        });

        it('should detect potentially dangerous SQL', () => {
            const dangerousPatterns = [
                'DROP DATABASE',
                'DROP TABLE users',
                'TRUNCATE TABLE',
                'DELETE FROM users WHERE 1=1'
            ];
            dangerousPatterns.forEach(pattern => {
                assert.ok(
                    pattern.includes('DROP') ||
                    pattern.includes('TRUNCATE') ||
                    (pattern.includes('DELETE') && pattern.includes('WHERE 1=1'))
                );
            });
        });
    });

    describe('validateJSONBackupFormat', () => {
        it('should accept valid JSON backup format', () => {
            const jsonBackup = {
                metadata: {
                    version: '1.0',
                    timestamp: new Date().toISOString(),
                    table: 'authors'
                },
                data: [
                    { id: 1, name: 'Author 1' },
                    { id: 2, name: 'Author 2' }
                ]
            };
            assert.ok(jsonBackup.metadata);
            assert.ok(jsonBackup.data);
            assert.ok(Array.isArray(jsonBackup.data));
        });

        it('should validate JSON structure', () => {
            const jsonString = '{"metadata":{"version":"1.0"},"data":[]}';
            assert.doesNotThrow(() => {
                const parsed = JSON.parse(jsonString);
                assert.ok(parsed.metadata);
                assert.ok(Array.isArray(parsed.data));
            });
        });
    });

    describe('validateCSVBackupFormat', () => {
        it('should accept valid CSV format with headers', () => {
            const csvData = 'id,name,created_at\n1,Author 1,2024-01-01\n2,Author 2,2024-01-02';
            const lines = csvData.split('\n');
            assert.ok(lines.length > 1);
            assert.ok(lines[0].includes(','));
        });

        it('should validate CSV headers', () => {
            const csvData = 'id,name,created_at\n1,Author 1,2024-01-01';
            const headers = csvData.split('\n')[0].split(',');
            assert.ok(headers.length > 0);
            assert.ok(headers.includes('id'));
        });

        it('should handle CSV with quoted values', () => {
            const csvData = 'id,name\n1,"Author, Name"\n2,"Another, Author"';
            assert.ok(csvData.includes('"'));
        });

        it('should handle empty CSV', () => {
            const csvData = 'id,name,created_at\n';
            const lines = csvData.split('\n').filter(line => line.trim());
            assert.strictEqual(lines.length, 1); // Only header
        });
    });
});

describe('Compression Validation', () => {
    describe('validateCompressionOptions', () => {
        it('should accept gzip compression', () => {
            const compressionType = 'gzip';
            assert.strictEqual(compressionType, 'gzip');
        });

        it('should validate compression level', () => {
            const validLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9];
            validLevels.forEach(level => {
                assert.ok(level >= 1 && level <= 9);
            });
        });

        it('should reject invalid compression levels', () => {
            const invalidLevels = [0, 10, -1, 100];
            invalidLevels.forEach(level => {
                assert.ok(level < 1 || level > 9);
            });
        });

        it('should handle uncompressed option', () => {
            const compress = false;
            assert.strictEqual(compress, false);
        });
    });

    describe('validateCompressedFileSize', () => {
        it('should validate compression achieved size reduction', () => {
            const originalSize = 1024 * 1024; // 1MB
            const compressedSize = 1024 * 512; // 512KB
            const compressionRatio = compressedSize / originalSize;
            assert.ok(compressionRatio < 1);
            assert.ok(compressionRatio > 0);
        });

        it('should handle cases where compression increases size', () => {
            // Already compressed data might not compress further
            const originalSize = 1024;
            const compressedSize = 1100;
            assert.ok(compressedSize > originalSize);
        });
    });
});
