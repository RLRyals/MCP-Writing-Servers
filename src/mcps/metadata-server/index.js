// src/mcps/metadata-server/index.js

// Protect stdout from any pollution in MCP stdio mode
if (process.env.MCP_STDIO_MODE === 'true') {
    const originalWrite = process.stdout.write;
    process.stdout.write = function() { return true; };
    
    // Restore stdout after module loading is complete
    process.nextTick(() => {
        process.stdout.write = originalWrite;
    });
}

import { BaseMCPServer } from '../../shared/base-server.js';
import { LookupManagementHandlers } from './handlers/lookup-management-handlers.js';
import { MetadataCrudHandlers } from './handlers/metadata-crud-handlers.js';
import { lookupSystemToolsSchema } from './schemas/lookup-tools-schema.js';

class MetadataMCPServer extends BaseMCPServer {
    constructor() {
        super('metadata-manager', '1.0.0');

        // Initialize lookup management handlers
        this.lookupManagementHandlers = new LookupManagementHandlers(this.db);
        this.metadataCrudHandlers = new MetadataCrudHandlers(this.db);

        // Bind lookup handler methods
        this.handleGetAvailableOptions = this.handleGetAvailableOptions.bind(this);
        this.handleCreateLookupOption = this.lookupManagementHandlers.handleCreateLookupOption.bind(this.lookupManagementHandlers);
        this.handleUpdateLookupOption = this.lookupManagementHandlers.handleUpdateLookupOption.bind(this.lookupManagementHandlers);
        this.handleDeleteLookupOption = this.lookupManagementHandlers.handleDeleteLookupOption.bind(this.lookupManagementHandlers);
        this.handleAssignBookGenres = this.lookupManagementHandlers.handleAssignBookGenres.bind(this.lookupManagementHandlers);
        this.handleAssignSeriesGenres = this.lookupManagementHandlers.handleAssignSeriesGenres.bind(this.lookupManagementHandlers);

        // Bind metadata CRUD handler methods
        this.handleListMetadata = this.metadataCrudHandlers.handleListMetadata.bind(this.metadataCrudHandlers);
        this.handleGetMetadata = this.metadataCrudHandlers.handleGetMetadata.bind(this.metadataCrudHandlers);
        this.handleCreateMetadata = this.metadataCrudHandlers.handleCreateMetadata.bind(this.metadataCrudHandlers);
        this.handleUpdateMetadata = this.metadataCrudHandlers.handleUpdateMetadata.bind(this.metadataCrudHandlers);
        this.handleDeleteMetadata = this.metadataCrudHandlers.handleDeleteMetadata.bind(this.metadataCrudHandlers);

        // Initialize tools after base constructor
        this.tools = this.getTools();
    }

    getTools() {
        return [
            // Lookup system tools (cross-server utilities)
            ...lookupSystemToolsSchema,

            // Metadata-specific tools (shared with book-planning-server over HTTP)
            ...this.metadataCrudHandlers.getMetadataCrudTools()
        ];
    }

    getToolHandler(toolName) {
        const handlers = {
            // Lookup system handlers
            'get_available_options': this.handleGetAvailableOptions,
            'create_lookup_option': this.handleCreateLookupOption,
            'update_lookup_option': this.handleUpdateLookupOption,
            'delete_lookup_option': this.handleDeleteLookupOption,
            'assign_book_genres': this.handleAssignBookGenres,
            'assign_series_genres': this.handleAssignSeriesGenres,

            // Metadata handlers
            'list_metadata': this.handleListMetadata,
            'get_metadata': this.handleGetMetadata,
            'create_metadata': this.handleCreateMetadata,
            'update_metadata': this.handleUpdateMetadata,
            'delete_metadata': this.handleDeleteMetadata
        };
        return handlers[toolName];
    }

    // =============================================
    // LOOKUP SYSTEM HANDLERS
    // =============================================
    async handleGetAvailableOptions(args) {
        try {
            const { option_type, active_only = true } = args;

            // Map option types to their corresponding lookup tables
            const lookupTables = {
                'genres': { table: 'genres', nameCol: 'genre_name', descCol: 'genre_description' },
                'plot_thread_types': { table: 'plot_thread_types', nameCol: 'type_name', descCol: 'type_description' },
                'plot_thread_statuses': { table: 'plot_thread_statuses', nameCol: 'status_name', descCol: 'status_description' },
                'relationship_types': { table: 'relationship_types', nameCol: 'type_name', descCol: 'type_description' },
                'story_concerns': { table: 'story_concerns', nameCol: 'concern_name', descCol: 'concern_description' },
                'story_outcomes': { table: 'story_outcomes', nameCol: 'outcome_name', descCol: 'outcome_description' },
                'story_judgments': { table: 'story_judgments', nameCol: 'judgment_name', descCol: 'judgment_description' }
            };

            const lookupInfo = lookupTables[option_type];
            if (!lookupInfo) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Unknown option type: ${option_type}\n\n` +
                                  `Available types: ${Object.keys(lookupTables).join(', ')}`
                        }
                    ]
                };
            }

            try {
                const activeFilter = active_only ? 'WHERE is_active = true' : '';
                const query = `
                    SELECT id, ${lookupInfo.nameCol}, ${lookupInfo.descCol}, is_active
                    FROM ${lookupInfo.table}
                    ${activeFilter}
                    ORDER BY ${lookupInfo.nameCol}
                `;

                const result = await this.db.query(query);

                if (result.rows.length > 0) {
                    let output = `# Available ${option_type.replace('_', ' ').toUpperCase()}\n\n`;
                    result.rows.forEach(row => {
                        const name = row[lookupInfo.nameCol];
                        const desc = row[lookupInfo.descCol];
                        const active = row.is_active ? '' : ' (inactive)';
                        output += `**${name}** (ID: ${row.id})${active} - ${desc || 'No description'}\n`;
                    });

                    return {
                        content: [
                            {
                                type: 'text',
                                text: output
                            }
                        ]
                    };
                } else {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `No ${active_only ? 'active ' : ''}${option_type.replace('_', ' ')} found in lookup table.`
                            }
                        ]
                    };
                }

            } catch (dbError) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Lookup table for ${option_type} not available.\n\n` +
                                  `Error: ${dbError.message}\n\n` +
                                  `Run migration 004_plot_structure_and_universal_framework.sql to create lookup tables.`
                        }
                    ]
                };
            }
        } catch (error) {
            throw new Error(`Failed to get available options: ${error.message}`);
        }
    }
}

export { MetadataMCPServer };

// CLI runner when called directly (not when imported or run by MCP clients)
import { fileURLToPath } from 'url';

// Normalize paths for cross-platform compatibility (Windows and Mac)
const currentModuleUrl = import.meta.url;
let scriptPath = process.argv[1];
// Handle Windows paths - check if scriptPath exists first
if (scriptPath && scriptPath.includes('\\')) {
    scriptPath = `file:///${scriptPath.replace(/\\/g, '/')}`;
} else if (scriptPath) {
    // Handle Mac/Unix paths
    scriptPath = `file://${scriptPath}`;
}
// Decode the URLs to ensure proper comparison
const normalizedCurrentUrl = decodeURIComponent(currentModuleUrl);
const normalizedScriptPath = scriptPath ? decodeURIComponent(scriptPath) : '';
const isDirectExecution = (scriptPath && normalizedCurrentUrl === normalizedScriptPath) || process.env.MCP_STDIO_MODE === 'true';

// Prioritize MCP_STDIO_MODE environment variable
if (process.env.MCP_STDIO_MODE === 'true') {
    // When running in STDIO mode (via Claude Desktop)
    console.error('[METADATA-SERVER] Running in MCP stdio mode - starting server...');
    try {
        const server = new MetadataMCPServer();
        await server.run();
    } catch (error) {
        console.error('[METADATA-SERVER] Failed to start MCP server:', error.message);
        console.error('[METADATA-SERVER] Stack:', error.stack);
        process.exit(1);
    }
} else if (isDirectExecution) {
    // When running as CLI (direct node execution)
    const { CLIRunner } = await import('../../shared/cli-runner.js');
    const runner = new CLIRunner(MetadataMCPServer);
    await runner.run();
} else {
    // Module was imported, not directly executed
    console.error('[METADATA-SERVER] Module imported - not starting server');
}
