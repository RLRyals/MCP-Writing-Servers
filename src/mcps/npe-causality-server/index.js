// src/mcps/npe-causality-server/index.js
// NPE Causality Chain Management MCP Server
// Implements Narrative Physics Engine causality tracking for AI Writing Teams

// Protect stdout from debug logging in MCP stdio mode
if (process.env.MCP_STDIO_MODE === 'true') {
    console.error = function() {
        // Keep the original console.error functionality but write to stderr instead
        process.stderr.write(Array.from(arguments).join(' ') + '\n');
    };
}

import { BaseMCPServer } from '../../shared/base-server.js';
import { CausalityHandlers } from './handlers/causality-handlers.js';

class NPECausalityMCPServer extends BaseMCPServer {
    constructor() {
        console.error('[NPE-CAUSALITY-SERVER] Constructor starting...');
        try {
            super('npe-causality-manager', '1.0.0');
            console.error('[NPE-CAUSALITY-SERVER] Constructor completed successfully');
        } catch (error) {
            console.error('[NPE-CAUSALITY-SERVER] Constructor failed:', error.message);
            console.error('[NPE-CAUSALITY-SERVER] Stack:', error.stack);
            throw error;
        }

        // Initialize handler modules with database connection
        this.causalityHandlers = new CausalityHandlers(this.db);

        // Properly bind handler methods to maintain context
        this.bindHandlerMethods();

        // Initialize tools after base constructor
        this.tools = this.getTools();

        // Defensive check to ensure tools are properly initialized
        if (!this.tools || !Array.isArray(this.tools) || this.tools.length === 0) {
            console.error('[NPE-CAUSALITY-SERVER] WARNING: Tools not properly initialized!');
            this.tools = this.getTools(); // Try again
        }

        if (process.env.MCP_STDIO_MODE !== 'true') {
            console.error(`[NPE-CAUSALITY-SERVER] Initialized with ${this.tools.length} tools`);
        }

        // Test database connection on startup (don't wait for it, just start it)
        this.testDatabaseConnection();
    }

    // Proper method binding to maintain context
    bindHandlerMethods() {
        // Bind causality handler methods
        this.handleCreateCausalityChain = this.causalityHandlers.handleCreateCausalityChain.bind(this.causalityHandlers);
        this.handleAddCausalLink = this.causalityHandlers.handleAddCausalLink.bind(this.causalityHandlers);
        this.handleValidateCausalityChain = this.causalityHandlers.handleValidateCausalityChain.bind(this.causalityHandlers);
        this.handleGetCausalityChainsForBook = this.causalityHandlers.handleGetCausalityChainsForBook.bind(this.causalityHandlers);
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
                    console.error('[NPE-CAUSALITY-SERVER] Database connection verified');
                } else {
                    console.error('[NPE-CAUSALITY-SERVER] Database health check failed:', health.error);
                }
            }
        } catch (error) {
            console.error('[NPE-CAUSALITY-SERVER] Database connection test failed:', error.message);
        }
    }

    // =============================================
    // COMPLETE TOOL REGISTRATION
    // =============================================
    getTools() {
        return [
            // NPE Causality Chain Management Tools
            ...this.causalityHandlers.getCausalityTools()
        ];
    }

    // =============================================
    // COMPLETE TOOL HANDLER MAPPING
    // =============================================
    getToolHandler(toolName) {
        const handlers = {
            // Causality Chain Handlers
            'create_causality_chain': this.handleCreateCausalityChain,
            'add_causal_link': this.handleAddCausalLink,
            'validate_causality_chain': this.handleValidateCausalityChain,
            'get_causality_chains_for_book': this.handleGetCausalityChainsForBook
        };
        return handlers[toolName];
    }
}

export { NPECausalityMCPServer };

// CLI runner when called directly (not when imported or run by MCP clients)

// Only log debug info if not in stdio mode
if (process.env.MCP_STDIO_MODE !== 'true') {
    console.error('[NPE-CAUSALITY-SERVER] Module loaded');
    console.error('[NPE-CAUSALITY-SERVER] MCP_STDIO_MODE:', process.env.MCP_STDIO_MODE);
    console.error('[NPE-CAUSALITY-SERVER] import.meta.url:', import.meta.url);
    console.error('[NPE-CAUSALITY-SERVER] process.argv[1]:', process.argv[1]);
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
    console.error('[NPE-CAUSALITY-SERVER] normalized current module url:', normalizedCurrentModuleUrl);
    console.error('[NPE-CAUSALITY-SERVER] normalized script path:', normalizedScriptPath);
    console.error('[NPE-CAUSALITY-SERVER] is direct execution:', isDirectExecution);
}

if (process.env.MCP_STDIO_MODE) {
    // When running in MCP stdio mode, always start the server
    console.error('[NPE-CAUSALITY-SERVER] Running in MCP stdio mode - starting server...');
    try {
        const server = new NPECausalityMCPServer();
        await server.run();
    } catch (error) {
        console.error('[NPE-CAUSALITY-SERVER] Failed to start MCP server:', error.message);
        console.error('[NPE-CAUSALITY-SERVER] Stack:', error.stack);
        process.exit(1);
    }
} else if (isDirectExecution) {
    if (process.env.MCP_STDIO_MODE !== 'true') {
        console.error('[NPE-CAUSALITY-SERVER] Starting CLI runner...');
    }
    try {
        const { CLIRunner } = await import('../../shared/cli-runner.js');
        const runner = new CLIRunner(NPECausalityMCPServer);
        await runner.run();
    } catch (error) {
        console.error('[NPE-CAUSALITY-SERVER] CLI runner failed:', error.message);
        if (process.env.MCP_STDIO_MODE !== 'true') {
            console.error('[NPE-CAUSALITY-SERVER] CLI runner stack:', error.stack);
        }
        throw error;
    }
} else {
    if (process.env.MCP_STDIO_MODE !== 'true') {
        console.error('[NPE-CAUSALITY-SERVER] Module imported - not starting server');
        console.error('[NPE-CAUSALITY-SERVER] Module export completed');
    }
}
