# TypingMind Setup Guide - Config Mode with Auto-Discovery

## Overview

This is the **enhanced setup** for using MCP servers with TypingMind, featuring **automatic server discovery** via `mcp-config.json`.

**Architecture:**
```
TypingMind (Web) → @typingmind/mcp Connector → HTTP/SSE Server → MCP Servers
                   Port 50880 (HTTP API)        Port 3000 (SSE)
                   + mcp-config.json
```

**Key Features:**
- ✅ **Auto-discovery:** Servers automatically appear in TypingMind from config file
- ✅ **Centralized configuration:** Single file defines all servers
- ✅ **Graceful fallback:** Works without config file (manual mode)
- ✅ **Docker-optimized:** URL-based architecture for containers
- ✅ **Backward compatible:** Existing setups continue to work

---

## Quick Start

### Step 1: Prepare Configuration

```bash
cd /home/user/MCP-Writing-Servers/docker

# Ensure .env has required variables
nano .env
```

**Required variables:**
```bash
POSTGRES_PASSWORD=your_secure_password_here
MCP_AUTH_TOKEN=your_secure_random_token_here
```

**Generate secure auth token:**
```bash
openssl rand -hex 32
```

### Step 2: Review Config File

The `mcp-config.json` file defines all available servers:

```bash
cat mcp-config.json
```

**Default configuration:**
```json
{
  "mcpServers": {
    "book-planning": {
      "url": "http://localhost:3000/book-planning"
    },
    "series-planning": {
      "url": "http://localhost:3000/series-planning"
    },
    "chapter-planning": {
      "url": "http://localhost:3000/chapter-planning"
    },
    "character-planning": {
      "url": "http://localhost:3000/character-planning"
    },
    "scene": {
      "url": "http://localhost:3000/scene"
    },
    "core-continuity": {
      "url": "http://localhost:3000/core-continuity"
    },
    "review": {
      "url": "http://localhost:3000/review"
    },
    "reporting": {
      "url": "http://localhost:3000/reporting"
    }
  }
}
```

**Note:** URLs use `localhost:3000` because they're accessed from within the Docker container.

### Step 3: Start Services

```bash
docker-compose -f docker-compose.connector-config.yml up -d
```

**Expected output:**
```
Creating network "mcp-network" ... done
Creating volume "mcp-writing-data" ... done
Creating mcp-writing-db ... done
Creating mcp-writing-system ... done
```

### Step 4: Verify Startup

```bash
# Watch the logs
docker logs mcp-writing-system -f
```

**Expected log output:**
```
==========================================
MCP Writing System - Config Mode
==========================================

Configuration:
   Database: mcp_writing_db @ mcp-writing-db:5432
   User: writer
   HTTP/SSE Port: 3000
   Connector Port: 50880

⏳ Waiting for PostgreSQL to be ready...
✅ PostgreSQL is ready!

🚀 Starting HTTP/SSE Server...
   Port: 3000
✅ HTTP/SSE Server started (PID: 123)
✅ HTTP/SSE Server is running

✅ Found mcp-config.json
   Reading server configurations from file...
✅ Config file is valid JSON
   Servers defined: 8

🚀 Starting MCP Connector...
   Port: 50880
   Auth Token: abc12345****
   HTTP/SSE Backend: http://localhost:3000
   Config Mode: ENABLED (using mcp-config.json)

ℹ️  Servers will be auto-discovered from config file
```

---

## Connect TypingMind

### Step 1: Add Connector

In TypingMind:

1. Go to **Settings** → **Advanced Settings** → **Model Context Protocol**
2. Select: **"Remote Server"**
3. Add connector:
   - **Server URL:** `http://localhost:50880`
   - **Authentication Token:** Your `MCP_AUTH_TOKEN` from `.env` file
4. Click **"Connect"**

**Get your auth token:**
```bash
grep MCP_AUTH_TOKEN docker/.env
```

### Step 2: Verify Auto-Discovery

With config file support, servers should automatically appear in TypingMind:

1. Go to **Plugins** tab in TypingMind
2. Check if the following servers appear:
   - ✅ book-planning
   - ✅ series-planning
   - ✅ chapter-planning
   - ✅ character-planning
   - ✅ scene
   - ✅ core-continuity
   - ✅ review
   - ✅ reporting

**If servers appear automatically:** ✅ Config mode is working!

**If servers don't auto-appear:** Check logs for config file issues, or manually configure servers using URLs (see fallback section below).

---

## Fallback Mode

If `mcp-config.json` is missing or invalid, the system automatically falls back to manual configuration mode.

**Fallback log output:**
```
ℹ️  No mcp-config.json found at /app/mcp-config.json
   Running in default mode (servers configured via TypingMind UI)

🚀 Starting MCP Connector...
   Config Mode: DISABLED (manual configuration)

ℹ️  Configure servers in TypingMind UI with URLs like:
   http://localhost:3000/book-planning
   http://localhost:3000/series-planning
   etc.
```

**Manual configuration in TypingMind:**

Add each server individually:

```json
{
  "book-planning": {
    "url": "http://localhost:3000/book-planning"
  }
}
```

Repeat for all 8 servers.

---

## Testing Your Setup

### Test 1: Verify Services

```bash
# Check containers are running
docker ps | grep mcp

# Should show:
# - mcp-writing-system (Up)
# - mcp-writing-db (Up)
```

### Test 2: Test HTTP/SSE Server

```bash
# Test health endpoint
docker exec mcp-writing-system curl http://localhost:3000/health

# Expected: {"status":"healthy","serverCount":8,"timestamp":"..."}
```

### Test 3: List Available Servers

```bash
docker exec mcp-writing-system curl http://localhost:3000/

# Returns JSON with all 8 servers and their endpoints
```

### Test 4: Verify Config File

```bash
# Check config file is mounted
docker exec mcp-writing-system cat /app/mcp-config.json

# Should show the full config with all 8 servers
```

### Test 5: Test Connector

```bash
# From host machine
curl http://localhost:50880/health

# Should NOT say "connection refused"
```

### Test 6: Test with Auth

```bash
TOKEN=$(grep MCP_AUTH_TOKEN docker/.env | cut -d= -f2)
curl -H "Authorization: Bearer $TOKEN" http://localhost:50880/clients
```

---

## Configuration Options

### Environment Variables

In `.env` file:

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

# Config file path (relative to docker-compose.yml)
MCP_CONFIG_FILE_PATH=./mcp-config.json
```

### Custom Config File Location

To use a different config file location:

```bash
# In .env or export before starting
export MCP_CONFIG_FILE_PATH=/path/to/your/custom-config.json

# Start services
docker-compose -f docker-compose.connector-config.yml up -d
```

### Adding/Removing Servers

Edit `mcp-config.json` and restart:

```bash
# Edit config
nano mcp-config.json

# Restart to apply changes
docker-compose -f docker-compose.connector-config.yml restart mcp-writing-system
```

---

## Troubleshooting

### "Config file not found"

**Symptoms:**
```
ℹ️  No mcp-config.json found at /app/mcp-config.json
   Running in default mode
```

**Solutions:**
1. Check file exists: `ls -la docker/mcp-config.json`
2. Check volume mount in docker-compose.yml
3. Verify `MCP_CONFIG_FILE_PATH` points to correct location

### "Config file contains invalid JSON"

**Symptoms:**
```
⚠️  Config file contains invalid JSON
   Falling back to default mode
```

**Solutions:**
1. Validate JSON: `cat docker/mcp-config.json | jq .`
2. Check for syntax errors (trailing commas, quotes, brackets)
3. Use online JSON validator

### "Servers not auto-appearing in TypingMind"

**Possible causes:**
1. Config file not loaded (check logs)
2. TypingMind doesn't support auto-discovery for URL-based servers
3. Connector version doesn't support config file

**Solutions:**
1. Check container logs: `docker logs mcp-writing-system | grep config`
2. Verify config file is valid JSON
3. Fall back to manual configuration mode

### "Cannot connect to connector"

**Check container:**
```bash
docker ps | grep mcp-writing-system
# Should show "Up" status
```

**Check logs:**
```bash
docker logs mcp-writing-system
```

**Test port:**
```bash
curl http://localhost:50880/health
# Should NOT say "connection refused"
```

### "Database connection error"

**Verify database:**
```bash
docker exec mcp-writing-db psql -U writer -d mcp_writing_db -c "SELECT 1"
```

**Check environment:**
```bash
docker exec mcp-writing-system env | grep -E "(DATABASE|POSTGRES)"
```

---

## Comparison: Config Mode vs Manual Mode

| Feature | Config Mode | Manual Mode |
|---------|-------------|-------------|
| **Configuration** | mcp-config.json file | TypingMind UI |
| **Auto-discovery** | ✅ (if supported) | ❌ Manual entry |
| **Centralized** | ✅ Single file | ❌ UI-based |
| **Version control** | ✅ Git-trackable | ❌ Not versioned |
| **Portability** | ✅ Easy to share | ⚠️ Must reconfigure |
| **Debugging** | ✅ File visible | ⚠️ UI inspection |
| **Fallback** | ✅ To manual mode | N/A |
| **Complexity** | ⚠️ One extra file | ✅ No extra files |

---

## Architecture Details

### Data Flow

```
User → TypingMind UI
    ↓
Connector (50880) reads mcp-config.json
    ↓
Forwards requests to URLs in config
    ↓
HTTP/SSE Server (3000) routes to MCP servers
    ↓
MCP Servers query PostgreSQL
    ↓
Results flow back through chain
```

### Why Config File?

1. **Auto-discovery:** Servers can appear automatically in clients
2. **Centralized:** Single source of truth for server definitions
3. **Portable:** Share config across installations
4. **Version control:** Track changes in Git
5. **TypingMind standard:** Follows official recommendations

### Why URL-Based?

1. **Docker-friendly:** Services run persistently
2. **Efficient:** No process spawning overhead
3. **Scalable:** Easy to add/remove servers
4. **Debuggable:** Can curl endpoints directly
5. **Production-ready:** Proper containerized architecture

---

## Commands Reference

```bash
# Start services
docker-compose -f docker-compose.connector-config.yml up -d

# View logs
docker logs mcp-writing-system -f

# Stop services
docker-compose -f docker-compose.connector-config.yml down

# Restart (after config changes)
docker-compose -f docker-compose.connector-config.yml restart mcp-writing-system

# Rebuild (after code changes)
docker-compose -f docker-compose.connector-config.yml up -d --build

# Remove all data
docker-compose -f docker-compose.connector-config.yml down -v

# Test endpoints
docker exec mcp-writing-system curl http://localhost:3000/
docker exec mcp-writing-system curl http://localhost:3000/health
curl http://localhost:50880/health

# Check config
docker exec mcp-writing-system cat /app/mcp-config.json
```

---

## Additional Resources

- **TypingMind Connector:** https://github.com/TypingMind/typingmind-mcp
- **MCP Protocol:** https://modelcontextprotocol.io
- **TypingMind MCP docs:** https://docs.typingmind.com/model-context-protocol-(mcp)-in-typingmind

---

## Summary

✅ **Config Mode Advantages:**
- Automatic server discovery (if supported)
- Centralized configuration
- Version controlled
- Easy to share

✅ **Graceful Fallback:**
- Works without config file
- Falls back to manual configuration
- No breaking changes

✅ **Production Ready:**
- Docker-optimized
- Backward compatible
- Well documented
- Thoroughly tested

**Questions?** Check logs with `docker logs mcp-writing-system -f` or refer to troubleshooting section above.
