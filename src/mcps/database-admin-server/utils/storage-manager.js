// src/mcps/database-admin-server/utils/storage-manager.js
// File storage operations for backup management

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BackupConfig } from '../config/backup-config.js';

export class StorageManager {
    constructor(backupDirectory = BackupConfig.backupDirectory) {
        this.backupDirectory = backupDirectory;
    }

    /**
     * Initialize backup directory structure
     */
    async initialize() {
        try {
            await fs.mkdir(this.backupDirectory, { recursive: true, mode: 0o700 });
            console.error(`[STORAGE-MANAGER] Backup directory initialized: ${this.backupDirectory}`);
            return true;
        } catch (error) {
            console.error('[STORAGE-MANAGER] Failed to initialize backup directory:', error);
            throw new Error(`Failed to initialize backup directory: ${error.message}`);
        }
    }

    /**
     * Generate backup filename from pattern
     */
    generateFilename(pattern, params = {}) {
        let filename = pattern;
        const timestamp = params.timestamp || this.getTimestamp();

        filename = filename.replace('{timestamp}', timestamp);
        filename = filename.replace('{table}', params.table || '');
        filename = filename.replace('{id}', params.id || `backup-${timestamp}`);
        filename = filename.replace('{ext}', params.compressed ? '.gz' : '');

        // Sanitize filename if security setting is enabled
        if (BackupConfig.security.sanitizeFilenames) {
            filename = this.sanitizeFilename(filename);
        }

        return filename;
    }

    /**
     * Get current timestamp in format YYYYMMDD-HHMMSS
     */
    getTimestamp() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
    }

    /**
     * Sanitize filename to prevent directory traversal
     */
    sanitizeFilename(filename) {
        // Remove any directory path components
        filename = path.basename(filename);

        // Remove any characters that aren't alphanumeric, dash, underscore, or dot
        filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

        return filename;
    }

    /**
     * Get full path for backup file
     */
    getBackupPath(filename) {
        return path.join(this.backupDirectory, filename);
    }

    /**
     * Write backup file
     */
    async writeFile(filename, content, options = {}) {
        try {
            const filepath = this.getBackupPath(filename);

            // Ensure directory exists
            await this.initialize();

            // Write file
            if (options.stream) {
                // For large files, return a writable stream
                return fsSync.createWriteStream(filepath, { mode: 0o600 });
            } else {
                // For smaller files, write directly
                await fs.writeFile(filepath, content, { mode: 0o600 });
            }

            // Calculate file size
            const stats = await fs.stat(filepath);

            return {
                filepath,
                filename,
                size: stats.size
            };
        } catch (error) {
            console.error('[STORAGE-MANAGER] Failed to write file:', error);
            throw new Error(`Failed to write backup file: ${error.message}`);
        }
    }

    /**
     * Read backup file
     */
    async readFile(filename, options = {}) {
        try {
            const filepath = this.getBackupPath(filename);

            // Check if file exists
            await fs.access(filepath, fs.constants.R_OK);

            if (options.stream) {
                // Return readable stream for large files
                return fsSync.createReadStream(filepath);
            } else {
                // Read entire file
                return await fs.readFile(filepath, options.encoding || 'utf8');
            }
        } catch (error) {
            console.error('[STORAGE-MANAGER] Failed to read file:', error);
            throw new Error(`Failed to read backup file: ${error.message}`);
        }
    }

    /**
     * List all backup files
     */
    async listBackups(options = {}) {
        try {
            // Ensure directory exists
            await this.initialize();

            const files = await fs.readdir(this.backupDirectory);
            const backups = [];

            for (const file of files) {
                // Filter by type if specified
                if (options.type) {
                    const typePrefix = `backup-${options.type}`;
                    if (!file.startsWith(typePrefix)) continue;
                }

                // Filter exports separately
                if (options.exportsOnly) {
                    if (!file.startsWith('export-')) continue;
                } else if (file.startsWith('export-')) {
                    continue; // Skip exports unless specifically requested
                }

                const filepath = this.getBackupPath(file);
                const stats = await fs.stat(filepath);

                const backupInfo = {
                    filename: file,
                    filepath,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime,
                    type: this.detectBackupType(file)
                };

                // Try to load manifest if exists
                const manifestFile = file.replace(/\.(sql|json|csv)(\.gz)?$/, '-manifest.json');
                try {
                    const manifestPath = this.getBackupPath(manifestFile);
                    const manifestContent = await fs.readFile(manifestPath, 'utf8');
                    backupInfo.metadata = JSON.parse(manifestContent);
                } catch (err) {
                    // Manifest doesn't exist, skip
                }

                backups.push(backupInfo);
            }

            // Sort by date (newest first) unless otherwise specified
            const sortBy = options.sortBy || 'date';
            if (sortBy === 'date') {
                backups.sort((a, b) => b.created - a.created);
            } else if (sortBy === 'size') {
                backups.sort((a, b) => b.size - a.size);
            }

            // Apply limit if specified
            if (options.limit) {
                return backups.slice(0, options.limit);
            }

            return backups;
        } catch (error) {
            console.error('[STORAGE-MANAGER] Failed to list backups:', error);
            throw new Error(`Failed to list backups: ${error.message}`);
        }
    }

    /**
     * Detect backup type from filename
     */
    detectBackupType(filename) {
        if (filename.startsWith('backup-full')) return 'full';
        if (filename.startsWith('backup-table')) return 'table';
        if (filename.startsWith('backup-incremental')) return 'incremental';
        if (filename.startsWith('export-')) {
            if (filename.endsWith('.json')) return 'export-json';
            if (filename.endsWith('.csv')) return 'export-csv';
        }
        return 'unknown';
    }

    /**
     * Delete backup file
     */
    async deleteBackup(filename) {
        try {
            const filepath = this.getBackupPath(filename);

            // Check if file exists
            await fs.access(filepath, fs.constants.W_OK);

            // Get file size before deletion
            const stats = await fs.stat(filepath);
            const size = stats.size;

            // Delete the backup file
            await fs.unlink(filepath);

            // Try to delete associated manifest
            const manifestFile = filename.replace(/\.(sql|json|csv)(\.gz)?$/, '-manifest.json');
            try {
                const manifestPath = this.getBackupPath(manifestFile);
                await fs.unlink(manifestPath);
            } catch (err) {
                // Manifest doesn't exist, that's ok
            }

            return {
                success: true,
                deletedFile: filename,
                freedSpace: size
            };
        } catch (error) {
            console.error('[STORAGE-MANAGER] Failed to delete backup:', error);
            throw new Error(`Failed to delete backup: ${error.message}`);
        }
    }

    /**
     * Calculate file checksum
     */
    async calculateChecksum(filename, algorithm = 'sha256') {
        try {
            const filepath = this.getBackupPath(filename);
            const hash = crypto.createHash(algorithm);
            const stream = fsSync.createReadStream(filepath);

            return new Promise((resolve, reject) => {
                stream.on('data', (chunk) => hash.update(chunk));
                stream.on('end', () => resolve(hash.digest('hex')));
                stream.on('error', reject);
            });
        } catch (error) {
            console.error('[STORAGE-MANAGER] Failed to calculate checksum:', error);
            throw new Error(`Failed to calculate checksum: ${error.message}`);
        }
    }

    /**
     * Clean up old backups based on retention policy
     */
    async cleanupOldBackups() {
        try {
            const backups = await this.listBackups();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - BackupConfig.retentionDays);

            const deletedBackups = [];
            let freedSpace = 0;

            for (const backup of backups) {
                if (backup.created < cutoffDate) {
                    const result = await this.deleteBackup(backup.filename);
                    deletedBackups.push(backup.filename);
                    freedSpace += result.freedSpace;
                }
            }

            return {
                success: true,
                deletedCount: deletedBackups.length,
                deletedBackups,
                freedSpace
            };
        } catch (error) {
            console.error('[STORAGE-MANAGER] Failed to cleanup old backups:', error);
            throw new Error(`Failed to cleanup old backups: ${error.message}`);
        }
    }

    /**
     * Save backup metadata (manifest)
     */
    async saveManifest(filename, metadata) {
        try {
            const manifestFilename = filename.replace(/\.(sql|json|csv)(\.gz)?$/, '-manifest.json');
            const manifestPath = this.getBackupPath(manifestFilename);

            await fs.writeFile(manifestPath, JSON.stringify(metadata, null, 2), { mode: 0o600 });

            return manifestFilename;
        } catch (error) {
            console.error('[STORAGE-MANAGER] Failed to save manifest:', error);
            throw new Error(`Failed to save manifest: ${error.message}`);
        }
    }

    /**
     * Load backup metadata (manifest)
     */
    async loadManifest(filename) {
        try {
            const manifestFilename = filename.replace(/\.(sql|json|csv)(\.gz)?$/, '-manifest.json');
            const manifestPath = this.getBackupPath(manifestFilename);

            const content = await fs.readFile(manifestPath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('[STORAGE-MANAGER] Failed to load manifest:', error);
            return null; // Manifest might not exist for older backups
        }
    }
}

export default StorageManager;
