#!/usr/bin/env node
// src/single-server-runner.js
// Runs a single MCP server on specified port - designed to be spawned as child process

import express from 'express';
import cors from 'cors';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

// Load environment variables
dotenv.config();

// Get server configuration from command line arguments or environment variables
const serverName = process.argv[2] || process.env.SERVER_NAME;
const port = parseInt(process.argv[3] || process.env.SERVER_PORT || '3000');

if (!serverName || !port) {
    console.error('❌ ERROR: Missing required arguments');
    console.error('Usage: node single-server-runner.js <server-name> <port>');
    console.error('Example: node single-server-runner.js book-planning 3001');
    process.exit(1);
}

// Server configuration mapping
const serverConfigs = {
    'book-planning': { path: './config-mcps/book-planning-server/index.js', className: 'BookPlanningMCPServer' },
    'series-planning': { path: './config-mcps/series-planning-server/index.js', className: 'SeriesPlanningMCPServer' },
    'chapter-planning': { path: './config-mcps/chapter-planning-server/index.js', className: 'ChapterPlanningMCPServer' },
    'character-planning': { path: './config-mcps/character-planning-server/index.js', className: 'CharacterPlanningMCPServer' },
    'scene': { path: './config-mcps/scene-server/index.js', className: 'SceneWritingMCPServer' },
    'core-continuity': { path: './config-mcps/core-continuity-server/index.js', className: 'CoreContinuityMCPServer' },
    'review': { path: './config-mcps/review-server/index.js', className: 'ReviewMCPServer' },
    'reporting': { path: './config-mcps/reporting-server/index.js', className: 'ReportingMCPServer' },
    'author': { path: './mcps/author-server/index.js', className: 'AuthorMCPServer' },
    'database-admin': { path: './mcps/database-admin-server/index.js', className: 'DatabaseAdminMCPServer' }
};

// Active SSE transports Map
const activeTransports = new Map();

// Shared MCP server instance - ONE per process to prevent connection pool exhaustion
let sharedMCPServer = null;

async function startServer() {
    const config = serverConfigs[serverName];

    if (!config) {
        console.error(`❌ ERROR: Unknown server name: ${serverName}`);
        console.error(`Available servers: ${Object.keys(serverConfigs).join(', ')}`);
        process.exit(1);
    }

    try {
        // Dynamically import the server class
        const module = await import(config.path);
        const ServerClass = module[config.className];

        if (!ServerClass) {
            throw new Error(`Server class ${config.className} not found in ${config.path}`);
        }

        // Create ONE shared MCP server instance for this process
        // This prevents creating a new 20-connection pool for every HTTP request
        sharedMCPServer = new ServerClass();
        console.error(`✅ [${serverName}:${port}] Shared MCP server instance created`);
        console.error(`   Database connection pool: max 20 connections (shared across all requests)`);


        // Create Express app
        const app = express();

        // Middleware
        app.use(cors({
            origin: '*',
            credentials: true
        }));

        app.use((req, res, next) => {
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('X-Accel-Buffering', 'no');
            next();
        });

        // Root SSE endpoint - GET creates SSE stream, POST handles messages
        app.get('/', async (req, res) => {
            const sessionId = randomUUID();
            console.error(`[${serverName}:${port}] New SSE connection - Session: ${sessionId}`);

            try {
                // Create SSE transport with session endpoint
                const transport = new SSEServerTransport(`/${sessionId}`, res);

                // Store in active transports map (using shared server instance)
                activeTransports.set(sessionId, { transport, mcpServer: sharedMCPServer });

                // Connect the shared MCP server to the transport
                await sharedMCPServer.server.connect(transport);

                console.error(`[${serverName}:${port}] MCP server connected - Session: ${sessionId}`);

                // Handle client disconnect
                req.on('close', () => {
                    console.error(`[${serverName}:${port}] SSE connection closed - Session: ${sessionId}`);
                    activeTransports.delete(sessionId);
                    // Note: We don't close the database connection here because
                    // the shared server instance is reused across all sessions
                });

            } catch (error) {
                console.error(`[${serverName}:${port}] Error setting up SSE connection:`, error);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Failed to initialize MCP server' });
                }
            }
        });

        // POST endpoint for SSE message handling
        app.post('/:sessionId', express.json(), async (req, res) => {
            const sessionId = req.params.sessionId;

            try {
                const session = activeTransports.get(sessionId);
                if (!session) {
                    return res.status(404).json({
                        error: 'Session not found',
                        message: `No active session with id: ${sessionId}`
                    });
                }

                // Let the transport handle the incoming message
                await session.transport.handlePostMessage(req, res, req.body);

            } catch (error) {
                console.error(`[${serverName}:${port}] Error handling POST:`, error);
                if (!res.headersSent) {
                    res.status(500).json({ error: error.message });
                }
            }
        });

        // Health check endpoint
        app.get('/health', async (req, res) => {
            try {
                // Use shared server instance instead of creating new one
                const health = await sharedMCPServer.db.healthCheck();
                res.json({
                    server: serverName,
                    port: port,
                    status: 'healthy',
                    database: health,
                    activeSessions: activeTransports.size,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    server: serverName,
                    port: port,
                    status: 'unhealthy',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Info endpoint
        app.get('/info', async (req, res) => {
            try {
                // Use shared server instance instead of creating new one
                res.json({
                    server: serverName,
                    port: port,
                    version: sharedMCPServer.serverVersion,
                    tools: sharedMCPServer.tools.map(tool => ({
                        name: tool.name,
                        description: tool.description
                    })),
                    endpoints: {
                        sse: `http://localhost:${port}/`,
                        health: `http://localhost:${port}/health`,
                        info: `http://localhost:${port}/info`,
                        mcp: `http://localhost:${port}/mcp`
                    }
                });
            } catch (error) {
                res.status(500).json({
                    error: 'Failed to get server info',
                    message: error.message
                });
            }
        });

        // MCP JSON-RPC endpoint for stdio adapter
        app.post('/mcp', express.json(), async (req, res) => {
            try {
                // Use shared server instance instead of creating new one
                const { jsonrpc, id, method, params } = req.body;

                // Validate JSON-RPC 2.0 request
                if (jsonrpc !== '2.0') {
                    return res.json({
                        jsonrpc: '2.0',
                        id: id || null,
                        error: {
                            code: -32600,
                            message: 'Invalid Request: jsonrpc must be "2.0"'
                        }
                    });
                }

                // Handle different MCP methods
                if (method === 'tools/list') {
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        result: {
                            tools: sharedMCPServer.tools
                        }
                    });
                } else if (method === 'tools/call') {
                    const { name, arguments: args } = params || {};

                    if (!name) {
                        return res.json({
                            jsonrpc: '2.0',
                            id,
                            error: {
                                code: -32602,
                                message: 'Invalid params: tool name is required'
                            }
                        });
                    }

                    // Find the tool handler
                    const handler = sharedMCPServer.getToolHandler(name);
                    if (!handler) {
                        return res.json({
                            jsonrpc: '2.0',
                            id,
                            error: {
                                code: -32601,
                                message: `Unknown tool: ${name}`
                            }
                        });
                    }

                    // Execute the tool
                    try {
                        const result = await handler(args || {});
                        return res.json({
                            jsonrpc: '2.0',
                            id,
                            result
                        });
                    } catch (toolError) {
                        return res.json({
                            jsonrpc: '2.0',
                            id,
                            error: {
                                code: -32000,
                                message: `Tool execution error: ${toolError.message}`,
                                data: {
                                    tool: name,
                                    error: toolError.message
                                }
                            }
                        });
                    }
                } else if (method === 'initialize') {
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        result: {
                            protocolVersion: '2024-11-05',
                            capabilities: {
                                tools: {}
                            },
                            serverInfo: {
                                name: serverName,
                                version: sharedMCPServer.serverVersion || '1.0.0'
                            }
                        }
                    });
                } else {
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -32601,
                            message: `Method not found: ${method}`
                        }
                    });
                }
            } catch (error) {
                console.error(`[${serverName}:${port}] Error handling /mcp request:`, error);
                return res.json({
                    jsonrpc: '2.0',
                    id: req.body?.id || null,
                    error: {
                        code: -32603,
                        message: 'Internal error',
                        data: {
                            message: error.message
                        }
                    }
                });
            }
        });

        // Start listening
        const serverInstance = app.listen(port, () => {
            console.error(`✅ [${serverName}] Server started on port ${port}`);
            console.error(`   SSE Endpoint: http://localhost:${port}/`);
            console.error(`   Health Check: http://localhost:${port}/health`);
        });

        // Graceful shutdown
        const shutdown = async () => {
            console.error(`\n🛑 [${serverName}:${port}] Shutting down...`);

            // Close active transports
            activeTransports.clear();

            // Close database connection pool
            if (sharedMCPServer && sharedMCPServer.db) {
                try {
                    console.error(`[${serverName}:${port}] Closing database connection pool...`);
                    await sharedMCPServer.db.close();
                    console.error(`✅ [${serverName}:${port}] Database pool closed`);
                } catch (error) {
                    console.error(`⚠️  [${serverName}:${port}] Error closing database pool:`, error);
                }
            }

            // Close server
            serverInstance.close(() => {
                console.error(`✅ [${serverName}:${port}] Server closed gracefully`);
                process.exit(0);
            });

            // Force exit after 5 seconds
            setTimeout(() => {
                console.error(`⚠️  [${serverName}:${port}] Forcing shutdown after timeout`);
                process.exit(1);
            }, 5000);
        };

        // Register shutdown handlers
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        // Handle uncaught errors
        process.on('uncaughtException', (error) => {
            console.error(`💥 [${serverName}:${port}] Uncaught exception:`, error);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error(`💥 [${serverName}:${port}] Unhandled rejection:`, reason);
            process.exit(1);
        });

    } catch (error) {
        console.error(`❌ [${serverName}:${port}] Failed to start server:`, error);
        process.exit(1);
    }
}

// Start the server
startServer();
