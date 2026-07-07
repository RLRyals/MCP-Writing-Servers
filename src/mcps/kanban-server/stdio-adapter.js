#!/usr/bin/env node
// stdio-adapter.js
// Adapter to run the Kanban MCP Server in stdio mode for Claude Code
// integration. Copied from workflow-manager-server/stdio-adapter.js
// (class name swapped) — required, not optional: S11 decision 6 means
// Claude Code sessions are the ones driving local-model card work, and the
// proven low-latency path for that is stdio (mirrors
// MCP-Electron-App/src/main/plugin-context.ts's special-cased stdio branch
// for workflow-manager).

// Set stdio mode environment variable BEFORE importing server
process.env.MCP_STDIO_MODE = 'true';

// Redirect console.log to stderr to protect stdout
const originalConsoleLog = console.log;
console.log = function (...args) {
    process.stderr.write('[STDIO-ADAPTER] ' + args.join(' ') + '\n');
};

// Import the server
import { KanbanMCPServer } from './index.js';

async function main() {
    try {
        console.error('[STDIO-ADAPTER] Starting Kanban MCP in stdio mode...');

        // Create server instance
        const server = new KanbanMCPServer();

        // Connect to stdio transport
        const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
        const transport = new StdioServerTransport();

        console.error('[STDIO-ADAPTER] Connecting to stdio transport...');
        await server.server.connect(transport);

        console.error('[STDIO-ADAPTER] Kanban MCP ready on stdio');
        console.error('[STDIO-ADAPTER] Available tools:', server.tools.length);

        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.error('[STDIO-ADAPTER] Received SIGINT, shutting down...');
            await server.server.close();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            console.error('[STDIO-ADAPTER] Received SIGTERM, shutting down...');
            await server.server.close();
            process.exit(0);
        });

    } catch (error) {
        console.error('[STDIO-ADAPTER] Fatal error:', error.message);
        console.error('[STDIO-ADAPTER] Stack:', error.stack);
        process.exit(1);
    }
}

main();
