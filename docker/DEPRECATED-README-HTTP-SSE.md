# MCP Writing System - HTTP/SSE Mode Quick Start

## TL;DR

**For TypingMind users: Use HTTP/SSE mode (this guide). It's simpler and works correctly.**

```bash
cd docker
docker-compose -f docker-compose.http-sse.yml up -d
```

Then in TypingMind, add servers using:
- `http://localhost:3000/book-planning`
- `http://localhost:3000/series-planning`
- etc.

Full guide: See `TYPINGMIND-HTTP-SSE-SETUP.md`

---

## Why HTTP/SSE Mode?

The connector mode (Option 1) was confusing because:

1. **TypingMind uses HTTP** → but connector spawns servers in **STDIO mode**
2. Requires complex JSON configuration in TypingMind UI
3. Extra proxy layer adds complexity
4. Harder to debug

**HTTP/SSE mode is better because:**

1. ✅ **TypingMind uses HTTP** → servers run in **HTTP mode** (no mismatch!)
2. ✅ Simple URL configuration
3. ✅ Direct connections (no proxy)
4. ✅ Easy to debug
5. ✅ Proper architecture for web/Docker deployments

---

## Files

- `docker-compose.http-sse.yml` - Docker Compose configuration for HTTP/SSE mode
- `Dockerfile.http-sse` - Dockerfile for HTTP/SSE mode
- `http-sse-entrypoint.sh` - Entrypoint script for HTTP/SSE mode
- `TYPINGMIND-HTTP-SSE-SETUP.md` - Complete setup guide with examples
- `src/http-sse-server.js` - HTTP/SSE server implementation

---

## Comparison

| Mode | Connector (Old/Broken) | HTTP/SSE (New/Fixed) |
|------|------------------------|----------------------|
| **For TypingMind** | ❌ Confusing | ✅ Perfect |
| **Setup** | Complex | Simple |
| **Config** | JSON per server | URL per server |
| **Transport** | HTTP→STDIO | HTTP/SSE |
| **Debugging** | Difficult | Easy |
| **Recommended** | No | **Yes** |

---

## Quick Commands

```bash
# Start HTTP/SSE mode
docker-compose -f docker-compose.http-sse.yml up -d

# View logs
docker logs mcp-writing-system -f

# Test health
curl http://localhost:3000/health

# List all servers
curl http://localhost:3000/

# Stop
docker-compose -f docker-compose.http-sse.yml down
```

---

## For Claude Desktop Users

If you want to use Claude Desktop, you still need STDIO mode:

```bash
docker-compose -f docker-compose.core.yml up -d
```

Then configure Claude Desktop to use `docker exec`:

```json
{
  "mcpServers": {
    "book-planning": {
      "command": "docker",
      "args": [
        "exec", "-i", "mcp-writing-system",
        "node", "/app/src/config-mcps/book-planning-server/index.js"
      ],
      "env": {
        "MCP_STDIO_MODE": "true"
      }
    }
  }
}
```

But for **TypingMind**, use **HTTP/SSE mode** (this guide).

---

## Documentation

- **Start here:** `TYPINGMIND-HTTP-SSE-SETUP.md` - Complete setup guide
- **Architecture:** `CONNECTION-OPTIONS.md` - Explains both modes
- **Modular deployment:** `README-MODULAR.md` - Different deployment options

---

## What Changed?

**Problem:** The old connector approach (`@typingmind/mcp`) was confusing because TypingMind is a web client that uses HTTP, but the connector was spawning MCP servers in STDIO mode. This created a mismatch and didn't make sense for a Docker deployment.

**Solution:** We created a proper HTTP/SSE server that runs all MCP servers in HTTP mode, providing direct SSE endpoints for TypingMind to connect to. This is the correct architecture for web clients.

---

## Summary

- **TypingMind?** → Use HTTP/SSE mode (this guide)
- **Claude Desktop?** → Use STDIO mode (docker exec)
- **Both?** → Run HTTP/SSE mode, configure Claude Desktop separately

Read `TYPINGMIND-HTTP-SSE-SETUP.md` for complete instructions.
