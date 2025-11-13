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
    const serverConfigs = [
        { name: 'book-planning', port: 3001, path: './config-mcps/book-planning-server/index.js', className: 'BookPlanningMCPServer' },
        { name: 'series-planning', port: 3002, path: './config-mcps/series-planning-server/index.js', className: 'SeriesPlanningMCPServer' },
        { name: 'chapter-planning', port: 3003, path: './config-mcps/chapter-planning-server/index.js', className: 'ChapterPlanningMCPServer' },
        { name: 'character-planning', port: 3004, path: './config-mcps/charater-planning-server/index.js', className: 'CharacterPlanningMCPServer' },
        { name: 'scene', port: 3005, path: './config-mcps/scene-server/index.js', className: 'SceneWritingMCPServer' },
        { name: 'core-continuity', port: 3006, path: './config-mcps/core-continuity-server/index.js', className: 'CoreContinuityMCPServer' },
        { name: 'review', port: 3007, path: './config-mcps/review-server/index.js', className: 'ReviewMCPServer' },
        { name: 'reporting', port: 3008, path: './config-mcps/reporting-server/index.js', className: 'ReportingMCPServer' },
        { name: 'author', port: 3009, path: './mcps/author-server/index.js', className: 'AuthorMCPServer' }
    ];

    console.error('\n🔄 Loading MCP servers...\n');

    for (const config of serverConfigs) {
        try {
            const module = await import(config.path);
            const ServerClass = module[config.className];

    console.error('Loading MCP servers...');

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
        const { SceneMCPServer } = await import('./config-mcps/scene-server/index.js');
        servers.push({
            name: 'scene',
            path: '/scene',
            serverClass: SceneMCPServer,
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

            servers.push({
                name: config.name,
                port: config.port,
                serverClass: ServerClass
            });
            console.error(`✓ ${config.name.padEnd(20)} - Port ${config.port}`);
        } catch (error) {
            console.error(`✗ ${config.name.padEnd(20)} - Failed: ${error.message}`);
        }
    }

    console.error(`\n✅ Successfully loaded ${servers.length}/9 servers\n`);
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

    // POST endpoint for SSE message handling (requires sessionId in body or query)
    app.post('/', express.json(), async (req, res) => {
        const sessionId = req.body.sessionId || req.query.sessionId;

        if (!sessionId) {
            return res.status(400).json({
                error: 'Missing sessionId',
                message: 'sessionId required in request body or query parameters'
            });
        }

        const session = activeTransports.get(sessionId);
        if (!session) {
            return res.status(404).json({
                error: 'Session not found',
                message: `No active session with id: ${sessionId}`
            });
        }

        console.error(`[${name}] Received POST request - Session: ${sessionId}`);

        // The SSE transport handles the message automatically
        res.status(200).json({ status: 'ok', sessionId });
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
