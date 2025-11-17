// src/mcps/database-admin-server/utils/backup-manager.js
// Core backup and restore functionality

import { spawn } from 'child_process';
import { pipeline } from 'stream/promises';
import fs from 'fs/promises';
import fsSync from 'fs';
import { StorageManager } from './storage-manager.js';
import { CompressionUtils } from './compression-utils.js';
import { ValidationUtils } from './validation-utils.js';
import { BackupConfig } from '../config/backup-config.js';
import { SecurityValidator } from './security-validator.js';

export class BackupManager {
    constructor(db) {
        this.db = db;
        this.storageManager = new StorageManager();
        this.validationUtils = new ValidationUtils();
    }

    /**
     * Create full database backup
     */
    async createFullBackup(options = {}) {
        const startTime = Date.now();

        try {
            // Initialize backup directory
            await this.storageManager.initialize();

            // Generate filename
            const compress = options.compress ?? BackupConfig.compression.enabled;
            const filename = this.storageManager.generateFilename(
                BackupConfig.fileNames.full,
                { compressed: compress }
            );

            const filepath = this.storageManager.getBackupPath(filename);
            const includeSchema = options.includeSchema ?? true;

            // Get database connection info
            const connectionString = this.getConnectionString();

            // Prepare pg_dump command
            const pgDumpArgs = [
                connectionString,
                '--format=plain',
                '--encoding=UTF8',
                ...BackupConfig.pgDump.options
            ];

            if (!includeSchema) {
                pgDumpArgs.push('--data-only');
            }

            // Get list of tables and record counts
            const tablesQuery = `
                SELECT schemaname, tablename
                FROM pg_tables
                WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
                ORDER BY tablename;
            `;
            const tablesResult = await this.db.query(tablesQuery);
            const tables = tablesResult.rows.map(row => row.tablename);

            // Get total record count
            let totalRecords = 0;
            for (const table of tables) {
                try {
                    const countResult = await this.db.query(`SELECT COUNT(*) as count FROM "${table}"`);
                    totalRecords += parseInt(countResult.rows[0].count, 10);
                } catch (error) {
                    console.error(`[BACKUP-MANAGER] Failed to count records in ${table}:`, error.message);
                }
            }

            // Execute pg_dump
            console.error('[BACKUP-MANAGER] Starting full database backup...');
            const backupResult = await this.executePgDump(pgDumpArgs, filepath, compress);

            if (!backupResult.success) {
                throw new Error(`Backup failed: ${backupResult.error}`);
            }

            // Get file stats
            const stats = await fs.stat(filepath);
            const duration = Date.now() - startTime;

            // Calculate checksum
            const checksum = await this.storageManager.calculateChecksum(filename);

            // Create manifest
            const manifest = {
                backupId: filename.replace(/\.(sql|sql\.gz)$/, ''),
                type: 'full',
                timestamp: new Date().toISOString(),
                database: this.getDatabaseName(),
                postgresVersion: await this.getPostgresVersion(),
                schemaVersion: '1.0', // TODO: Track schema version
                tables: tables.map(name => ({ name, recordCount: 0 })), // Individual counts would be expensive
                totalRecordCount: totalRecords,
                size: stats.size,
                compressed: compress,
                checksum,
                dependencies: []
            };

            await this.storageManager.saveManifest(filename, manifest);

            return {
                success: true,
                backupFile: filename,
                size: stats.size,
                tables: tables.length,
                recordCount: totalRecords,
                duration,
                compressed: compress,
                checksum
            };

        } catch (error) {
            console.error('[BACKUP-MANAGER] Full backup failed:', error);
            throw new Error(`Full backup failed: ${error.message}`);
        }
    }

    /**
     * Create table-level backup
     */
    async createTableBackup(tableName, options = {}) {
        const startTime = Date.now();

        try {
            // Validate table
            SecurityValidator.validateTable(tableName);

            // Initialize backup directory
            await this.storageManager.initialize();

            // Generate filename
            const compress = options.compress ?? BackupConfig.compression.enabled;
            const filename = this.storageManager.generateFilename(
                BackupConfig.fileNames.table,
                { table: tableName, compressed: compress }
            );

            const filepath = this.storageManager.getBackupPath(filename);
            const dataOnly = options.dataOnly ?? false;
            const schemaOnly = options.schemaOnly ?? false;

            // Get connection string
            const connectionString = this.getConnectionString();

            // Prepare pg_dump command
            const pgDumpArgs = [
                connectionString,
                '--format=plain',
                '--encoding=UTF8',
                '--table=' + tableName,
                ...BackupConfig.pgDump.options.filter(opt => !opt.includes('--create')) // Remove --create for table backups
            ];

            if (dataOnly) {
                pgDumpArgs.push('--data-only');
            } else if (schemaOnly) {
                pgDumpArgs.push('--schema-only');
            }

            // Get record count
            const countResult = await this.db.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
            const recordCount = parseInt(countResult.rows[0].count, 10);

            // Execute pg_dump
            console.error(`[BACKUP-MANAGER] Starting backup of table '${tableName}'...`);
            const backupResult = await this.executePgDump(pgDumpArgs, filepath, compress);

            if (!backupResult.success) {
                throw new Error(`Table backup failed: ${backupResult.error}`);
            }

            // Get file stats
            const stats = await fs.stat(filepath);
            const duration = Date.now() - startTime;

            // Calculate checksum
            const checksum = await this.storageManager.calculateChecksum(filename);

            // Create manifest
            const manifest = {
                backupId: filename.replace(/\.(sql|sql\.gz)$/, ''),
                type: 'table',
                timestamp: new Date().toISOString(),
                database: this.getDatabaseName(),
                tables: [{ name: tableName, recordCount }],
                size: stats.size,
                compressed: compress,
                checksum,
                dataOnly,
                schemaOnly
            };

            await this.storageManager.saveManifest(filename, manifest);

            return {
                success: true,
                backupFile: filename,
                table: tableName,
                recordCount,
                size: stats.size,
                duration,
                compressed: compress,
                checksum
            };

        } catch (error) {
            console.error('[BACKUP-MANAGER] Table backup failed:', error);
            throw new Error(`Table backup failed: ${error.message}`);
        }
    }

    /**
     * Execute pg_dump command
     */
    async executePgDump(args, outputPath, compress = true) {
        return new Promise((resolve, reject) => {
            const pgDump = spawn(BackupConfig.pgDump.path, args);
            let stderr = '';

            const outputStream = fsSync.createWriteStream(outputPath, { mode: 0o600 });
            let pipelinePromise;

            if (compress) {
                const gzip = CompressionUtils.createCompressionStream();
                pipelinePromise = pipeline(pgDump.stdout, gzip, outputStream);
            } else {
                pipelinePromise = pipeline(pgDump.stdout, outputStream);
            }

            pgDump.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            pgDump.on('error', (error) => {
                reject(new Error(`pg_dump process error: ${error.message}`));
            });

            pipelinePromise
                .then(() => {
                    pgDump.on('close', (code) => {
                        if (code === 0) {
                            resolve({ success: true });
                        } else {
                            resolve({ success: false, error: stderr || `pg_dump exited with code ${code}` });
                        }
                    });
                })
                .catch((error) => {
                    reject(new Error(`Pipeline error: ${error.message}`));
                });
        });
    }

    /**
     * Restore full database from backup
     */
    async restoreFullBackup(backupFile, options = {}) {
        const startTime = Date.now();

        try {
            // Validate backup
            const validation = await this.validationUtils.validateRestorePrerequisites(backupFile, this.db);
            if (!validation.canRestore) {
                throw new Error(`Backup validation failed: ${validation.errors.join(', ')}`);
            }

            const dropExisting = options.dropExisting ?? false;
            const onConflict = options.onConflict || 'error'; // 'error', 'skip', 'overwrite'

            // Load manifest
            const manifest = await this.storageManager.loadManifest(backupFile);

            // Get backup file path
            const filepath = this.storageManager.getBackupPath(backupFile);

            // Prepare restore
            const compressed = CompressionUtils.isGzipFile(backupFile);

            // Execute restore
            console.error('[BACKUP-MANAGER] Starting full database restore...');
            const restoreResult = await this.executePsqlRestore(filepath, compressed, {
                dropExisting,
                onConflict
            });

            if (!restoreResult.success) {
                throw new Error(`Restore failed: ${restoreResult.error}`);
            }

            const duration = Date.now() - startTime;

            return {
                success: true,
                restoredTables: manifest?.tables?.map(t => t.name) || [],
                recordCount: manifest?.totalRecordCount || 0,
                duration,
                warnings: validation.warnings || []
            };

        } catch (error) {
            console.error('[BACKUP-MANAGER] Full restore failed:', error);
            throw new Error(`Full restore failed: ${error.message}`);
        }
    }

    /**
     * Execute psql restore command
     */
    async executePsqlRestore(inputPath, compressed, options = {}) {
        return new Promise(async (resolve, reject) => {
            try {
                const connectionString = this.getConnectionString();
                const psqlArgs = [
                    connectionString,
                    ...BackupConfig.psql.options
                ];

                if (options.onConflict === 'skip') {
                    psqlArgs.push('--set=ON_ERROR_STOP=0'); // Continue on error
                }

                const psql = spawn(BackupConfig.psql.path, psqlArgs);
                let stderr = '';

                // Handle input
                let inputStream = fsSync.createReadStream(inputPath);
                if (compressed) {
                    const gunzip = CompressionUtils.createDecompressionStream();
                    await pipeline(inputStream, gunzip, psql.stdin);
                } else {
                    await pipeline(inputStream, psql.stdin);
                }

                psql.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                psql.on('error', (error) => {
                    reject(new Error(`psql process error: ${error.message}`));
                });

                psql.on('close', (code) => {
                    if (code === 0 || (code !== 0 && options.onConflict === 'skip')) {
                        resolve({ success: true, warnings: stderr });
                    } else {
                        resolve({ success: false, error: stderr || `psql exited with code ${code}` });
                    }
                });

            } catch (error) {
                reject(new Error(`Restore execution error: ${error.message}`));
            }
        });
    }

    /**
     * Export table data to JSON
     */
    async exportToJson(tableName, options = {}) {
        const startTime = Date.now();

        try {
            // Validate table
            SecurityValidator.validateTable(tableName);

            // Initialize storage
            await this.storageManager.initialize();

            // Generate filename
            const filename = this.storageManager.generateFilename(
                BackupConfig.fileNames.exportJson,
                { table: tableName }
            );

            // Build query
            const where = options.where || null;
            const limit = options.limit || null;

            let query = `SELECT * FROM "${tableName}"`;
            const params = [];

            if (where) {
                // Simple WHERE clause support
                const conditions = [];
                let paramCount = 1;

                for (const [column, value] of Object.entries(where)) {
                    conditions.push(`"${column}" = $${paramCount++}`);
                    params.push(value);
                }

                if (conditions.length > 0) {
                    query += ' WHERE ' + conditions.join(' AND ');
                }
            }

            if (limit) {
                query += ` LIMIT ${parseInt(limit, 10)}`;
            }

            // Execute query
            const result = await this.db.query(query, params);

            // Write JSON file
            const jsonContent = JSON.stringify(result.rows, null, 2);
            await this.storageManager.writeFile(filename, jsonContent);

            const duration = Date.now() - startTime;

            return {
                success: true,
                exportFile: filename,
                format: 'json',
                recordCount: result.rows.length,
                duration
            };

        } catch (error) {
            console.error('[BACKUP-MANAGER] JSON export failed:', error);
            throw new Error(`JSON export failed: ${error.message}`);
        }
    }

    /**
     * Export table data to CSV
     */
    async exportToCsv(tableName, options = {}) {
        const startTime = Date.now();

        try {
            // Validate table
            SecurityValidator.validateTable(tableName);

            // Initialize storage
            await this.storageManager.initialize();

            // Generate filename
            const filename = this.storageManager.generateFilename(
                BackupConfig.fileNames.exportCsv,
                { table: tableName }
            );

            // Build query
            const where = options.where || null;
            const limit = options.limit || null;

            let query = `SELECT * FROM "${tableName}"`;
            const params = [];

            if (where) {
                const conditions = [];
                let paramCount = 1;

                for (const [column, value] of Object.entries(where)) {
                    conditions.push(`"${column}" = $${paramCount++}`);
                    params.push(value);
                }

                if (conditions.length > 0) {
                    query += ' WHERE ' + conditions.join(' AND ');
                }
            }

            if (limit) {
                query += ` LIMIT ${parseInt(limit, 10)}`;
            }

            // Execute query
            const result = await this.db.query(query, params);

            if (result.rows.length === 0) {
                return {
                    success: true,
                    exportFile: filename,
                    format: 'csv',
                    recordCount: 0,
                    duration: Date.now() - startTime
                };
            }

            // Convert to CSV
            const headers = Object.keys(result.rows[0]);
            const csvLines = [headers.join(',')];

            for (const row of result.rows) {
                const values = headers.map(header => {
                    const value = row[header];
                    if (value === null) return '';
                    if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                });
                csvLines.push(values.join(','));
            }

            const csvContent = csvLines.join('\n');
            await this.storageManager.writeFile(filename, csvContent);

            const duration = Date.now() - startTime;

            return {
                success: true,
                exportFile: filename,
                format: 'csv',
                recordCount: result.rows.length,
                duration
            };

        } catch (error) {
            console.error('[BACKUP-MANAGER] CSV export failed:', error);
            throw new Error(`CSV export failed: ${error.message}`);
        }
    }

    /**
     * Import JSON data into table
     */
    async importFromJson(tableName, jsonFile, options = {}) {
        const startTime = Date.now();

        try {
            // Validate table
            SecurityValidator.validateTable(tableName);

            // Validate JSON file
            const validation = await this.validationUtils.validateJsonFile(jsonFile);
            if (!validation.valid) {
                throw new Error(`Invalid JSON file: ${validation.errors.join(', ')}`);
            }

            // Read JSON file
            const content = await this.storageManager.readFile(jsonFile);
            const records = JSON.parse(content);

            const onConflict = options.onConflict || 'error'; // 'error', 'skip', 'update'
            let importedCount = 0;
            const errors = [];

            // Import records
            for (let i = 0; i < records.length; i++) {
                try {
                    const record = records[i];
                    const columns = Object.keys(record);
                    const values = Object.values(record);

                    // Build INSERT query
                    const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
                    let query = `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

                    if (onConflict === 'update' && columns.includes('id')) {
                        const updateSet = columns
                            .filter(c => c !== 'id')
                            .map(c => `"${c}" = EXCLUDED."${c}"`)
                            .join(', ');
                        query += ` ON CONFLICT (id) DO UPDATE SET ${updateSet}`;
                    } else if (onConflict === 'skip') {
                        query += ' ON CONFLICT DO NOTHING';
                    }

                    await this.db.query(query, values);
                    importedCount++;

                } catch (error) {
                    if (onConflict === 'error') {
                        throw error;
                    }
                    errors.push(`Record ${i}: ${error.message}`);
                }
            }

            const duration = Date.now() - startTime;

            return {
                success: true,
                importedRecords: importedCount,
                totalRecords: records.length,
                errors: errors.length > 0 ? errors : undefined,
                duration
            };

        } catch (error) {
            console.error('[BACKUP-MANAGER] JSON import failed:', error);
            throw new Error(`JSON import failed: ${error.message}`);
        }
    }

    /**
     * Import CSV data into table
     */
    async importFromCsv(tableName, csvFile, options = {}) {
        const startTime = Date.now();

        try {
            // Validate table
            SecurityValidator.validateTable(tableName);

            // Validate CSV file
            const validation = await this.validationUtils.validateCsvFile(csvFile);
            if (!validation.valid) {
                throw new Error(`Invalid CSV file: ${validation.errors.join(', ')}`);
            }

            // Read CSV file
            const content = await this.storageManager.readFile(csvFile);
            const lines = content.split('\n').filter(line => line.trim());

            const hasHeaders = options.hasHeaders ?? true;
            const onConflict = options.onConflict || 'error';

            let headers;
            let startRow = 0;

            if (hasHeaders) {
                headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                startRow = 1;
            } else {
                // Get columns from database
                const schemaQuery = `
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = $1
                    ORDER BY ordinal_position;
                `;
                const schemaResult = await this.db.query(schemaQuery, [tableName]);
                headers = schemaResult.rows.map(row => row.column_name);
            }

            let importedCount = 0;
            let skippedRows = 0;
            const errors = [];

            // Import rows
            for (let i = startRow; i < lines.length; i++) {
                try {
                    const values = this.parseCsvLine(lines[i]);

                    if (values.length !== headers.length) {
                        skippedRows++;
                        errors.push(`Row ${i + 1}: Column count mismatch`);
                        continue;
                    }

                    // Build INSERT query
                    const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
                    let query = `INSERT INTO "${tableName}" (${headers.map(h => `"${h}"`).join(', ')}) VALUES (${placeholders})`;

                    if (onConflict === 'update' && headers.includes('id')) {
                        const updateSet = headers
                            .filter(h => h !== 'id')
                            .map(h => `"${h}" = EXCLUDED."${h}"`)
                            .join(', ');
                        query += ` ON CONFLICT (id) DO UPDATE SET ${updateSet}`;
                    } else if (onConflict === 'skip') {
                        query += ' ON CONFLICT DO NOTHING';
                    }

                    // Convert empty strings to null
                    const params = values.map(v => v === '' ? null : v);

                    await this.db.query(query, params);
                    importedCount++;

                } catch (error) {
                    if (onConflict === 'error') {
                        throw error;
                    }
                    skippedRows++;
                    errors.push(`Row ${i + 1}: ${error.message}`);
                }
            }

            const duration = Date.now() - startTime;

            return {
                success: true,
                importedRecords: importedCount,
                skippedRows,
                totalRows: lines.length - startRow,
                errors: errors.length > 0 ? errors.slice(0, 10) : undefined, // Limit error messages
                duration
            };

        } catch (error) {
            console.error('[BACKUP-MANAGER] CSV import failed:', error);
            throw new Error(`CSV import failed: ${error.message}`);
        }
    }

    /**
     * Parse CSV line handling quoted values
     */
    parseCsvLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current);
        return result;
    }

    /**
     * Get database connection string from environment
     */
    getConnectionString() {
        return process.env.DATABASE_URL || 'postgresql://writer:password@localhost:5432/mcp_series';
    }

    /**
     * Get database name from connection string
     */
    getDatabaseName() {
        const url = this.getConnectionString();
        const match = url.match(/\/([^/?]+)(\?|$)/);
        return match ? match[1] : 'unknown';
    }

    /**
     * Get PostgreSQL version
     */
    async getPostgresVersion() {
        try {
            const result = await this.db.query('SELECT version()');
            const versionString = result.rows[0].version;
            const match = versionString.match(/PostgreSQL ([\d.]+)/);
            return match ? match[1] : 'unknown';
        } catch (error) {
            return 'unknown';
        }
    }
}

export default BackupManager;
