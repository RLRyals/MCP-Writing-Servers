// src/mcps/database-admin-server/index.js
// Database Admin MCP Server
// Provides secure CRUD operations across all database tables
// Runs on port 3010 with PostgreSQL connection

// Protect stdout from debug logging in MCP stdio mode
if (process.env.MCP_STDIO_MODE === 'true') {
    const originalConsoleError = console.error;
    console.error = function() {
        // Keep the original console.error functionality but write to stderr instead
        process.stderr.write(Array.from(arguments).join(' ') + '\n');
    };
}

import { BaseMCPServer } from '../../shared/base-server.js';
import { DatabaseHandlers } from './handlers/database-handlers.js';
import { BatchHandlers } from './handlers/batch-handlers.js';
import { SchemaHandlers } from './handlers/schema-handlers.js';
import { AuditHandlers } from './handlers/audit-handlers.js';
import { BackupHandlers } from './handlers/backup-handlers.js';

class DatabaseAdminMCPServer extends BaseMCPServer {
    constructor() {
        super('database-admin-server', '1.0.0');

        // Initialize database handlers with shared DB connection
        this.databaseHandlers = new DatabaseHandlers(this.db);
        this.batchHandlers = new BatchHandlers(this.db);
        this.schemaHandlers = new SchemaHandlers(this.db);
        this.auditHandlers = new AuditHandlers(this.db);
        this.backupHandlers = new BackupHandlers(this.db);

        // Initialize tools after base constructor
        this.tools = this.getTools();

        // Defensive check to ensure tools are properly initialized
        if (!this.tools || !Array.isArray(this.tools) || this.tools.length === 0) {
            console.error('[DATABASE-ADMIN-SERVER] WARNING: Tools not properly initialized!');
            this.tools = this.getTools(); // Try again
        }

        if (process.env.MCP_STDIO_MODE !== 'true') {
            console.error(`[DATABASE-ADMIN-SERVER] Initialized with ${this.tools.length} tools`);
        }

        // Test database connection on startup (don't wait for it, just start it)
        this.testDatabaseConnection();
    }

    async testDatabaseConnection() {
        try {
            if (this.db) {
                // Quick health check with timeout
                const healthPromise = this.db.healthCheck();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Database health check timed out')), 5000)
                );

                const health = await Promise.race([healthPromise, timeoutPromise]);
                if (health.healthy) {
                    console.error('[DATABASE-ADMIN-SERVER] Database connection verified');
                } else {
                    console.error('[DATABASE-ADMIN-SERVER] Database health check failed:', health.error);
                }
            }
        } catch (error) {
            console.error('[DATABASE-ADMIN-SERVER] Database connection test failed:', error.message);
        }
    }

    getTools() {
        // Get tool definitions from handlers
        const databaseTools = this.databaseHandlers.getDatabaseTools();
        const batchTools = this.batchHandlers.getBatchTools();
        const schemaTools = this.schemaHandlers.getSchemaTools();
        const auditTools = this.auditHandlers.getAuditTools();
        const backupTools = this.backupHandlers.getBackupTools();
        return [...databaseTools, ...batchTools, ...schemaTools, ...auditTools, ...backupTools];
    }

    getToolHandler(toolName) {
        const handlers = {
            // Core CRUD operations
            'db_query_records': this.databaseHandlers.handleQueryRecords.bind(this.databaseHandlers),
            'db_insert_record': this.databaseHandlers.handleInsertRecord.bind(this.databaseHandlers),
            'db_update_records': this.databaseHandlers.handleUpdateRecords.bind(this.databaseHandlers),
            'db_delete_records': this.databaseHandlers.handleDeleteRecords.bind(this.databaseHandlers),
            // Batch operations
            'db_batch_insert': this.batchHandlers.handleBatchInsert.bind(this.batchHandlers),
            'db_batch_update': this.batchHandlers.handleBatchUpdate.bind(this.batchHandlers),
            'db_batch_delete': this.batchHandlers.handleBatchDelete.bind(this.batchHandlers),
            // Schema introspection
            'db_get_schema': this.schemaHandlers.handleGetSchema.bind(this.schemaHandlers),
            'db_list_tables': this.schemaHandlers.handleListTables.bind(this.schemaHandlers),
            'db_get_relationships': this.schemaHandlers.handleGetRelationships.bind(this.schemaHandlers),
            'db_list_table_columns': this.schemaHandlers.handleListTableColumns.bind(this.schemaHandlers),
            // Audit tools
            'db_query_audit_logs': this.auditHandlers.handleQueryAuditLogs.bind(this.auditHandlers),
            'db_get_audit_summary': this.auditHandlers.handleGetAuditSummary.bind(this.auditHandlers),
            // Backup & Restore operations
            'db_backup_full': this.backupHandlers.handleBackupFull.bind(this.backupHandlers),
            'db_backup_table': this.backupHandlers.handleBackupTable.bind(this.backupHandlers),
            'db_backup_incremental': this.backupHandlers.handleBackupIncremental.bind(this.backupHandlers),
            'db_export_json': this.backupHandlers.handleExportJson.bind(this.backupHandlers),
            'db_export_csv': this.backupHandlers.handleExportCsv.bind(this.backupHandlers),
            'db_restore_full': this.backupHandlers.handleRestoreFull.bind(this.backupHandlers),
            'db_restore_table': this.backupHandlers.handleRestoreTable.bind(this.backupHandlers),
            'db_import_json': this.backupHandlers.handleImportJson.bind(this.backupHandlers),
            'db_import_csv': this.backupHandlers.handleImportCsv.bind(this.backupHandlers),
            'db_list_backups': this.backupHandlers.handleListBackups.bind(this.backupHandlers),
            'db_delete_backup': this.backupHandlers.handleDeleteBackup.bind(this.backupHandlers),
            'db_validate_backup': this.backupHandlers.handleValidateBackup.bind(this.backupHandlers)
        };
        return handlers[toolName];
    }
}

export { DatabaseAdminMCPServer };

// CLI runner when called directly (not when imported or run by MCP clients)
import { fileURLToPath } from 'url';

// Only log debug info if not in stdio mode
if (process.env.MCP_STDIO_MODE !== 'true') {
    console.error('[DATABASE-ADMIN-SERVER] Module loaded');
    console.error('[DATABASE-ADMIN-SERVER] MCP_STDIO_MODE:', process.env.MCP_STDIO_MODE);
    console.error('[DATABASE-ADMIN-SERVER] import.meta.url:', import.meta.url);
    console.error('[DATABASE-ADMIN-SERVER] process.argv[1]:', process.argv[1]);
}

// Convert paths to handle cross-platform differences
const currentModuleUrl = import.meta.url;
const scriptPath = process.argv[1];

// Function to normalize paths across platforms for more reliable comparison
const normalizePath = (path) => {
    if (!path) return '';

    // Replace backslashes with forward slashes for Windows
    let normalizedPath = path.replace(/\\/g, '/');

    // Add correct file:// protocol prefix based on platform
    if (!normalizedPath.startsWith('file:')) {
        if (process.platform === 'win32') {
            // Windows paths need triple slash: file:///C:/path
            normalizedPath = `file:///${normalizedPath}`;
        } else {
            // Mac/Linux paths need double slash: file:///Users/path
            normalizedPath = `file://${normalizedPath}`;
        }
    }

    // Fix any malformed protocol slashes (file:/ or file:// to file:///)
    normalizedPath = normalizedPath.replace(/^file:\/+/, 'file:///');

    return normalizedPath;
};

const normalizedScriptPath = normalizePath(scriptPath);
const normalizedCurrentModuleUrl = currentModuleUrl.replace(/\/{3,}/g, '///')
    .replace(/^file:\/([^\/])/, 'file:///$1'); // Ensure proper file:/// format

const isDirectExecution = normalizedCurrentModuleUrl === normalizedScriptPath ||
    decodeURIComponent(normalizedCurrentModuleUrl) === normalizedScriptPath;

if (process.env.MCP_STDIO_MODE !== 'true') {
    console.error('[DATABASE-ADMIN-SERVER] normalized current module url:', normalizedCurrentModuleUrl);
    console.error('[DATABASE-ADMIN-SERVER] normalized script path:', normalizedScriptPath);
    console.error('[DATABASE-ADMIN-SERVER] is direct execution:', isDirectExecution);
}

if (process.env.MCP_STDIO_MODE) {
    // When running in MCP stdio mode, always start the server
    console.error('[DATABASE-ADMIN-SERVER] Running in MCP stdio mode - starting server...');
    try {
        const server = new DatabaseAdminMCPServer();
        await server.run();
    } catch (error) {
        console.error('[DATABASE-ADMIN-SERVER] Failed to start MCP server:', error.message);
        console.error('[DATABASE-ADMIN-SERVER] Stack:', error.stack);
        process.exit(1);
    }
} else if (isDirectExecution) {
    if (process.env.MCP_STDIO_MODE !== 'true') {
        console.error('[DATABASE-ADMIN-SERVER] Starting CLI runner...');
    }
    try {
        const { CLIRunner } = await import('../../shared/cli-runner.js');
        const runner = new CLIRunner(DatabaseAdminMCPServer);
        await runner.run();
    } catch (error) {
        console.error('[DATABASE-ADMIN-SERVER] CLI runner failed:', error.message);
        if (process.env.MCP_STDIO_MODE !== 'true') {
            console.error('[DATABASE-ADMIN-SERVER] CLI runner stack:', error.stack);
        }
        throw error;
    }
} else {
    if (process.env.MCP_STDIO_MODE !== 'true') {
        console.error('[DATABASE-ADMIN-SERVER] Module imported - not starting server');
        console.error('[DATABASE-ADMIN-SERVER] Module export completed');
    }
}
