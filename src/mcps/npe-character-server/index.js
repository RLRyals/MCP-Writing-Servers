// src/mcps/npe-character-server/index.js
// NPE Character Decision Tracking MCP Server
// Designed for AI Writing Teams to track and validate character decisions
// using Narrative Physics Engine (NPE) principles

// Protect stdout from debug logging in MCP stdio mode
if (process.env.MCP_STDIO_MODE === 'true') {
    console.error = function() {
        // Keep the original console.error functionality but write to stderr instead
        process.stderr.write(Array.from(arguments).join(' ') + '\n');
    };
}

import { BaseMCPServer } from '../../shared/base-server.js';
import { NPEDecisionHandlers } from './handlers/npe-decision-handlers.js';

class NPECharacterMCPServer extends BaseMCPServer {
    constructor() {
        console.error('[NPE-CHARACTER-SERVER] Constructor starting...');
        try {
            super('npe-character-manager', '1.0.0');
            console.error('[NPE-CHARACTER-SERVER] Constructor completed successfully');
        } catch (error) {
            console.error('[NPE-CHARACTER-SERVER] Constructor failed:', error.message);
            console.error('[NPE-CHARACTER-SERVER] Stack:', error.stack);
            throw error;
        }

        // Initialize handler module with database connection
        this.npeDecisionHandlers = new NPEDecisionHandlers(this.db);

        // Properly bind handler methods to maintain context
        this.bindHandlerMethods();

        // Initialize tools after base constructor
        this.tools = this.getTools();

        // Defensive check to ensure tools are properly initialized
        if (!this.tools || !Array.isArray(this.tools) || this.tools.length === 0) {
            console.error('[NPE-CHARACTER-SERVER] WARNING: Tools not properly initialized!');
            this.tools = this.getTools(); // Try again
        }

        if (process.env.MCP_STDIO_MODE !== 'true') {
            console.error(`[NPE-CHARACTER-SERVER] Initialized with ${this.tools.length} tools`);
        }

        // Test database connection on startup (don't wait for it, just start it)
        this.testDatabaseConnection();
    }

    // Proper method binding to maintain context
    bindHandlerMethods() {
        // Bind NPE decision handler methods
        this.handleLogCharacterDecision = this.npeDecisionHandlers.handleLogCharacterDecision.bind(this.npeDecisionHandlers);
        this.handleValidateCharacterDecision = this.npeDecisionHandlers.handleValidateCharacterDecision.bind(this.npeDecisionHandlers);
        this.handleGetCharacterDecisionsInScene = this.npeDecisionHandlers.handleGetCharacterDecisionsInScene.bind(this.npeDecisionHandlers);
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
                    console.error('[NPE-CHARACTER-SERVER] Database connection verified');
                } else {
                    console.error('[NPE-CHARACTER-SERVER] Database health check failed:', health.error);
                }
            }
        } catch (error) {
            console.error('[NPE-CHARACTER-SERVER] Database connection test failed:', error.message);
        }
    }

    // =============================================
    // COMPLETE TOOL REGISTRATION
    // =============================================
    getTools() {
        return [
            // NPE Character Decision Tools
            ...this.npeDecisionHandlers.getNPEDecisionTools()
        ];
    }

    // =============================================
    // COMPLETE TOOL HANDLER MAPPING
    // =============================================
    getToolHandler(toolName) {
        const handlers = {
            // NPE Decision Handlers
            'log_character_decision': this.handleLogCharacterDecision,
            'validate_character_decision': this.handleValidateCharacterDecision,
            'get_character_decisions_in_scene': this.handleGetCharacterDecisionsInScene
        };
        return handlers[toolName];
    }
}

export { NPECharacterMCPServer };

// CLI runner when called directly (not when imported or run by MCP clients)

// Only log debug info if not in stdio mode
if (process.env.MCP_STDIO_MODE !== 'true') {
    console.error('[NPE-CHARACTER-SERVER] Module loaded');
    console.error('[NPE-CHARACTER-SERVER] MCP_STDIO_MODE:', process.env.MCP_STDIO_MODE);
    console.error('[NPE-CHARACTER-SERVER] import.meta.url:', import.meta.url);
    console.error('[NPE-CHARACTER-SERVER] process.argv[1]:', process.argv[1]);
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
    console.error('[NPE-CHARACTER-SERVER] normalized current module url:', normalizedCurrentModuleUrl);
    console.error('[NPE-CHARACTER-SERVER] normalized script path:', normalizedScriptPath);
    console.error('[NPE-CHARACTER-SERVER] is direct execution:', isDirectExecution);
}

if (process.env.MCP_STDIO_MODE) {
    // When running in MCP stdio mode, always start the server
    console.error('[NPE-CHARACTER-SERVER] Running in MCP stdio mode - starting server...');
    try {
        const server = new NPECharacterMCPServer();
        await server.run();
    } catch (error) {
        console.error('[NPE-CHARACTER-SERVER] Failed to start MCP server:', error.message);
        console.error('[NPE-CHARACTER-SERVER] Stack:', error.stack);
        process.exit(1);
    }
} else if (isDirectExecution) {
    if (process.env.MCP_STDIO_MODE !== 'true') {
        console.error('[NPE-CHARACTER-SERVER] Starting CLI runner...');
    }
    try {
        const { CLIRunner } = await import('../../shared/cli-runner.js');
        const runner = new CLIRunner(NPECharacterMCPServer);
        await runner.run();
    } catch (error) {
        console.error('[NPE-CHARACTER-SERVER] CLI runner failed:', error.message);
        if (process.env.MCP_STDIO_MODE !== 'true') {
            console.error('[NPE-CHARACTER-SERVER] CLI runner stack:', error.stack);
        }
        throw error;
    }
} else {
    if (process.env.MCP_STDIO_MODE !== 'true') {
        console.error('[NPE-CHARACTER-SERVER] Module imported - not starting server');
        console.error('[NPE-CHARACTER-SERVER] Module export completed');
    }
}
