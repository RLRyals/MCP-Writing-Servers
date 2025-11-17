// src/mcps/database-admin-server/utils/validation-utils.js
// Backup validation utilities

import { StorageManager } from './storage-manager.js';
import { CompressionUtils } from './compression-utils.js';
import fs from 'fs/promises';

export class ValidationUtils {
    constructor() {
        this.storageManager = new StorageManager();
    }

    /**
     * Validate backup file integrity
     */
    async validateBackup(filename) {
        const errors = [];
        const warnings = [];
        let valid = true;

        try {
            // 1. Check if file exists and is readable
            try {
                const filepath = this.storageManager.getBackupPath(filename);
                await fs.access(filepath, fs.constants.R_OK);
            } catch (error) {
                errors.push('Backup file does not exist or is not readable');
                return { success: false, valid: false, errors, warnings };
            }

            // 2. Check file size
            const filepath = this.storageManager.getBackupPath(filename);
            const stats = await fs.stat(filepath);
            if (stats.size === 0) {
                errors.push('Backup file is empty');
                valid = false;
            } else if (stats.size < 100) {
                warnings.push('Backup file is very small, may be incomplete');
            }

            // 3. Load and validate manifest if exists
            const manifest = await this.storageManager.loadManifest(filename);
            if (manifest) {
                // Validate checksum if present
                if (manifest.checksum) {
                    const currentChecksum = await this.storageManager.calculateChecksum(filename);
                    if (currentChecksum !== manifest.checksum) {
                        errors.push('Checksum mismatch - file may be corrupted');
                        valid = false;
                    }
                }

                // Validate file size matches manifest
                if (manifest.size && manifest.size !== stats.size) {
                    warnings.push(`File size mismatch (expected ${manifest.size}, got ${stats.size})`);
                }

                // Check PostgreSQL version compatibility (if specified)
                if (manifest.postgresVersion) {
                    warnings.push(`Backup created with PostgreSQL ${manifest.postgresVersion} - verify compatibility`);
                }
            } else {
                warnings.push('No manifest file found - cannot perform deep validation');
            }

            // 4. Validate file format
            const fileType = this.storageManager.detectBackupType(filename);
            if (fileType === 'unknown') {
                warnings.push('Unknown backup file type');
            }

            // 5. If compressed, test decompression
            if (CompressionUtils.isGzipFile(filename)) {
                try {
                    // Try to read first few bytes to verify it's valid gzip
                    const content = await fs.readFile(filepath);
                    const header = content.slice(0, 2);
                    // Gzip magic number: 0x1f 0x8b
                    if (header[0] !== 0x1f || header[1] !== 0x8b) {
                        errors.push('File has .gz extension but is not a valid gzip file');
                        valid = false;
                    }
                } catch (error) {
                    errors.push(`Gzip validation failed: ${error.message}`);
                    valid = false;
                }
            }

            // 6. For SQL files, perform basic syntax validation
            if (filename.includes('.sql')) {
                const syntaxResult = await this.validateSqlSyntax(filename);
                if (!syntaxResult.valid) {
                    errors.push(...syntaxResult.errors);
                    warnings.push(...syntaxResult.warnings);
                    valid = false;
                }
            }

            // 7. Check for incremental backup dependencies
            if (fileType === 'incremental' && manifest) {
                if (!manifest.baseBackup) {
                    errors.push('Incremental backup missing base backup reference');
                    valid = false;
                } else {
                    // Check if base backup exists
                    try {
                        const baseBackupPath = this.storageManager.getBackupPath(manifest.baseBackup);
                        await fs.access(baseBackupPath, fs.constants.R_OK);
                    } catch (error) {
                        errors.push(`Base backup not found: ${manifest.baseBackup}`);
                        valid = false;
                    }
                }
            }

            return {
                success: true,
                valid,
                errors,
                warnings,
                fileSize: stats.size,
                fileType,
                hasManifest: !!manifest
            };

        } catch (error) {
            console.error('[VALIDATION] Validation error:', error);
            return {
                success: false,
                valid: false,
                errors: [error.message],
                warnings
            };
        }
    }

    /**
     * Validate SQL syntax (basic check)
     */
    async validateSqlSyntax(filename) {
        const errors = [];
        const warnings = [];
        let valid = true;

        try {
            // Read file content (handle compression)
            let content;
            if (CompressionUtils.isGzipFile(filename)) {
                const filepath = this.storageManager.getBackupPath(filename);
                const compressed = await fs.readFile(filepath);
                const decompressed = await CompressionUtils.decompress(compressed);
                content = decompressed.toString('utf8');
            } else {
                content = await this.storageManager.readFile(filename);
            }

            // Basic SQL validation checks
            const lines = content.split('\n');
            const sampleSize = Math.min(lines.length, 100); // Check first 100 lines

            let hasCreateStatements = false;
            let hasInsertStatements = false;
            let hasDangerousCommands = false;

            for (let i = 0; i < sampleSize; i++) {
                const line = lines[i].trim().toUpperCase();

                if (line.startsWith('CREATE TABLE') || line.startsWith('CREATE DATABASE')) {
                    hasCreateStatements = true;
                }

                if (line.startsWith('INSERT INTO')) {
                    hasInsertStatements = true;
                }

                // Check for potentially dangerous commands
                if (line.includes('DROP DATABASE') && !line.includes('IF EXISTS')) {
                    warnings.push('Backup contains DROP DATABASE without IF EXISTS');
                    hasDangerousCommands = true;
                }
            }

            // File should have either CREATE or INSERT statements
            if (!hasCreateStatements && !hasInsertStatements) {
                warnings.push('Backup file does not appear to contain SQL statements');
            }

            // Check for balanced transactions
            const beginCount = (content.match(/BEGIN;/gi) || []).length;
            const commitCount = (content.match(/COMMIT;/gi) || []).length;
            if (beginCount !== commitCount) {
                warnings.push(`Unbalanced transactions (BEGIN: ${beginCount}, COMMIT: ${commitCount})`);
            }

        } catch (error) {
            errors.push(`SQL syntax validation failed: ${error.message}`);
            valid = false;
        }

        return { valid, errors, warnings };
    }

    /**
     * Validate restore prerequisites
     */
    async validateRestorePrerequisites(backupFile, db) {
        const errors = [];
        const warnings = [];
        let canRestore = true;

        try {
            // 1. Validate backup file
            const backupValidation = await this.validateBackup(backupFile);
            if (!backupValidation.valid) {
                errors.push(...backupValidation.errors);
                canRestore = false;
            }
            warnings.push(...backupValidation.warnings);

            // 2. Check database connection
            try {
                const health = await db.healthCheck();
                if (!health.healthy) {
                    errors.push('Database connection is not healthy');
                    canRestore = false;
                }
            } catch (error) {
                errors.push(`Database health check failed: ${error.message}`);
                canRestore = false;
            }

            // 3. Load manifest and check compatibility
            const manifest = await this.storageManager.loadManifest(backupFile);
            if (manifest) {
                // Check schema version compatibility (if tracked)
                if (manifest.schemaVersion) {
                    warnings.push(`Backup schema version: ${manifest.schemaVersion} - verify compatibility`);
                }

                // Check if backup is incremental and needs base backup
                if (manifest.type === 'incremental') {
                    if (!manifest.baseBackup) {
                        errors.push('Incremental backup requires base backup reference');
                        canRestore = false;
                    }
                }
            }

            return {
                success: true,
                canRestore,
                errors,
                warnings
            };

        } catch (error) {
            return {
                success: false,
                canRestore: false,
                errors: [error.message],
                warnings
            };
        }
    }

    /**
     * Validate CSV format
     */
    async validateCsvFile(filename) {
        const errors = [];
        const warnings = [];
        let valid = true;

        try {
            const content = await this.storageManager.readFile(filename);
            const lines = content.split('\n').filter(line => line.trim());

            if (lines.length === 0) {
                errors.push('CSV file is empty');
                return { valid: false, errors, warnings };
            }

            // Check header row
            const header = lines[0].split(',');
            if (header.length === 0) {
                errors.push('CSV file has no columns');
                valid = false;
            }

            // Check that all rows have same number of columns
            const columnCount = header.length;
            for (let i = 1; i < Math.min(lines.length, 100); i++) {
                const columns = lines[i].split(',');
                if (columns.length !== columnCount) {
                    warnings.push(`Row ${i + 1} has ${columns.length} columns, expected ${columnCount}`);
                }
            }

            return {
                valid,
                errors,
                warnings,
                rowCount: lines.length - 1, // Exclude header
                columnCount
            };

        } catch (error) {
            return {
                valid: false,
                errors: [error.message],
                warnings
            };
        }
    }

    /**
     * Validate JSON format
     */
    async validateJsonFile(filename) {
        const errors = [];
        const warnings = [];
        let valid = true;

        try {
            const content = await this.storageManager.readFile(filename);
            const data = JSON.parse(content);

            // Check if it's an array
            if (!Array.isArray(data)) {
                errors.push('JSON file must contain an array of records');
                valid = false;
            } else {
                // Check that records are objects
                for (let i = 0; i < Math.min(data.length, 10); i++) {
                    if (typeof data[i] !== 'object' || data[i] === null) {
                        errors.push(`Record ${i} is not a valid object`);
                        valid = false;
                        break;
                    }
                }
            }

            return {
                valid,
                errors,
                warnings,
                recordCount: Array.isArray(data) ? data.length : 0
            };

        } catch (error) {
            return {
                valid: false,
                errors: [`Invalid JSON: ${error.message}`],
                warnings
            };
        }
    }
}

export default ValidationUtils;
