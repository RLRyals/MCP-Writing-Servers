// src/mcps/database-admin-server/schemas/backup-tools-schema.js
// Tool schema definitions for Backup & Restore operations

export const backupToolsSchema = [
    // =============================================
    // BACKUP TOOLS
    // =============================================
    {
        name: 'db_backup_full',
        description: 'Create a full database backup including all tables, schemas, and data. Supports compression and returns backup file details with size, record count, and checksum.',
        inputSchema: {
            type: 'object',
            properties: {
                compress: {
                    type: 'boolean',
                    description: 'Whether to compress the backup file with gzip (default: true)'
                },
                includeSchema: {
                    type: 'boolean',
                    description: 'Whether to include table schemas (CREATE TABLE statements) in backup (default: true)'
                }
            }
        }
    },
    {
        name: 'db_backup_table',
        description: 'Create a backup of specific database table(s). Supports data-only, schema-only, or full backups with optional compression.',
        inputSchema: {
            type: 'object',
            properties: {
                table: {
                    type: 'string',
                    description: 'Table name to backup (must be whitelisted)'
                },
                dataOnly: {
                    type: 'boolean',
                    description: 'Backup only data, not schema (default: false)'
                },
                schemaOnly: {
                    type: 'boolean',
                    description: 'Backup only schema, not data (default: false)'
                },
                compress: {
                    type: 'boolean',
                    description: 'Whether to compress the backup file (default: true)'
                }
            },
            required: ['table']
        }
    },
    {
        name: 'db_backup_incremental',
        description: 'Create an incremental backup containing only changes since the last backup. Requires a base backup and tracks changes via updated_at timestamps.',
        inputSchema: {
            type: 'object',
            properties: {
                baseBackup: {
                    type: 'string',
                    description: 'Filename of the base backup to build upon (optional for first incremental)'
                }
            }
        }
    },
    {
        name: 'db_export_json',
        description: 'Export table data to JSON format for data migration or analysis. Supports filtering with WHERE conditions and record limits.',
        inputSchema: {
            type: 'object',
            properties: {
                table: {
                    type: 'string',
                    description: 'Table name to export (must be whitelisted)'
                },
                where: {
                    type: 'object',
                    description: 'Optional WHERE clause conditions to filter exported records. Example: {"status": "published"}',
                    additionalProperties: true
                },
                limit: {
                    type: 'integer',
                    minimum: 1,
                    description: 'Maximum number of records to export (optional)'
                }
            },
            required: ['table']
        }
    },
    {
        name: 'db_export_csv',
        description: 'Export table data to CSV format with proper escaping and UTF-8 encoding. Includes column headers and supports filtering.',
        inputSchema: {
            type: 'object',
            properties: {
                table: {
                    type: 'string',
                    description: 'Table name to export (must be whitelisted)'
                },
                where: {
                    type: 'object',
                    description: 'Optional WHERE clause conditions to filter exported records. Example: {"status": "active"}',
                    additionalProperties: true
                },
                limit: {
                    type: 'integer',
                    minimum: 1,
                    description: 'Maximum number of records to export (optional)'
                }
            },
            required: ['table']
        }
    },

    // =============================================
    // RESTORE TOOLS
    // =============================================
    {
        name: 'db_restore_full',
        description: 'Restore complete database from a backup file. Validates backup integrity before restore and supports conflict resolution strategies.',
        inputSchema: {
            type: 'object',
            properties: {
                backupFile: {
                    type: 'string',
                    description: 'Backup filename to restore from (e.g., "backup-full-20251116-103045.sql.gz")'
                },
                dropExisting: {
                    type: 'boolean',
                    description: 'Whether to drop existing tables before restore (default: false, USE WITH CAUTION)'
                },
                onConflict: {
                    type: 'string',
                    enum: ['error', 'skip', 'overwrite'],
                    description: 'How to handle conflicting records: error (stop), skip (ignore), or overwrite (default: skip)'
                }
            },
            required: ['backupFile']
        }
    },
    {
        name: 'db_restore_table',
        description: 'Restore a specific table from a table backup file. Validates foreign key constraints and handles record conflicts.',
        inputSchema: {
            type: 'object',
            properties: {
                backupFile: {
                    type: 'string',
                    description: 'Table backup filename to restore from (e.g., "backup-table-books-20251116-103045.sql.gz")'
                },
                table: {
                    type: 'string',
                    description: 'Table name being restored (for validation)'
                },
                onConflict: {
                    type: 'string',
                    enum: ['error', 'skip', 'overwrite'],
                    description: 'How to handle conflicting records: error (stop), skip (ignore), or overwrite (default: skip)'
                }
            },
            required: ['backupFile', 'table']
        }
    },
    {
        name: 'db_import_json',
        description: 'Import data from JSON export file into a table. Validates JSON structure and supports upsert operations.',
        inputSchema: {
            type: 'object',
            properties: {
                table: {
                    type: 'string',
                    description: 'Table name to import into (must be whitelisted)'
                },
                jsonFile: {
                    type: 'string',
                    description: 'JSON filename to import from (e.g., "export-books-20251116-103045.json")'
                },
                onConflict: {
                    type: 'string',
                    enum: ['error', 'skip', 'update'],
                    description: 'How to handle conflicts: error (stop), skip (ignore duplicates), or update (upsert on conflict) (default: error)'
                }
            },
            required: ['table', 'jsonFile']
        }
    },
    {
        name: 'db_import_csv',
        description: 'Import data from CSV file into a table. Supports header row detection, type conversion, and conflict resolution.',
        inputSchema: {
            type: 'object',
            properties: {
                table: {
                    type: 'string',
                    description: 'Table name to import into (must be whitelisted)'
                },
                csvFile: {
                    type: 'string',
                    description: 'CSV filename to import from (e.g., "export-characters-20251116-103045.csv")'
                },
                hasHeaders: {
                    type: 'boolean',
                    description: 'Whether the CSV file has a header row with column names (default: true)'
                },
                onConflict: {
                    type: 'string',
                    enum: ['error', 'skip', 'update'],
                    description: 'How to handle conflicts: error (stop), skip (ignore duplicates), or update (upsert on conflict) (default: error)'
                }
            },
            required: ['table', 'csvFile']
        }
    },

    // =============================================
    // BACKUP MANAGEMENT TOOLS
    // =============================================
    {
        name: 'db_list_backups',
        description: 'List all available backups with metadata including size, date, tables, and record counts. Supports filtering and sorting.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['full', 'table', 'incremental'],
                    description: 'Filter by backup type (optional)'
                },
                sortBy: {
                    type: 'string',
                    enum: ['date', 'size'],
                    description: 'Sort order: date (newest first) or size (largest first) (default: date)'
                },
                limit: {
                    type: 'integer',
                    minimum: 1,
                    description: 'Maximum number of backups to return (optional)'
                }
            }
        }
    },
    {
        name: 'db_delete_backup',
        description: 'Delete a backup file and its associated manifest. Returns freed disk space. USE WITH CAUTION - deletion is permanent.',
        inputSchema: {
            type: 'object',
            properties: {
                backupFile: {
                    type: 'string',
                    description: 'Backup filename to delete (e.g., "backup-full-20251116-103045.sql.gz")'
                }
            },
            required: ['backupFile']
        }
    },
    {
        name: 'db_validate_backup',
        description: 'Validate backup file integrity by checking checksums, file format, SQL syntax, and dependencies. Returns detailed validation report.',
        inputSchema: {
            type: 'object',
            properties: {
                backupFile: {
                    type: 'string',
                    description: 'Backup filename to validate (e.g., "backup-full-20251116-103045.sql.gz")'
                }
            },
            required: ['backupFile']
        }
    }
];

export default backupToolsSchema;
