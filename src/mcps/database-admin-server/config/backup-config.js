// src/mcps/database-admin-server/config/backup-config.js
// Backup configuration for database backup and restore operations

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default backup directory (can be overridden by environment variable)
const DEFAULT_BACKUP_DIR = process.env.BACKUP_DIR ||
    path.join(__dirname, '../../../../backups/database');

export const BackupConfig = {
    // Backup storage directory
    backupDirectory: DEFAULT_BACKUP_DIR,

    // Retention policy (in days)
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || 30,

    // Compression settings
    compression: {
        enabled: process.env.BACKUP_COMPRESSION !== 'false', // Default true
        level: 9 // gzip compression level (0-9, 9 = best compression)
    },

    // Backup scheduling (cron format)
    schedule: {
        full: process.env.BACKUP_SCHEDULE_FULL || '0 2 * * *',      // 2 AM daily
        incremental: process.env.BACKUP_SCHEDULE_INCREMENTAL || '0 * * * *'  // Every hour
    },

    // Notification settings
    notifications: {
        email: process.env.BACKUP_NOTIFICATION_EMAIL || null,
        onSuccess: true,
        onFailure: true
    },

    // Performance settings
    performance: {
        parallelBackup: true,
        maxParallelTables: 5,
        streamLargeBackups: true,
        largeBackupThreshold: 10 * 1024 * 1024 // 10MB
    },

    // File naming patterns
    fileNames: {
        full: 'backup-full-{timestamp}.sql{ext}',
        table: 'backup-table-{table}-{timestamp}.sql{ext}',
        incremental: 'backup-incremental-{timestamp}-delta.sql{ext}',
        exportJson: 'export-{table}-{timestamp}.json',
        exportCsv: 'export-{table}-{timestamp}.csv',
        manifest: 'backup-{id}-manifest.json'
    },

    // Backup validation settings
    validation: {
        checksumAlgorithm: 'sha256',
        validateBeforeRestore: true,
        dryRunFirst: false
    },

    // Database connection settings for pg_dump/psql
    pgDump: {
        path: process.env.PG_DUMP_PATH || 'pg_dump',
        options: [
            '--no-owner',           // Don't output ownership commands
            '--no-privileges',      // Don't output privilege commands
            '--clean',              // Include DROP statements
            '--if-exists',          // Use IF EXISTS with DROP
            '--create',             // Include CREATE DATABASE
            '--column-inserts',     // Use column names in INSERT
            '--rows-per-insert=1000' // Batch inserts
        ]
    },

    psql: {
        path: process.env.PSQL_PATH || 'psql',
        options: [
            '--quiet',              // Run quietly
            '--no-psqlrc'           // Don't read startup file
        ]
    },

    // Security settings
    security: {
        encryptBackups: process.env.BACKUP_ENCRYPT === 'true',
        encryptionKey: process.env.BACKUP_ENCRYPTION_KEY || null,
        filePermissions: '600', // Owner read/write only
        sanitizeFilenames: true
    },

    // Incremental backup settings
    incremental: {
        enabled: true,
        trackingColumn: 'updated_at',
        baseBackupRequired: true,
        maxDeltaChainLength: 10 // Max number of incremental backups before forcing full backup
    }
};

export default BackupConfig;
