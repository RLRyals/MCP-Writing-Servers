#!/usr/bin/env node
// src/http-sse-server.js
// HTTP/SSE server for all MCP Writing Servers
// Provides direct HTTP/SSE endpoints for web clients like TypingMind

import express from 'express';
import cors from 'cors';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Dynamically import all MCP servers
async function loadServers() {
    const servers = [];

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
        const { CharacterPlanningMCPServer } = await import('./config-mcps/charater-planning-server/index.js');
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

    console.error(`\nSuccessfully loaded ${servers.length} MCP servers\n`);
    return servers;
}

// Create HTTP/SSE server for a single MCP server
function createServerEndpoint(app, serverConfig) {
    const { name, path, serverClass } = serverConfig;

    console.error(`Setting up SSE endpoint: ${path}`);

    // SSE endpoint - this is what TypingMind connects to
    app.get(path, async (req, res) => {
        console.error(`[${name}] New SSE connection established`);

        try {
            // Create a new instance of the MCP server
            const mcpServer = new serverClass();

            // Create SSE transport
            const transport = new SSEServerTransport(path, res);

            // Connect the MCP server to the transport
            await mcpServer.server.connect(transport);

            console.error(`[${name}] MCP server connected via SSE`);

            // Handle client disconnect
            req.on('close', () => {
                console.error(`[${name}] SSE connection closed`);
            });

        } catch (error) {
            console.error(`[${name}] Error setting up SSE connection:`, error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to initialize MCP server' });
            }
        }
    });

    // POST endpoint for SSE message handling (required by MCP SSE transport)
    app.post(path, express.json(), async (req, res) => {
        console.error(`[${name}] Received POST request`);
        // This is handled by the SSE transport automatically
        res.status(200).send();
    });

    // Health check endpoint
    app.get(`${path}/health`, async (req, res) => {
        try {
            const mcpServer = new serverClass();
            const health = await mcpServer.db.healthCheck();
            res.json({
                server: name,
                status: 'healthy',
                database: health,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                server: name,
                status: 'unhealthy',
                error: error.message
            });
        }
    });

    // Info endpoint - lists available tools
    app.get(`${path}/info`, async (req, res) => {
        try {
            const mcpServer = new serverClass();
            res.json({
                server: name,
                version: mcpServer.serverVersion,
                path: path,
                tools: mcpServer.tools.map(tool => ({
                    name: tool.name,
                    description: tool.description
                }))
            });
        } catch (error) {
            res.status(500).json({
                error: 'Failed to get server info',
                message: error.message
            });
        }
    });
}

// Main server setup
async function startServer() {
    const app = express();
    const port = process.env.PORT || 3000;

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

    // Load all servers
    const servers = await loadServers();

    if (servers.length === 0) {
        console.error('ERROR: No servers could be loaded!');
        process.exit(1);
    }

    // Setup endpoints for each server
    servers.forEach(serverConfig => {
        createServerEndpoint(app, serverConfig);
    });

    // Root endpoint - list all servers
    app.get('/', (req, res) => {
        res.json({
            name: 'MCP Writing System - HTTP/SSE Server',
            version: '1.0.0',
            servers: servers.map(s => ({
                name: s.name,
                path: s.path,
                endpoints: {
                    sse: `http://localhost:${port}${s.path}`,
                    health: `http://localhost:${port}${s.path}/health`,
                    info: `http://localhost:${port}${s.path}/info`
                }
            }))
        });
    });

    // Global health check
    app.get('/health', (req, res) => {
        res.json({
            status: 'healthy',
            serverCount: servers.length,
            timestamp: new Date().toISOString()
        });
    });

    // Start listening
    app.listen(port, () => {
        console.error('═'.repeat(60));
        console.error('  MCP Writing System - HTTP/SSE Server');
        console.error('═'.repeat(60));
        console.error(`  Port: ${port}`);
        console.error(`  Servers: ${servers.length}`);
        console.error('─'.repeat(60));
        console.error('  Available endpoints:');
        console.error(`  • Root:   http://localhost:${port}/`);
        console.error(`  • Health: http://localhost:${port}/health`);
        console.error('─'.repeat(60));
        servers.forEach(s => {
            console.error(`  • ${s.name}:`);
            console.error(`    SSE:    http://localhost:${port}${s.path}`);
            console.error(`    Health: http://localhost:${port}${s.path}/health`);
            console.error(`    Info:   http://localhost:${port}${s.path}/info`);
        });
        console.error('═'.repeat(60));
        console.error('  Ready for TypingMind connections!');
        console.error('═'.repeat(60));
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.error('\nShutting down HTTP/SSE server...');
        process.exit(0);
    });
}

// Start the server
startServer().catch(error => {
    console.error('Fatal error starting server:', error);
    process.exit(1);
});
