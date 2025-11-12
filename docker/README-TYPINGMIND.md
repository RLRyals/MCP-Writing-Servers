# TypingMind Setup - CORRECTED DOCUMENTATION

## Important Correction

**Earlier documentation about "direct HTTP/SSE" was INCORRECT.**

TypingMind **requires** the `@typingmind/mcp` connector. You cannot make direct HTTP/SSE connections from TypingMind to MCP servers.

## The Correct Approach

**Use the connector approach:**

```
TypingMind (Web/HTTP) → @typingmind/mcp Connector (HTTP/SSE API) → MCP Servers (STDIO)
                        Port 50880
```

See: **`TYPINGMIND-SETUP-CORRECT.md`** for complete instructions.

## Quick Start

```bash
# 1. Start Docker with connector
cd docker
docker-compose -f docker-compose.core.yml up -d

# 2. In TypingMind, connect to:
#    URL: http://localhost:50880
#    Auth Token: (from your .env MCP_AUTH_TOKEN)

# 3. Configure each MCP server in TypingMind UI
#    See TYPINGMIND-SETUP-CORRECT.md for JSON configs
```

## Why the Connector is Required

The `@typingmind/mcp` connector:
- ✅ Manages multiple MCP server processes
- ✅ Handles authentication
- ✅ Provides standardized HTTP API for TypingMind
- ✅ Bridges HTTP/SSE (web) ↔ STDIO (MCP servers)
- ✅ Is the official supported method

## Why MCP_STDIO_MODE="true" is Correct

Even though TypingMind is HTTP-based, the servers run in STDIO mode because:

1. TypingMind → Connector: **HTTP/SSE**
2. Connector → Servers: **STDIO** ← This is why `MCP_STDIO_MODE="true"`

The connector handles the protocol bridge automatically.

## Complete Documentation

See **`TYPINGMIND-SETUP-CORRECT.md`** for:
- Step-by-step setup
- JSON configurations for all 8 servers
- Troubleshooting
- Testing procedures
- Remote access setup

## Deprecated Files

These files contain incorrect information and should NOT be used:
- ~~`TYPINGMIND-HTTP-SSE-SETUP.md`~~ - INCORRECT (direct HTTP/SSE doesn't work)
- ~~`README-HTTP-SSE.md`~~ - INCORRECT (direct HTTP/SSE doesn't work)
- ~~`docker-compose.http-sse.yml`~~ - Won't work with TypingMind
- ~~`src/http-sse-server.js`~~ - Not compatible with TypingMind

## The Working Setup

**Use these files:**
- ✅ `docker-compose.core.yml` - Correct Docker Compose with connector
- ✅ `Dockerfile.mcp-connector` - Correct Dockerfile
- ✅ `docker-entrypoint.sh` - Correct entrypoint with connector
- ✅ `TYPINGMIND-SETUP-CORRECT.md` - **START HERE**

## For Claude Desktop Users

If you want Claude Desktop (not TypingMind), you can use docker exec with stdio mode - see the Claude Desktop documentation.

But for **TypingMind**, you MUST use the connector approach.

## Support

- Official connector: https://github.com/TypingMind/typingmind-mcp
- NPM package: https://www.npmjs.com/package/@typingmind/mcp

---

**TL;DR:** Use `docker-compose.core.yml` + connector, configure servers in TypingMind UI. See `TYPINGMIND-SETUP-CORRECT.md`.
