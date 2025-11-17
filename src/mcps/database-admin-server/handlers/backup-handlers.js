// src/mcps/database-admin-server/handlers/backup-handlers.js
// Backup and Restore Handler - Database backup, restore, import/export operations

import { backupToolsSchema } from '../schemas/backup-tools-schema.js';
import { BackupManager } from '../utils/backup-manager.js';
import { StorageManager } from '../utils/storage-manager.js';
import { ValidationUtils } from '../utils/validation-utils.js';
import { AuditLogger } from '../utils/audit-logger.js';

export class BackupHandlers {
    constructor(db) {
        this.db = db;
        this.backupManager = new BackupManager(db);
        this.storageManager = new StorageManager();
        this.validationUtils = new ValidationUtils();
        this.auditLogger = new AuditLogger(db);
    }

    // =============================================
    // TOOL DEFINITIONS
    // =============================================
    getBackupTools() {
        return backupToolsSchema;
    }

    // =============================================
    // BACKUP TOOLS
    // =============================================

    /**
     * db_backup_full - Create full database backup
     */
    async handleBackupFull(args) {
        const startTime = Date.now();
        const { compress = true, includeSchema = true } = args;

        try {
            console.error('[BACKUP] Starting full database backup...');

            const result = await this.backupManager.createFullBackup({
                compress,
                includeSchema
            });

            // Audit log
            const executionTime = Date.now() - startTime;
            await this.auditLogger.log({
                operation: 'BACKUP_FULL',
                table: 'all',
                status: 'success',
                executionTime,
                metadata: { backupFile: result.backupFile, size: result.size }
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: `Full Database Backup Complete!\n\n` +
                              `Backup File: ${result.backupFile}\n` +
                              `Size: ${(result.size / 1024 / 1024).toFixed(2)} MB\n` +
                              `Tables: ${result.tables}\n` +
                              `Total Records: ${result.recordCount}\n` +
                              `Duration: ${(result.duration / 1000).toFixed(2)}s\n` +
                              `Compressed: ${result.compressed ? 'Yes' : 'No'}\n` +
                              `Checksum: ${result.checksum}\n\n` +
                              JSON.stringify(result, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error('[BACKUP] handleBackupFull error:', error);

            const executionTime = Date.now() - startTime;
            await this.auditLogger.log({
                operation: 'BACKUP_FULL',
                table: 'all',
                status: 'failure',
                executionTime,
                error: error.message
            });

            throw new Error(`Failed to create full backup: ${error.message}`);
        }
    }

    /**
     * db_backup_table - Backup individual table(s)
     */
    async handleBackupTable(args) {
        const startTime = Date.now();
        const { table, dataOnly = false, schemaOnly = false, compress = true } = args;

        try {
            console.error(`[BACKUP] Starting backup of table '${table}'...`);

            const result = await this.backupManager.createTableBackup(table, {
                dataOnly,
                schemaOnly,
                compress
            });

            // Audit log
            const executionTime = Date.now() - startTime;
            await this.auditLogger.log({
                operation: 'BACKUP_TABLE',
                table,
                status: 'success',
                executionTime,
                metadata: { backupFile: result.backupFile, recordCount: result.recordCount }
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: `Table Backup Complete!\n\n` +
                              `Table: ${result.table}\n` +
                              `Backup File: ${result.backupFile}\n` +
                              `Records: ${result.recordCount}\n` +
                              `Size: ${(result.size / 1024).toFixed(2)} KB\n` +
                              `Duration: ${(result.duration / 1000).toFixed(2)}s\n\n` +
                              JSON.stringify(result, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error('[BACKUP] handleBackupTable error:', error);

            const executionTime = Date.now() - startTime;
            await this.auditLogger.log({
                operation: 'BACKUP_TABLE',
                table,
                status: 'failure',
                executionTime,
                error: error.message
            });

            throw new Error(`Failed to backup table: ${error.message}`);
        }
    }

    /**
     * db_backup_incremental - Create incremental backup (placeholder for now)
     */
    async handleBackupIncremental(args) {
        const startTime = Date.now();
        const { baseBackup } = args;

        try {
            // NOTE: Full incremental backup implementation would require
            // tracking changes via updated_at timestamps and storing deltas
            // For now, we'll create a full backup and note it as incremental

            console.error('[BACKUP] Incremental backups not fully implemented, creating full backup...');

            const result = await this.backupManager.createFullBackup({
                compress: true,
                includeSchema: false // Only data for incremental
            });

            // Audit log
            const executionTime = Date.now() - startTime;
            await this.auditLogger.log({
                operation: 'BACKUP_INCREMENTAL',
                table: 'all',
                status: 'success',
                executionTime,
                metadata: { backupFile: result.backupFile }
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: `Incremental Backup Created (currently creates full backup)!\n\n` +
                              `Note: Full incremental backup with change tracking will be implemented in a future update.\n\n` +
                              `Backup File: ${result.backupFile}\n` +
                              `Size: ${(result.size / 1024 / 1024).toFixed(2)} MB\n` +
                              `Duration: ${(result.duration / 1000).toFixed(2)}s\n\n` +
                              JSON.stringify(result, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error('[BACKUP] handleBackupIncremental error:', error);
            throw new Error(`Failed to create incremental backup: ${error.message}`);
        }
    }

    /**
     * db_export_json - Export table data to JSON
     */
    async handleExportJson(args) {
        const startTime = Date.now();
        const { table, where, limit } = args;

        try {
            console.error(`[BACKUP] Exporting table '${table}' to JSON...`);

            const result = await this.backupManager.exportToJson(table, {
                where,
                limit
            });

            // Audit log
            const executionTime = Date.now() - startTime;
            await this.auditLogger.log({
                operation: 'EXPORT_JSON',
                table,
                status: 'success',
                executionTime,
                metadata: { exportFile: result.exportFile, recordCount: result.recordCount }
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: `JSON Export Complete!\n\n` +
                              `Table: ${table}\n` +
                              `Export File: ${result.exportFile}\n` +
                              `Records Exported: ${result.recordCount}\n` +
                              `Format: ${result.format}\n` +
                              `Duration: ${(result.duration / 1000).toFixed(2)}s\n\n` +
                              JSON.stringify(result, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error('[BACKUP] handleExportJson error:', error);
            throw new Error(`Failed to export to JSON: ${error.message}`);
        }
    }

    /**
     * db_export_csv - Export table data to CSV
     */
    async handleExportCsv(args) {
        const startTime = Date.now();
        const { table, where, limit } = args;

        try {
            console.error(`[BACKUP] Exporting table '${table}' to CSV...`);

            const result = await this.backupManager.exportToCsv(table, {
                where,
                limit
            });

            // Audit log
            const executionTime = Date.now() - startTime;
            await this.auditLogger.log({
                operation: 'EXPORT_CSV',
                table,
                status: 'success',
                executionTime,
                metadata: { exportFile: result.exportFile, recordCount: result.recordCount }
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: `CSV Export Complete!\n\n` +
                              `Table: ${table}\n` +
                              `Export File: ${result.exportFile}\n` +
                              `Records Exported: ${result.recordCount}\n` +
                              `Format: ${result.format}\n` +
                              `Duration: ${(result.duration / 1000).toFixed(2)}s\n\n` +
                              JSON.stringify(result, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error('[BACKUP] handleExportCsv error:', error);
            throw new Error(`Failed to export to CSV: ${error.message}`);
        }
    }

    // =============================================
    // RESTORE TOOLS
    // =============================================

    /**
     * db_restore_full - Restore complete database from backup
     */
    async handleRestoreFull(args) {
        const startTime = Date.now();
        const { backupFile, dropExisting = false, onConflict = 'skip' } = args;

        try {
            console.error('[BACKUP] Starting full database restore...');

            const result = await this.backupManager.restoreFullBackup(backupFile, {
                dropExisting,
                onConflict
            });

            // Audit log
            const executionTime = Date.now() - startTime;
            await this.auditLogger.log({
                operation: 'RESTORE_FULL',
                table: 'all',
                status: 'success',
                executionTime,
                metadata: { backupFile, restoredTables: result.restoredTables.length }
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: `Full Database Restore Complete!\n\n` +
                              `Backup File: ${backupFile}\n` +
                              `Restored Tables: ${result.restoredTables.length}\n` +
                              `Total Records: ${result.recordCount}\n` +
                              `Duration: ${(result.duration / 1000).toFixed(2)}s\n` +
                              `Warnings: ${result.warnings.length}\n\n` +
                              JSON.stringify(result, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error('[BACKUP] handleRestoreFull error:', error);

            const executionTime = Date.now() - startTime;
            await this.auditLogger.log({
                operation: 'RESTORE_FULL',
                table: 'all',
                status: 'failure',
                executionTime,
                error: error.message
            });

            throw new Error(`Failed to restore database: ${error.message}`);
        }
    }

    /**
     * db_restore_table - Restore specific table from backup
     */
    async handleRestoreTable(args) {
        const startTime = Date.now();
        const { backupFile, table, onConflict = 'skip' } = args;

        try {
            console.error(`[BACKUP] Restoring table '${table}' from backup...`);

            // For table restore, we use the same restore mechanism
            // but the backup file should be a table-specific backup
            const result = await this.backupManager.restoreFullBackup(backupFile, {
                dropExisting: false,
                onConflict
            });

            // Audit log
            const executionTime = Date.now() - startTime;
            await this.auditLogger.log({
                operation: 'RESTORE_TABLE',
                table,
                status: 'success',
                executionTime,
                metadata: { backupFile }
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: `Table Restore Complete!\n\n` +
                              `Table: ${table}\n` +
                              `Backup File: ${backupFile}\n` +
                              `Duration: ${(result.duration / 1000).toFixed(2)}s\n\n` +
                              JSON.stringify(result, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error('[BACKUP] handleRestoreTable error:', error);
            throw new Error(`Failed to restore table: ${error.message}`);
        }
    }

    /**
     * db_import_json - Import data from JSON file
     */
    async handleImportJson(args) {
        const startTime = Date.now();
        const { table, jsonFile, onConflict = 'error' } = args;

        try {
            console.error(`[BACKUP] Importing JSON data into table '${table}'...`);

            const result = await this.backupManager.importFromJson(table, jsonFile, {
                onConflict
            });

            // Audit log
            const executionTime = Date.now() - startTime;
            await this.auditLogger.log({
                operation: 'IMPORT_JSON',
                table,
                status: 'success',
                executionTime,
                metadata: { jsonFile, importedRecords: result.importedRecords }
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: `JSON Import Complete!\n\n` +
                              `Table: ${table}\n` +
                              `JSON File: ${jsonFile}\n` +
                              `Imported Records: ${result.importedRecords}\n` +
                              `Total Records: ${result.totalRecords}\n` +
                              `Duration: ${(result.duration / 1000).toFixed(2)}s\n` +
                              (result.errors ? `\nErrors: ${result.errors.length}\n` : '') +
                              `\n${JSON.stringify(result, null, 2)}`
                    }
                ]
            };
        } catch (error) {
            console.error('[BACKUP] handleImportJson error:', error);
            throw new Error(`Failed to import JSON: ${error.message}`);
        }
    }

    /**
     * db_import_csv - Import data from CSV file
     */
    async handleImportCsv(args) {
        const startTime = Date.now();
        const { table, csvFile, hasHeaders = true, onConflict = 'error' } = args;

        try {
            console.error(`[BACKUP] Importing CSV data into table '${table}'...`);

            const result = await this.backupManager.importFromCsv(table, csvFile, {
                hasHeaders,
                onConflict
            });

            // Audit log
            const executionTime = Date.now() - startTime;
            await this.auditLogger.log({
                operation: 'IMPORT_CSV',
                table,
                status: 'success',
                executionTime,
                metadata: { csvFile, importedRecords: result.importedRecords }
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: `CSV Import Complete!\n\n` +
                              `Table: ${table}\n` +
                              `CSV File: ${csvFile}\n` +
                              `Imported Records: ${result.importedRecords}\n` +
                              `Skipped Rows: ${result.skippedRows}\n` +
                              `Total Rows: ${result.totalRows}\n` +
                              `Duration: ${(result.duration / 1000).toFixed(2)}s\n` +
                              (result.errors ? `\nErrors (first 10): ${result.errors.length}\n` : '') +
                              `\n${JSON.stringify(result, null, 2)}`
                    }
                ]
            };
        } catch (error) {
            console.error('[BACKUP] handleImportCsv error:', error);
            throw new Error(`Failed to import CSV: ${error.message}`);
        }
    }

    // =============================================
    // BACKUP MANAGEMENT TOOLS
    // =============================================

    /**
     * db_list_backups - List all available backups
     */
    async handleListBackups(args) {
        const startTime = Date.now();
        const { type, sortBy = 'date', limit } = args;

        try {
            console.error('[BACKUP] Listing available backups...');

            const backups = await this.storageManager.listBackups({
                type,
                sortBy,
                limit
            });

            // Format response
            const backupList = backups.map(backup => ({
                filename: backup.filename,
                type: backup.type,
                size: `${(backup.size / 1024 / 1024).toFixed(2)} MB`,
                created: backup.created.toISOString(),
                tables: backup.metadata?.tables?.length || 'unknown',
                recordCount: backup.metadata?.totalRecordCount || backup.metadata?.recordCount || 'unknown'
            }));

            return {
                content: [
                    {
                        type: 'text',
                        text: `Available Backups (${backups.length}):\n\n` +
                              backupList.map((b, i) =>
                                  `${i + 1}. ${b.filename}\n` +
                                  `   Type: ${b.type}\n` +
                                  `   Size: ${b.size}\n` +
                                  `   Created: ${b.created}\n` +
                                  `   Tables: ${b.tables}\n` +
                                  `   Records: ${b.recordCount}\n`
                              ).join('\n') +
                              `\n${JSON.stringify({ success: true, backups: backupList }, null, 2)}`
                    }
                ]
            };
        } catch (error) {
            console.error('[BACKUP] handleListBackups error:', error);
            throw new Error(`Failed to list backups: ${error.message}`);
        }
    }

    /**
     * db_delete_backup - Delete backup file
     */
    async handleDeleteBackup(args) {
        const startTime = Date.now();
        const { backupFile } = args;

        try {
            console.error(`[BACKUP] Deleting backup '${backupFile}'...`);

            const result = await this.storageManager.deleteBackup(backupFile);

            // Audit log
            const executionTime = Date.now() - startTime;
            await this.auditLogger.log({
                operation: 'DELETE_BACKUP',
                table: 'backup_management',
                status: 'success',
                executionTime,
                metadata: { backupFile, freedSpace: result.freedSpace }
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: `Backup Deleted!\n\n` +
                              `Deleted File: ${result.deletedFile}\n` +
                              `Freed Space: ${(result.freedSpace / 1024 / 1024).toFixed(2)} MB\n\n` +
                              JSON.stringify(result, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error('[BACKUP] handleDeleteBackup error:', error);
            throw new Error(`Failed to delete backup: ${error.message}`);
        }
    }

    /**
     * db_validate_backup - Validate backup file integrity
     */
    async handleValidateBackup(args) {
        const startTime = Date.now();
        const { backupFile } = args;

        try {
            console.error(`[BACKUP] Validating backup '${backupFile}'...`);

            const result = await this.validationUtils.validateBackup(backupFile);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Backup Validation ${result.valid ? 'PASSED' : 'FAILED'}!\n\n` +
                              `File: ${backupFile}\n` +
                              `Valid: ${result.valid ? 'Yes' : 'No'}\n` +
                              `File Size: ${result.fileSize ? (result.fileSize / 1024 / 1024).toFixed(2) + ' MB' : 'unknown'}\n` +
                              `Type: ${result.fileType || 'unknown'}\n` +
                              `Has Manifest: ${result.hasManifest ? 'Yes' : 'No'}\n` +
                              `\nErrors: ${result.errors.length}\n` +
                              (result.errors.length > 0 ? result.errors.map(e => `  - ${e}`).join('\n') + '\n' : '') +
                              `\nWarnings: ${result.warnings.length}\n` +
                              (result.warnings.length > 0 ? result.warnings.map(w => `  - ${w}`).join('\n') + '\n' : '') +
                              `\n${JSON.stringify(result, null, 2)}`
                    }
                ]
            };
        } catch (error) {
            console.error('[BACKUP] handleValidateBackup error:', error);
            throw new Error(`Failed to validate backup: ${error.message}`);
        }
    }
}

export default BackupHandlers;
