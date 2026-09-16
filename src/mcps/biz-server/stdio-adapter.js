#!/usr/bin/env node
// stdio-adapter.js
// Adapter to run the Biz MCP Server in stdio mode for Claude Code
// integration. Copied from kanban-server/stdio-adapter.js (class name
// swapped) for the same reason: stdio is the low-latency path Claude Code /
// agent sessions use.

// Set stdio mode environment variable BEFORE importing server
process.env.MCP_STDIO_MODE = 'true';

// Redirect console.log to stderr to protect stdout
const originalConsoleLog = console.log;
console.log = function (...args) {
    process.stderr.write('[STDIO-ADAPTER] ' + args.join(' ') + '\n');
};

// Import the server
import { BizMCPServer } from './index.js';

async function main() {
    try {
        console.error('[STDIO-ADAPTER] Starting Biz MCP in stdio mode...');

        // Create server instance
        const server = new BizMCPServer();

        // Connect to stdio transport
        const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
        const transport = new StdioServerTransport();

        console.error('[STDIO-ADAPTER] Connecting to stdio transport...');
        await server.server.connect(transport);

        console.error('[STDIO-ADAPTER] Biz MCP ready on stdio');
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
