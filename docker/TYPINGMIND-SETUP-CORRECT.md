# TypingMind Setup with @typingmind/mcp Connector (CORRECT METHOD)

## Overview

TypingMind requires the **@typingmind/mcp connector** to bridge HTTP/SSE (web) to STDIO (MCP servers). This is the official and correct way to use MCP servers with TypingMind.

**Architecture:**
```
TypingMind (Web) → @typingmind/mcp Connector (HTTP/SSE) → MCP Servers (STDIO)
                   Port 50880 (HTTP API)
```

## Quick Start

### Step 1: Start the Docker Container

```bash
cd /home/user/MCP-Writing-Servers/docker

# Ensure your .env has these set:
# - POSTGRES_PASSWORD
# - MCP_AUTH_TOKEN (generate with: openssl rand -hex 32)

# Start the services
docker-compose -f docker-compose.core.yml up -d

# Watch the logs
docker logs mcp-writing-system -f
```

You should see:
```
🚀 Starting MCP Connector...
   Port: 50880
   Auth Token: abc12345****
   Database: mcp_writing_db @ mcp-writing-db
```

### Step 2: Get Your Connection Info

```bash
# Get your auth token
grep MCP_AUTH_TOKEN docker/.env

# Example: MCP_AUTH_TOKEN=your-secure-random-token-change-this
```

### Step 3: Connect TypingMind to the Connector

In TypingMind:

1. Go to **Settings** → **Advanced Settings** → **Model Context Protocol**
2. Add connector:
   - **Connector URL:** `http://localhost:50880` (or `http://your-server-ip:50880`)
   - **Auth Token:** Your `MCP_AUTH_TOKEN` value from .env

### Step 4: Configure Each MCP Server in TypingMind

After connecting to the connector, you need to configure each server individually in TypingMind's UI.

## MCP Server Configurations for TypingMind

Copy these configurations into TypingMind's MCP server settings. Each server must be added individually.

### Important Notes

- **Paths are inside the Docker container** (`/app/src/...`)
- **MCP_STDIO_MODE must be "true"** (servers run in stdio when spawned by connector)
- **DATABASE_URL must use container name** (`mcp-writing-db`, not `localhost`)
- Replace `your_secure_password2025` with your actual POSTGRES_PASSWORD

---

### Book Planning Server

```json
{
  "book-planning": {
    "command": "node",
    "args": ["/app/src/config-mcps/book-planning-server/index.js"],
    "env": {
      "MCP_STDIO_MODE": "true",
      "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
      "NODE_ENV": "production"
    }
  }
}
```

---

### Series Planning Server

```json
{
  "series-planning": {
    "command": "node",
    "args": ["/app/src/config-mcps/series-planning-server/index.js"],
    "env": {
      "MCP_STDIO_MODE": "true",
      "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
      "NODE_ENV": "production"
    }
  }
}
```

---

### Chapter Planning Server

```json
{
  "chapter-planning": {
    "command": "node",
    "args": ["/app/src/config-mcps/chapter-planning-server/index.js"],
    "env": {
      "MCP_STDIO_MODE": "true",
      "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
      "NODE_ENV": "production"
    }
  }
}
```

---

### Character Planning Server

```json
{
  "character-planning": {
    "command": "node",
    "args": ["/app/src/config-mcps/character-planning-server/index.js"],
    "env": {
      "MCP_STDIO_MODE": "true",
      "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
      "NODE_ENV": "production"
    }
  }
}
```

---

### Scene Server

```json
{
  "scene": {
    "command": "node",
    "args": ["/app/src/config-mcps/scene-server/index.js"],
    "env": {
      "MCP_STDIO_MODE": "true",
      "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
      "NODE_ENV": "production"
    }
  }
}
```

---

### Core Continuity Server

```json
{
  "core-continuity": {
    "command": "node",
    "args": ["/app/src/config-mcps/core-continuity-server/index.js"],
    "env": {
      "MCP_STDIO_MODE": "true",
      "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
      "NODE_ENV": "production"
    }
  }
}
```

---

### Review Server

```json
{
  "review": {
    "command": "node",
    "args": ["/app/src/config-mcps/review-server/index.js"],
    "env": {
      "MCP_STDIO_MODE": "true",
      "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
      "NODE_ENV": "production"
    }
  }
}
```

---

### Reporting Server

```json
{
  "reporting": {
    "command": "node",
    "args": ["/app/src/config-mcps/reporting-server/index.js"],
    "env": {
      "MCP_STDIO_MODE": "true",
      "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
      "NODE_ENV": "production"
    }
  }
}
```

---

## All-in-One Configuration (If TypingMind Supports It)

Some versions of TypingMind may let you paste all servers at once:

```json
{
  "mcpServers": {
    "book-planning": {
      "command": "node",
      "args": ["/app/src/config-mcps/book-planning-server/index.js"],
      "env": {
        "MCP_STDIO_MODE": "true",
        "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
        "NODE_ENV": "production"
      }
    },
    "series-planning": {
      "command": "node",
      "args": ["/app/src/config-mcps/series-planning-server/index.js"],
      "env": {
        "MCP_STDIO_MODE": "true",
        "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
        "NODE_ENV": "production"
      }
    },
    "chapter-planning": {
      "command": "node",
      "args": ["/app/src/config-mcps/chapter-planning-server/index.js"],
      "env": {
        "MCP_STDIO_MODE": "true",
        "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
        "NODE_ENV": "production"
      }
    },
    "character-planning": {
      "command": "node",
      "args": ["/app/src/config-mcps/character-planning-server/index.js"],
      "env": {
        "MCP_STDIO_MODE": "true",
        "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
        "NODE_ENV": "production"
      }
    },
    "scene": {
      "command": "node",
      "args": ["/app/src/config-mcps/scene-server/index.js"],
      "env": {
        "MCP_STDIO_MODE": "true",
        "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
        "NODE_ENV": "production"
      }
    },
    "core-continuity": {
      "command": "node",
      "args": ["/app/src/config-mcps/core-continuity-server/index.js"],
      "env": {
        "MCP_STDIO_MODE": "true",
        "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
        "NODE_ENV": "production"
      }
    },
    "review": {
      "command": "node",
      "args": ["/app/src/config-mcps/review-server/index.js"],
      "env": {
        "MCP_STDIO_MODE": "true",
        "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
        "NODE_ENV": "production"
      }
    },
    "reporting": {
      "command": "node",
      "args": ["/app/src/config-mcps/reporting-server/index.js"],
      "env": {
        "MCP_STDIO_MODE": "true",
        "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
        "NODE_ENV": "production"
      }
    }
  }
}
```

## Why MCP_STDIO_MODE="true"?

This seems confusing since TypingMind uses HTTP, but here's why it's correct:

1. **TypingMind** connects to the **connector** via HTTP/SSE (port 50880)
2. The **connector** spawns your **MCP servers** as child processes
3. The **connector** talks to those child processes via **STDIO** (stdin/stdout)
4. The connector bridges HTTP/SSE ↔ STDIO automatically

So:
- TypingMind → Connector: **HTTP/SSE**
- Connector → MCP Servers: **STDIO** ✓ (hence `MCP_STDIO_MODE="true"`)

## Testing Your Setup

### Test 1: Verify Connector is Running

```bash
curl http://localhost:50880
```

Expected: Some response (not "connection refused")

### Test 2: Check Connector with Auth

```bash
# Get your token
TOKEN=$(grep MCP_AUTH_TOKEN docker/.env | cut -d= -f2)

# Test endpoint
curl -H "Authorization: Bearer $TOKEN" http://localhost:50880/clients
```

Expected: JSON response with list of connected clients (likely empty until configured in TypingMind)

### Test 3: Check Docker Logs

```bash
docker logs mcp-writing-system -f
```

Look for:
- "MCP Connector Starting"
- "PostgreSQL is ready"
- "Discovered X MCP server(s)"
- "Starting MCP Connector..."

## Troubleshooting

### "Cannot connect to connector"

**Check container is running:**
```bash
docker ps | grep mcp-writing-system
```

**Check port is accessible:**
```bash
curl http://localhost:50880
# Should NOT say "connection refused"
```

**Check logs:**
```bash
docker logs mcp-writing-system
```

---

### "Auth token invalid"

**Verify token matches:**
```bash
# In .env file
grep MCP_AUTH_TOKEN docker/.env

# Should match what you entered in TypingMind
```

---

### "Server fails to start"

**Check Docker logs when you configure a server in TypingMind:**
```bash
docker logs mcp-writing-system -f
```

**Common issues:**
- Wrong DATABASE_URL password
- Wrong file path (must be `/app/src/...` inside container)
- Missing environment variables

**Test the path exists:**
```bash
docker exec mcp-writing-system ls /app/src/config-mcps/book-planning-server/index.js
```

---

### "Database connection error"

**Check database is running:**
```bash
docker exec mcp-writing-db psql -U writer -d mcp_writing_db -c "SELECT 1"
```

**Verify DATABASE_URL:**
- Must use container name: `mcp-writing-db` (NOT `localhost`)
- Must use correct password from .env
- Format: `postgresql://writer:PASSWORD@mcp-writing-db:5432/mcp_writing_db`

---

## Remote Access

### For Remote TypingMind

If accessing from a different machine:

**Option 1: SSH Tunnel (Secure)**
```bash
ssh -L 50880:localhost:50880 user@your-server
```

Then use `http://localhost:50880` in TypingMind

**Option 2: Direct Access**

Use `http://your-server-ip:50880` in TypingMind

Make sure:
- Port 50880 is open in firewall
- Docker is binding to 0.0.0.0 (default)

## Environment Variables

Required in `.env`:

```bash
# Database
POSTGRES_PASSWORD=your_secure_password_here

# Connector
MCP_AUTH_TOKEN=generate-with-openssl-rand-hex-32

# Optional (with defaults)
MCP_CONNECTOR_PORT=50880
POSTGRES_HOST=mcp-writing-db
POSTGRES_PORT=5432
POSTGRES_DB=mcp_writing_db
POSTGRES_USER=writer
```

## Summary

1. ✅ Start Docker: `docker-compose -f docker-compose.core.yml up -d`
2. ✅ Connect TypingMind to connector at `http://localhost:50880` with your auth token
3. ✅ Configure each MCP server in TypingMind UI using the JSON configs above
4. ✅ Start using your MCP writing tools!

## Reference

- Official connector: https://github.com/TypingMind/typingmind-mcp
- Connector NPM package: https://www.npmjs.com/package/@typingmind/mcp

## Why Not Direct HTTP/SSE?

TypingMind requires the connector because:
- It manages multiple MCP server processes
- It handles authentication
- It provides a standardized HTTP API
- It bridges HTTP/SSE ↔ STDIO protocols
- It's the official supported method

Direct HTTP/SSE endpoints without the connector won't work with TypingMind.
