# MCP-Electron Integration Guide

Complete guide for integrating MCP Writing Servers into the MCP-Electron project for desktop application access.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Claude Desktop Integration](#claude-desktop-integration)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)

---

## Overview

This guide explains how to integrate the MCP Writing Servers into an Electron-based application, enabling database operations through a desktop UI with Claude Desktop compatibility.

### Integration Goals

- ✅ Clone MCP-Writing-Servers into MCP-Electron project
- ✅ Enable database operation UI in Electron app
- ✅ Configure Claude Desktop stdio adapter support
- ✅ Provide seamless desktop experience

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│           MCP-Electron Application                  │
│  ┌─────────────────────────────────────────────┐   │
│  │         Electron Main Process               │   │
│  │                                             │   │
│  │  ┌──────────────┐    ┌──────────────┐     │   │
│  │  │  HTTP/SSE    │    │   stdio      │     │   │
│  │  │   Client     │    │   Adapter    │     │   │
│  │  └──────┬───────┘    └──────┬───────┘     │   │
│  │         │                   │              │   │
│  └─────────┼───────────────────┼──────────────┘   │
│            │                   │                   │
└────────────┼───────────────────┼───────────────────┘
             │                   │
    ┌────────▼───────┐   ┌───────▼────────┐
    │  HTTP/SSE      │   │     stdio      │
    │  Transport     │   │   Transport    │
    │ (Port 3001-    │   │  (stdin/out)   │
    │      3010)     │   │                │
    └────────┬───────┘   └───────┬────────┘
             │                   │
             └─────────┬─────────┘
                       │
          ┌────────────▼─────────────┐
          │   MCP Writing Servers    │
          │   (10 servers)           │
          └──────────────────────────┘
                       │
          ┌────────────▼─────────────┐
          │   PostgreSQL Database    │
          └──────────────────────────┘
```

---

## Prerequisites

### Software Requirements

```bash
# Node.js and npm
node --version   # 18+
npm --version    # 9+

# Git
git --version

# PostgreSQL (or Docker)
psql --version   # 16+
# OR
docker --version  # 20.10+
```

### MCP-Electron Project

If you don't have the MCP-Electron project:

```bash
# Clone or create your Electron project
git clone https://github.com/your-org/MCP-Electron.git
cd MCP-Electron
```

---

## Installation

### Step 1: Clone MCP-Writing-Servers

Navigate to your MCP-Electron project directory and clone the servers:

```bash
cd /path/to/MCP-Electron

# Clone into a subdirectory
git clone https://github.com/RLRyals/MCP-Writing-Servers.git servers/mcp-writing

# Or use git submodule for better version control
git submodule add https://github.com/RLRyals/MCP-Writing-Servers.git servers/mcp-writing
git submodule update --init --recursive
```

### Step 2: Install Dependencies

```bash
cd servers/mcp-writing
npm install

# Return to main project
cd ../..
```

### Step 3: Database Setup

#### Option A: Using Docker

```bash
cd servers/mcp-writing

# Start PostgreSQL with Docker Compose
docker-compose up -d postgres

# Initialize database
docker-compose exec postgres psql -U writer -d mcp_series -f /docker-entrypoint-initdb.d/init.sql
```

#### Option B: Local PostgreSQL

```bash
# Create database
createdb mcp_series

# Create user
psql postgres -c "CREATE USER writer WITH PASSWORD 'your_password';"
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE mcp_series TO writer;"

# Initialize schema
psql -U writer -d mcp_series -f servers/mcp-writing/init.sql
```

### Step 4: Configure Environment

```bash
cd servers/mcp-writing

# Copy environment template
cp .env.example .env

# Edit configuration
nano .env
```

**Required settings:**

```env
# Database connection
DATABASE_URL=postgresql://writer:your_password@localhost:5432/mcp_series

# Node environment
NODE_ENV=development

# Authentication (optional for local use)
MCP_AUTH_TOKEN=your-secure-token-here
```

---

## Configuration

### Electron Main Process Integration

Add the following to your Electron main process file (e.g., `main.js` or `index.js`):

```javascript
// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

// Path to MCP servers
const MCP_SERVERS_PATH = path.join(__dirname, 'servers', 'mcp-writing');

// Store server process reference
let mcpServerProcess = null;

// Start MCP servers
function startMCPServers() {
    console.log('Starting MCP Writing Servers...');

    mcpServerProcess = spawn('node', ['src/http-sse-server.js'], {
        cwd: MCP_SERVERS_PATH,
        env: {
            ...process.env,
            NODE_ENV: 'development'
        },
        stdio: 'pipe'
    });

    mcpServerProcess.stdout.on('data', (data) => {
        console.log(`[MCP]: ${data}`);
    });

    mcpServerProcess.stderr.on('data', (data) => {
        console.error(`[MCP Error]: ${data}`);
    });

    mcpServerProcess.on('close', (code) => {
        console.log(`MCP servers exited with code ${code}`);
        mcpServerProcess = null;
    });
}

// Stop MCP servers
function stopMCPServers() {
    if (mcpServerProcess) {
        console.log('Stopping MCP Writing Servers...');
        mcpServerProcess.kill('SIGTERM');
        mcpServerProcess = null;
    }
}

// App lifecycle
app.whenReady().then(() => {
    createWindow();
    startMCPServers();
});

app.on('window-all-closed', () => {
    stopMCPServers();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopMCPServers();
});

// IPC handlers for database operations
ipcMain.handle('mcp:query', async (event, { server, tool, params }) => {
    // Implement HTTP call to MCP server
    const port = getServerPort(server); // Map server name to port
    const response = await fetch(`http://localhost:${port}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { name: tool, arguments: params }
        })
    });
    return await response.json();
});

function getServerPort(serverName) {
    const ports = {
        'book-planning': 3001,
        'series-planning': 3002,
        'chapter-planning': 3003,
        'character-planning': 3004,
        'scene': 3005,
        'core-continuity': 3006,
        'review': 3007,
        'reporting': 3008,
        'author': 3009,
        'database-admin': 3010
    };
    return ports[serverName] || 3001;
}
```

### Renderer Process (UI)

Create a database operations UI in your renderer process:

```javascript
// renderer.js
const { ipcRenderer } = require('electron');

// Example: Query characters
async function queryCharacters() {
    try {
        const result = await ipcRenderer.invoke('mcp:query', {
            server: 'database-admin',
            tool: 'db_query_records',
            params: {
                table_name: 'characters',
                filters: {},
                limit: 10
            }
        });
        console.log('Characters:', result);
        return result;
    } catch (error) {
        console.error('Query failed:', error);
    }
}

// Example: Insert character
async function createCharacter(characterData) {
    try {
        const result = await ipcRenderer.invoke('mcp:query', {
            server: 'database-admin',
            tool: 'db_insert_record',
            params: {
                table_name: 'characters',
                data: characterData
            }
        });
        console.log('Character created:', result);
        return result;
    } catch (error) {
        console.error('Insert failed:', error);
    }
}

// Example usage
queryCharacters().then(data => {
    // Update UI with character data
});
```

### HTML UI Example

```html
<!-- index.html -->
<!DOCTYPE html>
<html>
<head>
    <title>MCP Writing Database</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
        .status.healthy { background-color: #d4edda; color: #155724; }
        .status.unhealthy { background-color: #f8d7da; color: #721c24; }
        button { padding: 10px 20px; margin: 5px; cursor: pointer; }
    </style>
</head>
<body>
    <h1>MCP Writing Database Operations</h1>

    <div id="status" class="status">
        Checking server status...
    </div>

    <h2>Database Operations</h2>
    <button onclick="checkHealth()">Check Health</button>
    <button onclick="queryCharacters()">List Characters</button>
    <button onclick="createBackup()">Create Backup</button>

    <div id="results">
        <h3>Results</h3>
        <pre id="output"></pre>
    </div>

    <script>
        const { ipcRenderer } = require('electron');

        async function checkHealth() {
            const output = document.getElementById('output');
            const status = document.getElementById('status');

            try {
                const response = await fetch('http://localhost:3010/health');
                const health = await response.json();

                output.textContent = JSON.stringify(health, null, 2);
                status.textContent = `Server Status: ${health.status}`;
                status.className = `status ${health.status === 'healthy' ? 'healthy' : 'unhealthy'}`;
            } catch (error) {
                output.textContent = `Error: ${error.message}`;
                status.textContent = 'Server Status: Unreachable';
                status.className = 'status unhealthy';
            }
        }

        async function queryCharacters() {
            const output = document.getElementById('output');
            try {
                const result = await ipcRenderer.invoke('mcp:query', {
                    server: 'database-admin',
                    tool: 'db_query_records',
                    params: {
                        table_name: 'characters',
                        limit: 10
                    }
                });
                output.textContent = JSON.stringify(result, null, 2);
            } catch (error) {
                output.textContent = `Error: ${error.message}`;
            }
        }

        async function createBackup() {
            const output = document.getElementById('output');
            try {
                const result = await ipcRenderer.invoke('mcp:query', {
                    server: 'database-admin',
                    tool: 'db_backup_full',
                    params: {}
                });
                output.textContent = JSON.stringify(result, null, 2);
            } catch (error) {
                output.textContent = `Error: ${error.message}`;
            }
        }

        // Check health on load
        checkHealth();
    </script>
</body>
</html>
```

---

## Claude Desktop Integration

### stdio Adapter Configuration

Claude Desktop uses stdio transport. Configure the adapter:

```bash
# In your MCP-Electron project
cd servers/mcp-writing

# Test stdio adapter
node mcp-stdio-adapter.js database-admin-server
```

### Claude Desktop Config

Add to Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "database-admin": {
      "command": "node",
      "args": [
        "/path/to/MCP-Electron/servers/mcp-writing/mcp-stdio-adapter.js",
        "database-admin-server"
      ],
      "env": {
        "DATABASE_URL": "postgresql://writer:password@localhost:5432/mcp_series",
        "NODE_ENV": "development"
      }
    },
    "book-planning": {
      "command": "node",
      "args": [
        "/path/to/MCP-Electron/servers/mcp-writing/src/stdio-server.js",
        "book-planning"
      ],
      "env": {
        "DATABASE_URL": "postgresql://writer:password@localhost:5432/mcp_series"
      }
    }
  }
}
```

### Verify Claude Desktop Integration

1. Restart Claude Desktop
2. Open a new conversation
3. Type: "List available tools"
4. You should see MCP Writing Servers tools listed

---

## Testing

### Unit Tests

```bash
cd servers/mcp-writing

# Run all tests
npm test

# Run specific test suite
npm test -- tests/database-admin-server/
```

### Integration Tests

```bash
# Test HTTP/SSE endpoints
curl http://localhost:3001/health
curl http://localhost:3010/health

# Test database operations
node -e "
const fetch = require('node-fetch');
fetch('http://localhost:3010/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list'
    })
}).then(r => r.json()).then(console.log);
"
```

### Electron Integration Test

```javascript
// test/integration.test.js
const { Application } = require('spectron');
const path = require('path');

describe('MCP Integration', () => {
    let app;

    beforeEach(async () => {
        app = new Application({
            path: '/path/to/Electron',
            args: [path.join(__dirname, '..')]
        });
        await app.start();
    });

    afterEach(async () => {
        if (app && app.isRunning()) {
            await app.stop();
        }
    });

    it('starts MCP servers', async () => {
        await app.client.waitUntilWindowLoaded();
        // Wait for servers to start
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Check health endpoint
        const response = await fetch('http://localhost:3010/health');
        expect(response.ok).toBe(true);
    });
});
```

---

## Troubleshooting

### Common Issues

#### 1. Servers Not Starting

```bash
# Check if ports are already in use
lsof -i :3001-3010

# Check logs
cd servers/mcp-writing
npm start 2>&1 | tee server.log
```

#### 2. Database Connection Errors

```bash
# Test database connection
psql -U writer -d mcp_series -c "SELECT 1;"

# Check DATABASE_URL in .env
cat servers/mcp-writing/.env | grep DATABASE_URL
```

#### 3. Electron Can't Communicate with Servers

```javascript
// Enable CORS in development
// In servers/mcp-writing/src/http-sse-server.js
app.use(cors({
    origin: '*',  // Be more restrictive in production
    credentials: true
}));
```

#### 4. Claude Desktop Not Detecting Servers

```bash
# Check Claude Desktop logs (macOS)
tail -f ~/Library/Logs/Claude/mcp*.log

# Verify config file
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### Debug Mode

Enable debug logging:

```javascript
// In main.js
const mcpServerProcess = spawn('node', ['src/http-sse-server.js'], {
    cwd: MCP_SERVERS_PATH,
    env: {
        ...process.env,
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug',
        LOG_FORMAT: 'text'
    },
    stdio: 'inherit'  // Show all logs in console
});
```

---

## Production Considerations

### Security

```javascript
// Restrict server access to localhost only
const allowedOrigins = ['http://localhost', 'app://electron'];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
```

### Packaging

Include MCP servers in Electron build:

```json
// package.json
{
  "build": {
    "files": [
      "dist/**/*",
      "servers/mcp-writing/**/*",
      "!servers/mcp-writing/node_modules/**/*"
    ],
    "extraResources": [
      {
        "from": "servers/mcp-writing/node_modules",
        "to": "servers/mcp-writing/node_modules"
      }
    ]
  }
}
```

### Resource Management

```javascript
// Monitor server health and restart if needed
function monitorServerHealth() {
    setInterval(async () => {
        try {
            const response = await fetch('http://localhost:3010/health', {
                timeout: 5000
            });
            if (!response.ok) {
                console.warn('Server unhealthy, restarting...');
                stopMCPServers();
                startMCPServers();
            }
        } catch (error) {
            console.error('Health check failed:', error);
            stopMCPServers();
            startMCPServers();
        }
    }, 60000); // Check every minute
}
```

---

## Next Steps

1. **Customize UI**: Build database operation forms for your specific needs
2. **Add Authentication**: Implement user authentication for production
3. **Enable SSL**: Use HTTPS for production deployments
4. **Add Notifications**: Show user notifications for database operations
5. **Implement Caching**: Cache frequently accessed data

---

## Resources

- [MCP Writing Servers Documentation](../README.md)
- [Electron Documentation](https://www.electronjs.org/docs)
- [Claude Desktop MCP Guide](https://docs.anthropic.com/claude/docs/model-context-protocol)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/RLRyals/MCP-Writing-Servers/issues
- Documentation: [docs/](../docs/)
