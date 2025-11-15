#!/usr/bin/env node
// mcp-stdio-adapter.js
// Bridges Claude Desktop's stdio protocol with HTTP-based MCP servers
// Reads JSON-RPC from stdin, forwards to HTTP servers, writes responses to stdout

import { createInterface } from 'readline';
import { stdin, stdout, stderr } from 'process';

// Server configuration - matches orchestrator setup
const SERVERS = [
    { name: 'book-planning', port: 3001 },
    { name: 'series-planning', port: 3002 },
    { name: 'chapter-planning', port: 3003 },
    { name: 'character-planning', port: 3004 },
    { name: 'scene', port: 3005 },
    { name: 'core-continuity', port: 3006 },
    { name: 'review', port: 3007 },
    { name: 'reporting', port: 3008 },
    { name: 'author', port: 3009 }
];

// Tool routing map: tool name -> server port
const toolToServerMap = new Map();

// Track initialization state
let isInitialized = false;
let initializationPromise = null;

// Logging utility (stderr only to preserve stdout for JSON-RPC)
function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        ...(data && { data })
    };
    stderr.write(JSON.stringify(logEntry) + '\n');
}

// Initialize adapter by querying all servers for their tools
async function initialize() {
    if (isInitialized) {
        return;
    }

    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = (async () => {
        log('info', 'Initializing stdio adapter...');
        log('info', `Discovering tools from ${SERVERS.length} MCP servers`);

        const errors = [];

        for (const server of SERVERS) {
            try {
                const response = await fetch(`http://localhost:${server.port}/mcp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: `init-${server.name}`,
                        method: 'tools/list',
                        params: {}
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const result = await response.json();

                if (result.error) {
                    throw new Error(result.error.message);
                }

                const tools = result.result?.tools || [];
                log('info', `Discovered ${tools.length} tools from ${server.name}`, {
                    server: server.name,
                    port: server.port,
                    toolCount: tools.length
                });

                // Map each tool to this server
                for (const tool of tools) {
                    if (toolToServerMap.has(tool.name)) {
                        log('warn', `Duplicate tool name: ${tool.name} (using first occurrence)`);
                    } else {
                        toolToServerMap.set(tool.name, server.port);
                    }
                }

            } catch (error) {
                errors.push({
                    server: server.name,
                    port: server.port,
                    error: error.message
                });
                log('error', `Failed to connect to ${server.name}:${server.port}`, {
                    server: server.name,
                    port: server.port,
                    error: error.message
                });
            }
        }

        isInitialized = true;
        log('info', `Initialization complete. Mapped ${toolToServerMap.size} tools across ${SERVERS.length - errors.length}/${SERVERS.length} servers`);

        if (errors.length > 0) {
            log('warn', `${errors.length} server(s) failed to initialize`, { errors });
        }
    })();

    return initializationPromise;
}

// Forward JSON-RPC request to appropriate HTTP server
async function forwardRequest(request) {
    const { jsonrpc, id, method, params } = request;

    log('debug', `Processing request: ${method}`, { id, method });

    // Ensure initialization is complete
    await initialize();

    // Handle initialize method
    if (method === 'initialize') {
        log('info', 'Handling initialize request');
        return {
            jsonrpc: '2.0',
            id,
            result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                    tools: {}
                },
                serverInfo: {
                    name: 'mcp-stdio-adapter',
                    version: '1.0.0'
                }
            }
        };
    }

    // Handle tools/list - aggregate from all servers
    if (method === 'tools/list') {
        log('info', 'Aggregating tools from all servers');
        const allTools = [];

        for (const server of SERVERS) {
            try {
                const response = await fetch(`http://localhost:${server.port}/mcp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: `list-${server.name}`,
                        method: 'tools/list',
                        params: {}
                    })
                });

                const result = await response.json();
                if (result.result?.tools) {
                    allTools.push(...result.result.tools);
                }
            } catch (error) {
                log('warn', `Failed to get tools from ${server.name}`, { error: error.message });
            }
        }

        log('info', `Returning ${allTools.length} tools total`);
        return {
            jsonrpc: '2.0',
            id,
            result: {
                tools: allTools
            }
        };
    }

    // Handle tools/call - route to specific server
    if (method === 'tools/call') {
        const toolName = params?.name;

        if (!toolName) {
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32602,
                    message: 'Invalid params: tool name is required'
                }
            };
        }

        const serverPort = toolToServerMap.get(toolName);

        if (!serverPort) {
            log('error', `Unknown tool: ${toolName}`);
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32601,
                    message: `Unknown tool: ${toolName}`,
                    data: {
                        tool: toolName,
                        availableTools: Array.from(toolToServerMap.keys())
                    }
                }
            };
        }

        log('info', `Routing tool ${toolName} to server on port ${serverPort}`);

        try {
            const response = await fetch(`http://localhost:${serverPort}/mcp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            log('info', `Tool ${toolName} executed successfully`);
            return result;

        } catch (error) {
            log('error', `Failed to execute tool ${toolName}`, {
                tool: toolName,
                port: serverPort,
                error: error.message
            });

            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32000,
                    message: `Failed to execute tool: ${error.message}`,
                    data: {
                        tool: toolName,
                        port: serverPort,
                        error: error.message
                    }
                }
            };
        }
    }

    // Unknown method
    return {
        jsonrpc: '2.0',
        id,
        error: {
            code: -32601,
            message: `Method not found: ${method}`
        }
    };
}

// Write JSON-RPC response to stdout
function writeResponse(response) {
    const responseStr = JSON.stringify(response);
    stdout.write(responseStr + '\n');
    log('debug', 'Response written to stdout', { id: response.id });
}

// Process incoming JSON-RPC message from stdin
async function processMessage(line) {
    if (!line.trim()) {
        return;
    }

    try {
        const request = JSON.parse(line);
        log('info', `Received request: ${request.method}`, {
            id: request.id,
            method: request.method
        });

        const response = await forwardRequest(request);
        writeResponse(response);

    } catch (error) {
        log('error', 'Failed to process message', {
            error: error.message,
            line: line.substring(0, 100) // Log first 100 chars
        });

        // Send error response if possible
        try {
            const partialRequest = JSON.parse(line);
            writeResponse({
                jsonrpc: '2.0',
                id: partialRequest.id || null,
                error: {
                    code: -32603,
                    message: 'Internal error',
                    data: {
                        error: error.message
                    }
                }
            });
        } catch {
            // Cannot parse request, send generic error
            writeResponse({
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32700,
                    message: 'Parse error'
                }
            });
        }
    }
}

// Graceful shutdown handler
function shutdown(signal) {
    log('info', `Received ${signal}, shutting down gracefully...`);

    // Close stdin
    stdin.pause();

    // Give time for any pending writes to complete
    setTimeout(() => {
        log('info', 'Stdio adapter shut down');
        process.exit(0);
    }, 100);
}

// Main function
async function main() {
    log('info', '='.repeat(80));
    log('info', 'MCP Stdio Adapter - Bridging Claude Desktop to HTTP MCP Servers');
    log('info', '='.repeat(80));
    log('info', `Configured for ${SERVERS.length} servers on ports 3001-3009`);
    log('info', 'Starting adapter...');

    // Register signal handlers for graceful shutdown
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
        log('error', 'Uncaught exception', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        log('error', 'Unhandled rejection', {
            reason: reason instanceof Error ? reason.message : String(reason)
        });
        process.exit(1);
    });

    // Set up readline interface for stdin
    const rl = createInterface({
        input: stdin,
        output: null, // Don't echo to stdout
        terminal: false
    });

    log('info', 'Listening for JSON-RPC messages on stdin...');
    log('info', 'Adapter ready');

    // Process each line from stdin
    rl.on('line', async (line) => {
        await processMessage(line);
    });

    // Handle stdin close
    rl.on('close', () => {
        log('info', 'Stdin closed, shutting down...');
        process.exit(0);
    });

    // Pre-initialize to discover tools
    try {
        await initialize();
    } catch (error) {
        log('error', 'Initialization failed', { error: error.message });
        // Continue anyway - will retry on first request
    }
}

// Start the adapter
main().catch((error) => {
    log('error', 'Fatal error in main', {
        error: error.message,
        stack: error.stack
    });
    process.exit(1);
});
