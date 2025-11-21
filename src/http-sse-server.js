#!/usr/bin/env node
// src/http-sse-server.js
// Multi-Port HTTP/SSE server for all MCP Writing Servers
// Each server runs on its own dedicated port (3001-3009) with SSE session management

import express from 'express';
import cors from 'cors';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

// Load environment variables
dotenv.config();

// Active SSE transports Map - tracks sessions by sessionId
const activeTransports = new Map();

// Dynamically import all MCP servers
async function loadServers() {
    const servers = [];

    console.error('\n🔄 Loading MCP servers...\n');

    try {
        // Book Planning Server
        const { BookPlanningMCPServer } = await import('./config-mcps/book-planning-server/index.js');
        servers.push({
            name: 'book-planning',
            path: '/book-planning',
            serverClass: BookPlanningMCPServer,
            port: 3001
        });
        console.error('✓ Book Planning Server loaded');
    } catch (error) {
        console.error('✗ Failed to load Book Planning Server:', error.message);
    }

    try {
        // Series Planning Server
        const { SeriesPlanningMCPServer } = await import('./config-mcps/series-planning-server/index.js');
        servers.push({
            name: 'series-planning',
            path: '/series-planning',
            serverClass: SeriesPlanningMCPServer,
            port: 3002
        });
        console.error('✓ Series Planning Server loaded');
    } catch (error) {
        console.error('✗ Failed to load Series Planning Server:', error.message);
    }

    try {
        // Chapter Planning Server
        const { ChapterPlanningMCPServer } = await import('./config-mcps/chapter-planning-server/index.js');
        servers.push({
            name: 'chapter-planning',
            path: '/chapter-planning',
            serverClass: ChapterPlanningMCPServer,
            port: 3003
        });
        console.error('✓ Chapter Planning Server loaded');
    } catch (error) {
        console.error('✗ Failed to load Chapter Planning Server:', error.message);
    }

    try {
        // Character Planning Server
        const { CharacterPlanningMCPServer } = await import('./config-mcps/character-planning-server/index.js');
        servers.push({
            name: 'character-planning',
            path: '/character-planning',
            serverClass: CharacterPlanningMCPServer,
            port: 3004
        });
        console.error('✓ Character Planning Server loaded');
    } catch (error) {
        console.error('✗ Failed to load Character Planning Server:', error.message);
    }

    try {
        // Scene Server
        const { SceneWritingMCPServer } = await import('./config-mcps/scene-server/index.js');
        servers.push({
            name: 'scene',
            path: '/scene',
            serverClass: SceneWritingMCPServer,
            port: 3005
        });
        console.error('✓ Scene Server loaded');
    } catch (error) {
        console.error('✗ Failed to load Scene Server:', error.message);
    }

    try {
        // Core Continuity Server
        const { CoreContinuityMCPServer } = await import('./config-mcps/core-continuity-server/index.js');
        servers.push({
            name: 'core-continuity',
            path: '/core-continuity',
            serverClass: CoreContinuityMCPServer,
            port: 3006
        });
        console.error('✓ Core Continuity Server loaded');
    } catch (error) {
        console.error('✗ Failed to load Core Continuity Server:', error.message);
    }

    try {
        // Review Server
        const { ReviewMCPServer } = await import('./config-mcps/review-server/index.js');
        servers.push({
            name: 'review',
            path: '/review',
            serverClass: ReviewMCPServer,
            port: 3007
        });
        console.error('✓ Review Server loaded');
    } catch (error) {
        console.error('✗ Failed to load Review Server:', error.message);
    }

    try {
        // Reporting Server
        const { ReportingMCPServer } = await import('./config-mcps/reporting-server/index.js');
        servers.push({
            name: 'reporting',
            path: '/reporting',
            serverClass: ReportingMCPServer,
            port: 3008
        });
        console.error('✓ Reporting Server loaded');
    } catch (error) {
        console.error('✗ Failed to load Reporting Server:', error.message);
    }

    try {
        // Database Admin Server
        const { DatabaseAdminMCPServer } = await import('./mcps/database-admin-server/index.js');
        servers.push({
            name: 'database-admin',
            path: '/database-admin',
            serverClass: DatabaseAdminMCPServer,
            port: 3010
        });
        console.error('✓ Database Admin Server loaded');
    } catch (error) {
        console.error('✗ Failed to load Database Admin Server:', error.message);
    }

    console.error(`\n✅ Successfully loaded ${servers.length}/10 servers\n`);
    return servers;
}

// Create HTTP/SSE server for a single MCP server on dedicated port
function createServerEndpoint(serverConfig) {
    const { name, port, serverClass } = serverConfig;
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
        console.error(`[${name}] New SSE connection - Session: ${sessionId}`);

        try {
            // Create a new instance of the MCP server
            const mcpServer = new serverClass();

            // Create SSE transport with session endpoint
            const transport = new SSEServerTransport(`/${sessionId}`, res);

            // Store in active transports map
            activeTransports.set(sessionId, { transport, mcpServer, name });

            // Connect the MCP server to the transport
            await mcpServer.server.connect(transport);

            console.error(`[${name}] MCP server connected - Session: ${sessionId}`);

            // Handle client disconnect
            req.on('close', () => {
                console.error(`[${name}] SSE connection closed - Session: ${sessionId}`);
                activeTransports.delete(sessionId);
            });

        } catch (error) {
            console.error(`[${name}] Error setting up SSE connection:`, error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to initialize MCP server' });
            }
        }
    });

    // POST endpoint for SSE message handling - matches the session-specific path
    // The SSEServerTransport creates POST endpoint at /<sessionId>
    app.post('/:sessionId', express.json(), async (req, res) => {
        const sessionId = req.params.sessionId;

        console.error(`[${name}] Received POST request for session: ${sessionId}`);

        try {
            const session = activeTransports.get(sessionId);
            if (!session) {
                console.error(`[${name}] No active session found for: ${sessionId}`);
                return res.status(404).json({
                    error: 'Session not found',
                    message: `No active session with id: ${sessionId}`
                });
            }

            // Let the transport handle the incoming message
            await session.transport.handlePostMessage(req, res, req.body);

        } catch (error) {
            console.error(`[${name}] Error handling POST:`, error);
            if (!res.headersSent) {
                res.status(500).json({ error: error.message });
            }
        }
    });

    // Health check endpoint
    app.get('/health', async (req, res) => {
        try {
            const mcpServer = new serverClass();
            const health = await mcpServer.db.healthCheck();
            res.json({
                server: name,
                status: 'healthy',
                database: health,
                activeSessions: Array.from(activeTransports.entries())
                    .filter(([_, session]) => session.name === name)
                    .length,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                server: name,
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    // Info endpoint - lists available tools
    app.get('/info', async (req, res) => {
        try {
            const mcpServer = new serverClass();
            res.json({
                server: name,
                port: port,
                version: mcpServer.serverVersion,
                tools: mcpServer.tools.map(tool => ({
                    name: tool.name,
                    description: tool.description
                })),
                endpoints: {
                    sse: `http://localhost:${port}/`,
                    health: `http://localhost:${port}/health`,
                    info: `http://localhost:${port}/info`,
                    api: `http://localhost:${port}/api/tool-call`
                }
            });
        } catch (error) {
            res.status(500).json({
                error: 'Failed to get server info',
                message: error.message
            });
        }
    });

    // Direct API endpoint for tool calls (without SSE session)
    // This endpoint is designed for simple HTTP clients like Electron apps
    app.post('/api/tool-call', express.json(), async (req, res) => {
        console.error(`[${name}] Direct API tool call request`);

        try {
            const { jsonrpc, method, params, id } = req.body;

            // Validate JSON-RPC 2.0 request
            if (jsonrpc !== '2.0') {
                return res.status(400).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32600,
                        message: 'Invalid Request: jsonrpc must be "2.0"'
                    },
                    id: id || null
                });
            }

            if (method !== 'tools/call') {
                return res.status(400).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32601,
                        message: 'Method not found: only "tools/call" is supported'
                    },
                    id: id || null
                });
            }

            if (!params || !params.name) {
                return res.status(400).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32602,
                        message: 'Invalid params: "name" is required'
                    },
                    id: id || null
                });
            }

            // Create a temporary MCP server instance
            const mcpServer = new serverClass();

            // Find the requested tool
            const tool = mcpServer.tools.find(t => t.name === params.name);
            if (!tool) {
                return res.status(404).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32601,
                        message: `Tool not found: ${params.name}`
                    },
                    id: id || null
                });
            }

            console.error(`[${name}] Executing tool: ${params.name}`);

            // Execute the tool directly
            const args = params.arguments || {};
            const result = await tool.handler(args);

            // Return MCP-style response
            res.json({
                jsonrpc: '2.0',
                result: {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result)
                        }
                    ]
                },
                id: id || null
            });

            console.error(`[${name}] Tool ${params.name} completed successfully`);

        } catch (error) {
            console.error(`[${name}] Error executing tool:`, error);
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal error',
                    data: error.message
                },
                id: req.body.id || null
            });
        }
    });

    return app;
}

// Display formatted startup table
function displayStartupTable(servers) {
    const width = 80;
    console.error('═'.repeat(width));
    console.error('  MCP Writing System - Multi-Port HTTP/SSE Server');
    console.error('═'.repeat(width));
    console.error('  Architecture: Each server runs on dedicated port with SSE transport');
    console.error('  Session Management: activeTransports Map tracks all connections');
    console.error('═'.repeat(width));
    console.error('\n  📡 Active Servers:\n');

    // Table header
    console.error('  ┌─────────────────────┬──────┬──────────────────────────────────────────┐');
    console.error('  │ Server              │ Port │ SSE Endpoint                             │');
    console.error('  ├─────────────────────┼──────┼──────────────────────────────────────────┤');

    // Table rows
    servers.forEach(server => {
        const nameCol = `  │ ${server.name.padEnd(19)}`;
        const portCol = ` │ ${server.port.toString().padEnd(4)}`;
        const endpointCol = ` │ http://localhost:${server.port}/`.padEnd(43) + '│';
        console.error(nameCol + portCol + endpointCol);
    });

    console.error('  └─────────────────────┴──────┴──────────────────────────────────────────┘\n');

    // Additional endpoints
    console.error('  📋 Additional Endpoints (append to any server URL):\n');
    console.error('     • /health   - Database status and active sessions');
    console.error('     • /info     - Server details and available tools\n');

    console.error('═'.repeat(width));
    console.error('  🚀 All servers ready for TypingMind connections!');
    console.error('═'.repeat(width));
    console.error('');
}

// Main server setup
async function startServer() {
    // Load all servers
    const servers = await loadServers();

    if (servers.length === 0) {
        console.error('❌ ERROR: No servers could be loaded!');
        process.exit(1);
    }

    // Create and start Express app for each server on its dedicated port
    const serverInstances = [];

    for (const serverConfig of servers) {
        const app = createServerEndpoint(serverConfig);

        try {
            const serverInstance = app.listen(serverConfig.port, () => {
                // Silently start - table will show all at once
            });

            serverInstances.push({
                ...serverConfig,
                instance: serverInstance
            });
        } catch (error) {
            console.error(`❌ Failed to start ${serverConfig.name} on port ${serverConfig.port}:`, error.message);
        }
    }

    // Display formatted table after all servers started
    displayStartupTable(servers);

    // Graceful shutdown handler
    const shutdown = () => {
        console.error('\n\n🛑 Shutting down Multi-Port HTTP/SSE server...\n');

        // Close all active transports
        console.error(`   Closing ${activeTransports.size} active session(s)...`);
        activeTransports.clear();

        // Close all server instances
        let shutdownCount = 0;
        serverInstances.forEach(({ name, instance }) => {
            instance.close(() => {
                shutdownCount++;
                console.error(`   ✓ ${name} server closed`);

                if (shutdownCount === serverInstances.length) {
                    console.error('\n✅ All servers shut down gracefully\n');
                    process.exit(0);
                }
            });
        });

        // Force exit after 5 seconds if graceful shutdown fails
        setTimeout(() => {
            console.error('⚠️  Forcing shutdown after timeout');
            process.exit(1);
        }, 5000);
    };

    // Register shutdown handlers
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

// Start the server
startServer().catch(error => {
    console.error('💥 Fatal error starting server:', error);
    process.exit(1);
});
