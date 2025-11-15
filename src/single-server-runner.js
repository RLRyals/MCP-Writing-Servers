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
    'author': { path: './mcps/author-server/index.js', className: 'AuthorMCPServer' }
};

// Active SSE transports Map
const activeTransports = new Map();

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
                // Create a new instance of the MCP server
                const mcpServer = new ServerClass();

                // Create SSE transport with session endpoint
                const transport = new SSEServerTransport(`/${sessionId}`, res);

                // Store in active transports map
                activeTransports.set(sessionId, { transport, mcpServer });

                // Connect the MCP server to the transport
                await mcpServer.server.connect(transport);

                console.error(`[${serverName}:${port}] MCP server connected - Session: ${sessionId}`);

                // Handle client disconnect
                req.on('close', () => {
                    console.error(`[${serverName}:${port}] SSE connection closed - Session: ${sessionId}`);
                    activeTransports.delete(sessionId);
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
                const mcpServer = new ServerClass();
                const health = await mcpServer.db.healthCheck();
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
                const mcpServer = new ServerClass();
                res.json({
                    server: serverName,
                    port: port,
                    version: mcpServer.serverVersion,
                    tools: mcpServer.tools.map(tool => ({
                        name: tool.name,
                        description: tool.description
                    })),
                    endpoints: {
                        sse: `http://localhost:${port}/`,
                        health: `http://localhost:${port}/health`,
                        info: `http://localhost:${port}/info`
                    }
                });
            } catch (error) {
                res.status(500).json({
                    error: 'Failed to get server info',
                    message: error.message
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
        const shutdown = () => {
            console.error(`\n🛑 [${serverName}:${port}] Shutting down...`);

            // Close active transports
            activeTransports.clear();

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
