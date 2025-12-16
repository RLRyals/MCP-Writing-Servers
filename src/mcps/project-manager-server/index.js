// src/mcps/project-manager-server/index.js
// Project Manager MCP Server - Manages project folder references

// Protect stdout from debug logging in MCP stdio mode
if (process.env.MCP_STDIO_MODE === 'true') {
    const originalConsoleError = console.error;
    console.error = function() {
        process.stderr.write(Array.from(arguments).join(' ') + '\n');
    };
}

import { BaseMCPServer } from '../../shared/base-server.js';
import { ProjectHandlers } from './handlers/project-handlers.js';

class ProjectManagerServer extends BaseMCPServer {
    constructor() {
        super('project-manager', '1.0.0');

        // Initialize project handlers with shared DB connection
        this.projectHandlers = new ProjectHandlers(this.db);

        // Initialize tools after base constructor
        this.tools = this.getTools();

        // Defensive check to ensure tools are properly initialized
        if (!this.tools || !Array.isArray(this.tools) || this.tools.length === 0) {
            console.error('[PROJECT-SERVER] WARNING: Tools not properly initialized!');
            this.tools = this.getTools();
        }

        if (process.env.MCP_STDIO_MODE !== 'true') {
            console.error(`[PROJECT-SERVER] Initialized with ${this.tools.length} tools`);
        }

        // Test database connection on startup
        this.testDatabaseConnection();
    }

    async testDatabaseConnection() {
        try {
            if (this.db) {
                const healthPromise = this.db.healthCheck();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Database health check timed out')), 5000)
                );

                const health = await Promise.race([healthPromise, timeoutPromise]);
                if (health.healthy) {
                    console.error('[PROJECT-SERVER] Database connection verified');
                } else {
                    console.error('[PROJECT-SERVER] Database health check failed:', health.error);
                }
            }
        } catch (error) {
            console.error('[PROJECT-SERVER] Database connection test failed:', error.message);
        }
    }

    getTools() {
        return this.projectHandlers.getProjectTools();
    }

    getToolHandler(toolName) {
        const handlers = {
            'create_project': this.projectHandlers.handleCreateProject.bind(this.projectHandlers),
            'list_projects': this.projectHandlers.handleListProjects.bind(this.projectHandlers),
            'get_project': this.projectHandlers.handleGetProject.bind(this.projectHandlers),
            'update_project': this.projectHandlers.handleUpdateProject.bind(this.projectHandlers),
            'delete_project': this.projectHandlers.handleDeleteProject.bind(this.projectHandlers),
            'link_to_series': this.projectHandlers.handleLinkToSeries.bind(this.projectHandlers),
            'link_to_book': this.projectHandlers.handleLinkToBook.bind(this.projectHandlers),
            'unlink_project': this.projectHandlers.handleUnlinkProject.bind(this.projectHandlers)
        };
        return handlers[toolName];
    }
}

export { ProjectManagerServer };

// CLI runner when called directly
import { fileURLToPath } from 'url';

if (process.env.MCP_STDIO_MODE !== 'true') {
    console.error('[PROJECT-SERVER] Module loaded');
}

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

const currentModuleUrl = import.meta.url;
const scriptPath = process.argv[1];
const normalizedScriptPath = normalizePath(scriptPath);
const normalizedCurrentModuleUrl = currentModuleUrl.replace(/\/{3,}/g, '///')
    .replace(/^file:\/([^\/])/, 'file:///$1');

const isDirectExecution = normalizedCurrentModuleUrl === normalizedScriptPath ||
    decodeURIComponent(normalizedCurrentModuleUrl) === normalizedScriptPath;

if (process.env.MCP_STDIO_MODE) {
    console.error('[PROJECT-SERVER] Running in MCP stdio mode - starting server...');
    try {
        const server = new ProjectManagerServer();
        await server.run();
    } catch (error) {
        console.error('[PROJECT-SERVER] Failed to start MCP server:', error.message);
        console.error('[PROJECT-SERVER] Stack:', error.stack);
        process.exit(1);
    }
} else if (isDirectExecution) {
    if (process.env.MCP_STDIO_MODE !== 'true') {
        console.error('[PROJECT-SERVER] Starting CLI runner...');
    }
    try {
        const { CLIRunner } = await import('../../shared/cli-runner.js');
        const runner = new CLIRunner(ProjectManagerServer);
        await runner.run();
    } catch (error) {
        console.error('[PROJECT-SERVER] CLI runner failed:', error.message);
        if (process.env.MCP_STDIO_MODE !== 'true') {
            console.error('[PROJECT-SERVER] CLI runner stack:', error.stack);
        }
        throw error;
    }
} else {
    if (process.env.MCP_STDIO_MODE !== 'true') {
        console.error('[PROJECT-SERVER] Module imported - not starting server');
    }
}
