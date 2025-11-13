# TypingMind Setup Guide - URL-Based Configuration

## Overview

This is the **correct and recommended** setup for using MCP servers with TypingMind.

**Architecture:**
```
TypingMind (Web) → @typingmind/mcp Connector → HTTP/SSE Server → MCP Servers
                   Port 50880 (HTTP API)        Port 3000 (SSE)
```

**Key Points:**
- ✅ TypingMind connects to the connector at `localhost:50880`
- ✅ Connector uses HTTP/SSE to communicate with MCP servers (NOT stdio)
- ✅ Each MCP server has an SSE endpoint at `localhost:3001/<server-name>`
- ✅ Configure servers in TypingMind with **URLs** (not commands)

---

## Quick Start

### Step 1: Start Docker

```bash
cd /home/user/MCP-Writing-Servers/docker

# Ensure .env has MCP_AUTH_TOKEN and POSTGRES_PASSWORD set
nano .env

# Start the services
docker-compose -f docker-compose.connector-http-sse.yml up -d

# Watch the logs
docker logs mcp-writing-system -f
```

**Expected output:**
```
🚀 Starting HTTP/SSE Server...
   Port: 3000
✅ HTTP/SSE Server started

🚀 Starting MCP Connector...
   Port: 50880
   Auth Token: abc12345****
   HTTP/SSE Backend: http://localhost:3001

ℹ️  Configure servers in TypingMind UI with URLs like:
   http://localhost:3001/book-planning
   http://localhost:3001/series-planning
```

---

### Step 2: Connect TypingMind to Connector

In TypingMind:

1. Go to **Settings** → **Advanced Settings** → **Model Context Protocol**
2. Add connector:
   - **Connector URL:** `http://localhost:50880`
   - **Auth Token:** Your `MCP_AUTH_TOKEN` from `.env` file

**Get your auth token:**
```bash
grep MCP_AUTH_TOKEN docker/.env
```

---

### Step 3: Configure MCP Servers in TypingMind (URL-Based)

After connecting to the connector, configure each MCP server using **URL format**.

#### Important Notes

- **Use URLs, not commands!** This is HTTP/SSE mode, not stdio mode
- **URLs are internal to Docker:** Use `http://localhost:3001/<server-name>`
- **No DATABASE_URL needed** - servers inherit connection from Docker environment
- **No MCP_STDIO_MODE** - servers run in HTTP/SSE mode automatically

---

## MCP Server Configurations

Copy these configurations into TypingMind's MCP server settings:

### Individual Server Configurations

#### Book Planning Server
```json
{
  "book-planning": {
    "url": "http://localhost:3001/book-planning"
  }
}
```

#### Series Planning Server
```json
{
  "series-planning": {
    "url": "http://localhost:3001/series-planning"
  }
}
```

#### Chapter Planning Server
```json
{
  "chapter-planning": {
    "url": "http://localhost:3001/chapter-planning"
  }
}
```

#### Character Planning Server
```json
{
  "character-planning": {
    "url": "http://localhost:3001/character-planning"
  }
}
```

#### Scene Server
```json
{
  "scene": {
    "url": "http://localhost:3001/scene"
  }
}
```

#### Core Continuity Server
```json
{
  "core-continuity": {
    "url": "http://localhost:3001/core-continuity"
  }
}
```

#### Review Server
```json
{
  "review": {
    "url": "http://localhost:3001/review"
  }
}
```

#### Reporting Server
```json
{
  "reporting": {
    "url": "http://localhost:3001/reporting"
  }
}
```

---

### All-in-One Configuration

If TypingMind allows pasting all servers at once:

```json
{
  "mcpServers": {
    "book-planning": {
      "url": "http://localhost:3001/book-planning"
    },
    "series-planning": {
      "url": "http://localhost:3001/series-planning"
    },
    "chapter-planning": {
      "url": "http://localhost:3001/chapter-planning"
    },
    "character-planning": {
      "url": "http://localhost:3001/character-planning"
    },
    "scene": {
      "url": "http://localhost:3001/scene"
    },
    "core-continuity": {
      "url": "http://localhost:3001/core-continuity"
    },
    "review": {
      "url": "http://localhost:3001/review"
    },
    "reporting": {
      "url": "http://localhost:3001/reporting"
    }
  }
}
```

---

## Testing Your Setup

### Test 1: Verify HTTP/SSE Server is Running

From your host machine:

```bash
# Test the HTTP/SSE server directly (inside Docker)
docker exec mcp-writing-system curl http://localhost:3001/health

# Should return:
# {"status":"healthy","serverCount":8,"timestamp":"..."}
```

### Test 2: List All Available Servers

```bash
docker exec mcp-writing-system curl http://localhost:3001/

# Returns JSON with all available servers and their endpoints
```

### Test 3: Check a Specific Server's Tools

```bash
docker exec mcp-writing-system curl http://localhost:3001/book-planning/info

# Returns:
# {
#   "server": "book-planning",
#   "version": "1.0.0",
#   "tools": [...]
# }
```

### Test 4: Verify Connector is Accessible

From your host machine:

```bash
curl http://localhost:50880/health

# Or with auth:
TOKEN=$(grep MCP_AUTH_TOKEN docker/.env | cut -d= -f2)
curl -H "Authorization: Bearer $TOKEN" http://localhost:50880/clients
```

### Test 5: Test SSE Connection

```bash
# Test SSE endpoint (will stream events)
docker exec mcp-writing-system curl -N http://localhost:3001/book-planning
```

---

## Architecture Explanation

### Why This Setup?

**TypingMind supports two configuration types:**

1. **Command-based (stdio):** For spawning local processes
   ```json
   {
     "server": {
       "command": "npx",
       "args": ["-y", "package-name"]
     }
   }
   ```

2. **URL-based (HTTP/SSE):** For connecting to remote endpoints ← **We use this!**
   ```json
   {
     "server": {
       "url": "http://example.com/mcp-endpoint"
     }
   }
   ```

**For Docker deployments, URL-based is better because:**
- ✅ Servers run as persistent services (not spawned on demand)
- ✅ Better resource management
- ✅ Easier to monitor and debug
- ✅ Proper architecture for containerized services

### Component Breakdown

1. **HTTP/SSE Server (Port 3000):**
   - Runs all 8 MCP servers
   - Provides SSE endpoints: `/book-planning`, `/series-planning`, etc.
   - Internal to Docker (not exposed to host)
   - Handles actual MCP protocol via SSE

2. **Connector (Port 50880):**
   - Bridges TypingMind to HTTP/SSE endpoints
   - Handles authentication
   - Exposes HTTP API for TypingMind
   - Forwards requests to HTTP/SSE server

3. **TypingMind:**
   - Connects to connector at `localhost:50880`
   - Sends server configurations (with URLs)
   - Makes tool calls via connector's API

### Data Flow

```
User → TypingMind UI → Connector (50880) → HTTP/SSE Server (3000) → MCP Server → Database
     ← Tool Result  ← Connector        ← SSE Response       ← Query Result ←
```

---

## Troubleshooting

### "Cannot connect to connector"

**Check container is running:**
```bash
docker ps | grep mcp-writing-system
# Should show container as "Up"
```

**Check logs:**
```bash
docker logs mcp-writing-system -f
```

**Verify port is accessible:**
```bash
curl http://localhost:50880/health
# Should NOT say "connection refused"
```

---

### "Server not found" or "No tools available"

**Verify HTTP/SSE server is running:**
```bash
docker exec mcp-writing-system curl http://localhost:3001/
# Should list all 8 servers
```

**Check specific server:**
```bash
docker exec mcp-writing-system curl http://localhost:3001/book-planning/info
# Should show server info and tools
```

**Check logs for errors:**
```bash
docker logs mcp-writing-system | grep -i error
```

---

### "Database connection error"

**Verify database is running:**
```bash
docker ps | grep mcp-writing-db
docker exec mcp-writing-db psql -U writer -d mcp_writing_db -c "SELECT 1"
```

**Check environment variables:**
```bash
docker exec mcp-writing-system env | grep -E "(DATABASE|POSTGRES)"
```

---

### "Auth token invalid"

**Verify token matches:**
```bash
# In .env file
grep MCP_AUTH_TOKEN docker/.env

# Test with token
TOKEN=$(grep MCP_AUTH_TOKEN docker/.env | cut -d= -f2)
curl -H "Authorization: Bearer $TOKEN" http://localhost:50880/clients
```

---

## Remote Access

### For Remote TypingMind

If TypingMind is on a different machine:

**Option 1: SSH Tunnel (Secure)**
```bash
ssh -L 50880:localhost:50880 user@your-server
```

Then use `http://localhost:50880` in TypingMind

**Option 2: Direct Access**

1. Ensure port 50880 is open in firewall
2. Use `http://your-server-ip:50880` in TypingMind
3. Update URLs in server configs to use internal Docker networking

**Note:** The HTTP/SSE server (port 3000) is internal and doesn't need to be exposed.

---

## Environment Variables

Required in `.env`:

```bash
# Required
POSTGRES_PASSWORD=your_secure_password_here
MCP_AUTH_TOKEN=generate-with-openssl-rand-hex-32

# Optional (with defaults shown)
HTTP_SSE_PORT=3000
MCP_CONNECTOR_PORT=50880
POSTGRES_HOST=mcp-writing-db
POSTGRES_PORT=5432
POSTGRES_DB=mcp_writing_db
POSTGRES_USER=writer
NODE_ENV=production
```

**Generate secure auth token:**
```bash
openssl rand -hex 32
```

---

## Comparison: URL-based vs Command-based

| Feature | URL-based (This Guide) | Command-based |
|---------|------------------------|---------------|
| **Transport** | HTTP/SSE | STDIO |
| **Server lifecycle** | Persistent (always running) | On-demand (spawned per request) |
| **Configuration** | URLs only | Commands + args + env |
| **Docker-friendly** | ✅ Yes | ⚠️ Complicated |
| **Resource usage** | Efficient | Higher overhead |
| **Debugging** | Easy (check endpoints) | Difficult (process management) |
| **Recommended** | ✅ **Yes** | For local development |

---

## Summary

1. ✅ Start Docker: `docker-compose -f docker-compose.connector-http-sse.yml up -d`
2. ✅ Connect TypingMind to connector: `http://localhost:50880` with your auth token
3. ✅ Configure servers in TypingMind with **URLs**: `http://localhost:3001/<server-name>`
4. ✅ Start using your MCP writing tools!

---

## Additional Resources

- **Connector repo:** https://github.com/TypingMind/typingmind-mcp
- **MCP Protocol:** https://modelcontextprotocol.io
- **TypingMind MCP docs:** https://docs.typingmind.com/model-context-protocol-(mcp)-in-typingmind

---

## Support

If you encounter issues:

1. Check Docker logs: `docker logs mcp-writing-system -f`
2. Check database: `docker logs mcp-writing-db`
3. Test HTTP/SSE endpoints: `docker exec mcp-writing-system curl http://localhost:3001/`
4. Test connector: `curl http://localhost:50880/health`
5. Verify environment variables in `.env`

For questions, refer to the TypingMind MCP documentation or the connector GitHub repo.
