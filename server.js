#!/usr/bin/env node
// server.js
// MCP Server Orchestrator - Manages all 9 MCP servers as child processes
// Provides centralized logging, process management, and graceful shutdown

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Server configurations
const servers = [
    { name: 'book-planning', port: 3001 },
    { name: 'series-planning', port: 3002 },
    { name: 'chapter-planning', port: 3003 },
    { name: 'character-planning', port: 3004 },
    { name: 'scene', port: 3005 },
    { name: 'core-continuity', port: 3006 },
    { name: 'review', port: 3007 },
    { name: 'reporting', port: 3008 },
    { name: 'author', port: 3009 },
    { name: 'database-admin', port: 3010 }
];

// Store child process references
const childProcesses = new Map();

// Track server startup status
const serverStatus = new Map();

// ANSI color codes for better logging
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

// Unified logging with color-coded server names
function log(serverName, message, level = 'info') {
    const timestamp = new Date().toISOString();
    const colorMap = {
        'book-planning': colors.blue,
        'series-planning': colors.magenta,
        'chapter-planning': colors.cyan,
        'character-planning': colors.green,
        'scene': colors.yellow,
        'core-continuity': colors.red,
        'review': colors.blue,
        'reporting': colors.magenta,
        'author': colors.cyan,
        'database-admin': colors.green,
        'orchestrator': colors.bright + colors.white
    };

    const color = colorMap[serverName] || colors.white;
    const levelSymbol = {
        'info': 'ℹ',
        'error': '✗',
        'success': '✓',
        'warn': '⚠'
    }[level] || 'ℹ';

    console.error(`${colors.dim}${timestamp}${colors.reset} ${color}[${serverName.padEnd(20)}]${colors.reset} ${levelSymbol} ${message}`);
}

// Display startup banner
function displayBanner() {
    const width = 80;
    console.error('\n' + '═'.repeat(width));
    console.error('  MCP Writing System - Server Orchestrator');
    console.error('═'.repeat(width));
    console.error('  Architecture: Child Process Management');
    console.error('  Process Isolation: Each server runs in separate Node.js process');
    console.error('  Fault Tolerance: Individual server failures trigger orchestrator exit');
    console.error('═'.repeat(width));
    console.error('');
}

// Display server table after all servers start
function displayServerTable() {
    console.error('\n' + '═'.repeat(80));
    console.error('  🚀 All Servers Running\n');
    console.error('  ┌─────────────────────┬──────┬─────────┬──────────────────────────────────┐');
    console.error('  │ Server              │ Port │ PID     │ Status                           │');
    console.error('  ├─────────────────────┼──────┼─────────┼──────────────────────────────────┤');

    servers.forEach(server => {
        const status = serverStatus.get(server.name);
        const process = childProcesses.get(server.name);
        const pid = process ? process.pid.toString() : 'N/A';
        const statusText = status ? '✓ Running' : '✗ Failed';

        const nameCol = `  │ ${server.name.padEnd(19)}`;
        const portCol = ` │ ${server.port.toString().padEnd(4)}`;
        const pidCol = ` │ ${pid.padEnd(7)}`;
        const statusCol = ` │ ${statusText.padEnd(32)} │`;
        console.error(nameCol + portCol + pidCol + statusCol);
    });

    console.error('  └─────────────────────┴──────┴─────────┴──────────────────────────────────┘\n');
    console.error('  📋 Endpoints: http://localhost:{PORT}/ (SSE), /health, /info\n');
    console.error('═'.repeat(80));
    console.error('');
}

// Spawn a single server as child process
function spawnServer(serverConfig) {
    const { name, port } = serverConfig;

    log('orchestrator', `Starting ${name} on port ${port}...`, 'info');

    const runnerPath = join(__dirname, 'src', 'single-server-runner.js');
    const child = spawn('node', [runnerPath, name, port.toString()], {
        stdio: ['ignore', 'ignore', 'pipe'], // Capture stderr for logging
        env: { ...process.env }
    });

    childProcesses.set(name, child);
    serverStatus.set(name, false); // Initially not started

    // Capture and forward stderr (where server logs go)
    child.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
            // Check if server successfully started
            if (line.includes('Server started on port')) {
                serverStatus.set(name, true);
                log(name, `Ready on port ${port}`, 'success');

                // Check if all servers are now running
                const allStarted = Array.from(serverStatus.values()).every(status => status === true);
                if (allStarted && serverStatus.size === servers.length) {
                    displayServerTable();
                }
            } else {
                // Forward other logs with server name prefix
                log(name, line, 'info');
            }
        });
    });

    // Handle process exit
    child.on('exit', (code, signal) => {
        if (code !== 0 && code !== null) {
            log('orchestrator', `Server ${name} exited with code ${code}`, 'error');
            log('orchestrator', 'Shutting down all servers due to failure...', 'error');
            shutdown(1);
        } else if (signal) {
            log('orchestrator', `Server ${name} killed by signal ${signal}`, 'warn');
        }
    });

    // Handle errors
    child.on('error', (error) => {
        log('orchestrator', `Failed to start ${name}: ${error.message}`, 'error');
        shutdown(1);
    });

    return child;
}

// Start all servers
async function startAllServers() {
    displayBanner();
    log('orchestrator', `Launching ${servers.length} MCP servers...`, 'info');

    // Spawn all servers
    for (const server of servers) {
        spawnServer(server);
        // Small delay between spawns to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    log('orchestrator', 'All server processes spawned', 'success');
}

// Graceful shutdown handler
function shutdown(exitCode = 0) {
    if (shutdown.inProgress) {
        return; // Prevent multiple shutdown attempts
    }
    shutdown.inProgress = true;

    log('orchestrator', '\n🛑 Initiating graceful shutdown...', 'warn');

    // Kill all child processes
    let shutdownCount = 0;
    const totalServers = childProcesses.size;

    if (totalServers === 0) {
        log('orchestrator', 'No servers to shut down', 'info');
        process.exit(exitCode);
        return;
    }

    childProcesses.forEach((child, name) => {
        if (child && !child.killed) {
            log('orchestrator', `Sending SIGTERM to ${name}...`, 'info');

            child.on('exit', () => {
                shutdownCount++;
                log('orchestrator', `${name} shut down (${shutdownCount}/${totalServers})`, 'success');

                if (shutdownCount === totalServers) {
                    log('orchestrator', '✅ All servers shut down gracefully\n', 'success');
                    process.exit(exitCode);
                }
            });

            child.kill('SIGTERM');
        } else {
            shutdownCount++;
        }
    });

    // Force exit after 10 seconds if graceful shutdown fails
    setTimeout(() => {
        log('orchestrator', '⚠️  Forcing shutdown after timeout', 'warn');

        childProcesses.forEach((child, name) => {
            if (child && !child.killed) {
                log('orchestrator', `Force killing ${name}...`, 'warn');
                child.kill('SIGKILL');
            }
        });

        setTimeout(() => {
            process.exit(exitCode);
        }, 1000);
    }, 10000);
}

// Register signal handlers
process.on('SIGINT', () => {
    log('orchestrator', '\nReceived SIGINT (Ctrl+C)', 'warn');
    shutdown(0);
});

process.on('SIGTERM', () => {
    log('orchestrator', 'Received SIGTERM', 'warn');
    shutdown(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    log('orchestrator', `Uncaught exception: ${error.message}`, 'error');
    console.error(error.stack);
    shutdown(1);
});

process.on('unhandledRejection', (reason, promise) => {
    log('orchestrator', `Unhandled rejection: ${reason}`, 'error');
    shutdown(1);
});

// Start the orchestrator
log('orchestrator', 'MCP Server Orchestrator starting...', 'info');
startAllServers().catch(error => {
    log('orchestrator', `Fatal error: ${error.message}`, 'error');
    console.error(error.stack);
    shutdown(1);
});
