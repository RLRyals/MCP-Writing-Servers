// src/mcps/npe-scene-server/index.js
// MODULAR VERSION - NPE Scene Validation MCP Server with separated handlers and schemas
// Designed for AI Writing Teams to validate scenes against NPE (Narrative Physics Engine) rules

// Protect stdout from debug logging in MCP stdio mode
if (process.env.MCP_STDIO_MODE === 'true') {
    console.error = function() {
        // Keep the original console.error functionality but write to stderr instead
        process.stderr.write(Array.from(arguments).join(' ') + '\n');
    };
}

import { BaseMCPServer } from '../../shared/base-server.js';
import { NPESceneHandlers } from './handlers/npe-scene-handlers.js';

class NPESceneMCPServer extends BaseMCPServer {
    constructor() {
        console.error('[NPE-SCENE-SERVER] Constructor starting...');
        try {
            super('npe-scene-validation', '1.0.0');
            console.error('[NPE-SCENE-SERVER] Constructor completed successfully');
        } catch (error) {
            console.error('[NPE-SCENE-SERVER] Constructor failed:', error.message);
            console.error('[NPE-SCENE-SERVER] Stack:', error.stack);
            throw error;
        }

        // Initialize handler modules with database connection
        this.npeSceneHandlers = new NPESceneHandlers(this.db);

        // Properly bind handler methods to maintain context
        this.bindHandlerMethods();

        // Initialize tools after base constructor
        this.tools = this.getTools();

        // Defensive check to ensure tools are properly initialized
        if (!this.tools || !Array.isArray(this.tools) || this.tools.length === 0) {
            console.error('[NPE-SCENE-SERVER] WARNING: Tools not properly initialized!');
            this.tools = this.getTools(); // Try again
        }

        if (process.env.MCP_STDIO_MODE !== 'true') {
            console.error(`[NPE-SCENE-SERVER] Initialized with ${this.tools.length} tools`);
        }

        // Test database connection on startup (don't wait for it, just start it)
        this.testDatabaseConnection();
    }

    // Proper method binding to maintain context
    bindHandlerMethods() {
        // Bind NPE scene handler methods
        this.handleValidateSceneArchitecture = this.npeSceneHandlers.handleValidateSceneArchitecture.bind(this.npeSceneHandlers);
        this.handleValidateDialoguePhysics = this.npeSceneHandlers.handleValidateDialoguePhysics.bind(this.npeSceneHandlers);
        this.handleGetSceneNPECompliance = this.npeSceneHandlers.handleGetSceneNPECompliance.bind(this.npeSceneHandlers);
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
                    console.error('[NPE-SCENE-SERVER] Database connection verified');
                } else {
                    console.error('[NPE-SCENE-SERVER] Database health check failed:', health.error);
                }
            }
        } catch (error) {
            console.error('[NPE-SCENE-SERVER] Database connection test failed:', error.message);
        }
    }

    // =============================================
    // COMPLETE TOOL REGISTRATION
    // =============================================
    getTools() {
        return [
            // NPE Scene Validation Tools
            ...this.npeSceneHandlers.getNPESceneTools()
        ];
    }

    // =============================================
    // COMPLETE TOOL HANDLER MAPPING
    // =============================================
    getToolHandler(toolName) {
        const handlers = {
            // NPE Scene Validation Handlers
            'validate_scene_architecture': this.handleValidateSceneArchitecture,
            'validate_dialogue_physics': this.handleValidateDialoguePhysics,
            'get_scene_npe_compliance': this.handleGetSceneNPECompliance
        };
        return handlers[toolName];
    }
}

export { NPESceneMCPServer };

// CLI runner when called directly (not when imported or run by MCP clients)

// Only log debug info if not in stdio mode
if (process.env.MCP_STDIO_MODE !== 'true') {
    console.error('[NPE-SCENE-SERVER] Module loaded');
    console.error('[NPE-SCENE-SERVER] MCP_STDIO_MODE:', process.env.MCP_STDIO_MODE);
    console.error('[NPE-SCENE-SERVER] import.meta.url:', import.meta.url);
    console.error('[NPE-SCENE-SERVER] process.argv[1]:', process.argv[1]);
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
    console.error('[NPE-SCENE-SERVER] normalized current module url:', normalizedCurrentModuleUrl);
    console.error('[NPE-SCENE-SERVER] normalized script path:', normalizedScriptPath);
    console.error('[NPE-SCENE-SERVER] is direct execution:', isDirectExecution);
}

if (process.env.MCP_STDIO_MODE) {
    // When running in MCP stdio mode, always start the server
    console.error('[NPE-SCENE-SERVER] Running in MCP stdio mode - starting server...');
    try {
        const server = new NPESceneMCPServer();
        await server.run();
    } catch (error) {
        console.error('[NPE-SCENE-SERVER] Failed to start MCP server:', error.message);
        console.error('[NPE-SCENE-SERVER] Stack:', error.stack);
        process.exit(1);
    }
} else if (isDirectExecution) {
    if (process.env.MCP_STDIO_MODE !== 'true') {
        console.error('[NPE-SCENE-SERVER] Starting CLI runner...');
    }
    try {
        const { CLIRunner } = await import('../../shared/cli-runner.js');
        const runner = new CLIRunner(NPESceneMCPServer);
        await runner.run();
    } catch (error) {
        console.error('[NPE-SCENE-SERVER] CLI runner failed:', error.message);
        if (process.env.MCP_STDIO_MODE !== 'true') {
            console.error('[NPE-SCENE-SERVER] CLI runner stack:', error.stack);
        }
        throw error;
    }
} else {
    if (process.env.MCP_STDIO_MODE !== 'true') {
        console.error('[NPE-SCENE-SERVER] Module imported - not starting server');
        console.error('[NPE-SCENE-SERVER] Module export completed');
    }
}
