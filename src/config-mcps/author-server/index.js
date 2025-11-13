// src/config-mcps/author-server/index.js
// Phase-based MCP Server: Author Management
// Manages author information for AI Writing Teams

// Protect stdout from debug logging in MCP stdio mode
if (process.env.MCP_STDIO_MODE === 'true') {
    const originalConsoleError = console.error;
    console.error = function() {
        process.stderr.write(Array.from(arguments).join(' ') + '\n');
    };
}

import { BaseMCPServer } from '../../shared/base-server.js';

// Import author handler class from main mcps directory
import { AuthorHandlers } from '../../mcps/author-server/handlers/author-handlers.js';

class AuthorMCPServer extends BaseMCPServer {
    constructor() {
        super('author-manager', '1.0.0');

        // Initialize handler instance with our shared DB connection
        this.initializeHandlers();

        // Build aggregated tool list from handlers
        this.tools = this.buildTools();

        console.error(`[AUTHOR-SERVER] Initialized with ${this.tools.length} tools using 1 DB connection`);
    }

    initializeHandlers() {
        // Create author handler instance
        this.authorHandlers = new AuthorHandlers(this.db);

        console.error('[AUTHOR-SERVER] Author handlers initialized');
    }

    buildTools() {
        const tools = [];

        // =============================================
        // AUTHOR MANAGEMENT TOOLS
        // =============================================
        const authorTools = this.authorHandlers.getAuthorTools();

        authorTools.forEach(tool => {
            tools.push({
                ...tool,
                name: tool.name,
                description: tool.description
            });
        });

        return tools;
    }

    getToolHandler(toolName) {
        // Route to the appropriate handler based on tool name
        const handlerMap = {
            'list_authors': (args) => this.authorHandlers.handleListAuthors(args),
            'get_author': (args) => this.authorHandlers.handleGetAuthor(args),
            'create_author': (args) => this.authorHandlers.handleCreateAuthor(args),
            'update_author': (args) => this.authorHandlers.handleUpdateAuthor(args)
        };

        return handlerMap[toolName] || null;
    }
}

export { AuthorMCPServer };

// CLI runner when called directly
import { fileURLToPath } from 'url';

const normalizePath = (path) => {
    if (!path) return '';
    let normalizedPath = path.replace(/\\/g, '/');
    if (!normalizedPath.startsWith('file:')) {
        if (process.platform === 'win32') {
            normalizedPath = `file:///${normalizedPath}`;
        } else {
            normalizedPath = `file://${normalizedPath}`;
        }
    }
    normalizedPath = normalizedPath.replace(/^file:\/+/, 'file:///');
    return normalizedPath;
};

const normalizedScriptPath = normalizePath(process.argv[1]);
const normalizedCurrentModuleUrl = import.meta.url.replace(/\/{3,}/g, '///')
    .replace(/^file:\/([^\/])/, 'file:///$1');

const isDirectExecution = normalizedCurrentModuleUrl === normalizedScriptPath ||
    decodeURIComponent(normalizedCurrentModuleUrl) === normalizedScriptPath;

if (process.env.MCP_STDIO_MODE) {
    console.error('[AUTHOR-SERVER] Running in MCP stdio mode - starting server...');
    try {
        const server = new AuthorMCPServer();
        await server.run();
    } catch (error) {
        console.error('[AUTHOR-SERVER] Failed to start MCP server:', error.message);
        console.error('[AUTHOR-SERVER] Stack:', error.stack);
        process.exit(1);
    }
} else if (isDirectExecution) {
    console.error('[AUTHOR-SERVER] Starting CLI runner...');
    try {
        const { CLIRunner } = await import('../../shared/cli-runner.js');
        const runner = new CLIRunner(AuthorMCPServer);
        await runner.run();
    } catch (error) {
        console.error('[AUTHOR-SERVER] CLI runner failed:', error.message);
        throw error;
    }
} else {
    console.error('[AUTHOR-SERVER] Module imported - not starting server');
}
