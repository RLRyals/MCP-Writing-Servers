# MCP Writing System - Connection Options

## Summary of Your Question

**Yes, your MCP servers CAN support both:**
- **HTTP/SSE** for TypingMind and web clients
- **STDIO** for Claude Desktop

However, your current Docker configuration needs adjustments to work properly with TypingMind.

## The Core Issue

The `@typingmind/mcp` connector in your Docker container is running, but it's **NOT automatically discovering or running your MCP servers**. The connector is a **bridge/proxy** that:

1. Exposes a REST API on port 50880
2. Waits for configuration from TypingMind
3. Spawns MCP servers as stdio subprocesses when configured
4. Bridges communication between TypingMind (HTTP) and servers (stdio)

**You need to configure each server in the TypingMind UI** - see `TYPINGMIND-CONFIGURATION.md` for details.

## Architecture Options

You have **two architectural choices** for TypingMind integration:

### Option 1: Use @typingmind/mcp Connector (Current Approach)

**How it works:**
```
TypingMind (Web) → HTTP → @typingmind/mcp connector → STDIO → MCP Servers
```

**Pros:**
- Standard TypingMind integration method
- Servers run in stdio mode (same as Claude Desktop)
- Single entry point for all servers

**Cons:**
- Requires manual configuration in TypingMind UI for each server
- Extra layer of indirection
- More complex troubleshooting

**Status:** ✅ **Working, but needs configuration**

**Setup:** See `TYPINGMIND-CONFIGURATION.md`

---

### Option 2: Direct SSE/HTTP Servers (Alternative)

**How it works:**
```
TypingMind (Web) → HTTP/SSE → MCP Servers (native HTTP mode)
```

**Pros:**
- No connector/proxy needed
- Direct communication
- Simpler architecture
- Each server has its own endpoint

**Cons:**
- Need to configure multiple server URLs in TypingMind
- Different mode than Claude Desktop (stdio)
- Requires fixing your `http-server.js` (has syntax errors)

**Status:** ⚠️ **Needs implementation fixes**

## Current Docker Container Behavior

When you run your Docker container, it:

1. ✅ Starts PostgreSQL
2. ✅ Waits for PostgreSQL to be ready
3. ✅ Discovers MCP server files (8 servers found)
4. ✅ Starts `@typingmind/mcp` connector on port 50880
5. ❌ **Does NOT start any MCP servers** (waiting for TypingMind config)

## Recommended Solution

### For Immediate Use: Option 1 (Connector Approach)

1. **Ensure your Docker container is running:**
   ```bash
   cd /home/user/MCP-Writing-Servers/docker
   docker-compose -f docker-compose.core.yml up -d
   ```

2. **Verify the connector is running:**
   ```bash
   docker logs mcp-writing-system
   # Should show: "Starting MCP Connector..."
   # Should show: "Discovered 8 MCP server(s)"
   ```

3. **Get your auth token:**
   ```bash
   grep MCP_AUTH_TOKEN /home/user/MCP-Writing-Servers/docker/.env
   ```

4. **Configure TypingMind:**
   - Open TypingMind settings
   - Go to Model Context Protocol settings
   - Add connector:
     - URL: `http://localhost:50880` (or your server's IP)
     - Auth Token: (from step 3)

5. **Add each MCP server:**
   - Use the configurations from `TYPINGMIND-CONFIGURATION.md`
   - Start with one server to test (e.g., book-planning)
   - Add others as needed

### For Long-term: Option 2 (Direct HTTP/SSE)

This would require:
1. Fixing the `src/http-server.js` file (syntax errors)
2. Creating individual HTTP server instances for each config-mcp server
3. Modifying the Dockerfile to run servers in HTTP mode instead of connector mode
4. Configuring each server URL in TypingMind

**This is more work but provides a cleaner architecture.**

## Environment Variable Settings

### For STDIO mode (Option 1 - with connector):
```bash
MCP_STDIO_MODE=true  # Set when starting each server via connector
```

### For HTTP/SSE mode (Option 2 - direct):
```bash
MCP_STDIO_MODE=false  # Or unset
```

Your Docker compose file currently sets `MCP_STDIO_MODE=false` at the container level, but this should be `true` when servers are spawned by the connector.

## Troubleshooting

### "Can't connect to TypingMind"

**Check 1: Is the connector running?**
```bash
docker ps | grep mcp-writing-system
# Should show container as "Up"
```

**Check 2: Is port 50880 accessible?**
```bash
curl http://localhost:50880
# Should return JSON (likely 404 or similar, not "connection refused")
```

**Check 3: Correct auth token?**
```bash
# On your Docker host:
export AUTH_TOKEN=$(grep MCP_AUTH_TOKEN docker/.env | cut -d= -f2)
curl -H "Authorization: Bearer $AUTH_TOKEN" http://localhost:50880/clients
# Should return JSON with list of clients (probably empty initially)
```

### "No tools showing in TypingMind"

**Likely cause:** Servers not configured yet

**Solution:** You must configure each server in TypingMind UI using the JSON from `TYPINGMIND-CONFIGURATION.md`

### "Server starts but immediately crashes"

**Check logs:**
```bash
docker logs mcp-writing-system -f
```

**Common issues:**
- Wrong database password in server config
- File path doesn't exist in container
- Missing dependencies

### "Database connection errors"

**Verify database is running:**
```bash
docker exec mcp-writing-db psql -U writer -d mcp_writing_db -c "SELECT 1"
```

**Check DATABASE_URL format:**
```
postgresql://writer:PASSWORD@mcp-writing-db:5432/mcp_writing_db
```
- Note: Use container name `mcp-writing-db`, not `localhost`
- Password must match POSTGRES_PASSWORD in .env

## Testing Your Setup

### Test 1: Connector Accessibility
```bash
curl http://localhost:50880
# Expected: 404 or method not allowed (not connection refused)
```

### Test 2: List Clients (no auth - should fail)
```bash
curl http://localhost:50880/clients
# Expected: 401 Unauthorized
```

### Test 3: List Clients (with auth)
```bash
curl -H "Authorization: Bearer your-token-here" http://localhost:50880/clients
# Expected: {"clients": []} or similar JSON
```

### Test 4: Database Connection
```bash
docker exec mcp-writing-system sh -c 'PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT version()"'
# Expected: PostgreSQL version info
```

## Next Steps

1. **Read** `TYPINGMIND-CONFIGURATION.md` for exact server configs
2. **Verify** your `.env` file has correct values (especially `MCP_AUTH_TOKEN` and `POSTGRES_PASSWORD`)
3. **Start** your Docker container
4. **Connect** TypingMind to the connector
5. **Configure** one server at a time
6. **Test** each server after adding it

## Claude Desktop Alternative

If you want to use Claude Desktop instead, you don't need the connector at all. You would configure Claude Desktop to use docker exec:

```json
{
  "mcpServers": {
    "book-planning": {
      "command": "docker",
      "args": [
        "exec",
        "-i",
        "mcp-writing-system",
        "node",
        "/app/src/config-mcps/book-planning-server/index.js"
      ],
      "env": {
        "MCP_STDIO_MODE": "true"
      }
    }
  }
}
```

This runs the server in stdio mode directly, without the connector.

## Questions?

If you're still having issues:
1. Share the Docker logs: `docker logs mcp-writing-system`
2. Share the TypingMind error message
3. Verify your `.env` file settings
4. Check network connectivity to port 50880
