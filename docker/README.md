# MCP Writing System - Docker Setup

## Quick Start for TypingMind

**TL;DR:**
```bash
cd docker
docker-compose -f docker-compose.connector-http-sse.yml up -d
```

Then in TypingMind:
1. Connect to: `http://localhost:50880` (with your `MCP_AUTH_TOKEN` from `.env`)
2. Configure servers with URLs: `http://localhost:3000/book-planning`, etc.

**See: [`TYPINGMIND-SETUP-FINAL.md`](TYPINGMIND-SETUP-FINAL.md) for complete instructions.**

---

## Architecture

```
TypingMind → @typingmind/mcp Connector → HTTP/SSE Server → MCP Servers → PostgreSQL
             Port 50880 (HTTP API)        Port 3000 (SSE)
```

**How it works:**
1. **HTTP/SSE Server** runs all 8 MCP servers with SSE endpoints (internal port 3000)
2. **Connector** bridges TypingMind to SSE endpoints (exposed port 50880)
3. **TypingMind** connects to connector and configures servers using URLs

---

## Available Servers

Once running, you have 8 MCP servers:

| Server | URL (for TypingMind config) |
|--------|------------------------------|
| Book Planning | `http://localhost:3000/book-planning` |
| Series Planning | `http://localhost:3000/series-planning` |
| Chapter Planning | `http://localhost:3000/chapter-planning` |
| Character Planning | `http://localhost:3000/character-planning` |
| Scene | `http://localhost:3000/scene` |
| Core Continuity | `http://localhost:3000/core-continuity` |
| Review | `http://localhost:3000/review` |
| Reporting | `http://localhost:3000/reporting` |

---

## Setup

### 1. Configure Environment

```bash
cd docker
cp ../.env.example .env
nano .env
```

**Required variables:**
```bash
POSTGRES_PASSWORD=your_secure_password_here
MCP_AUTH_TOKEN=your_secure_random_token_here  # Generate with: openssl rand -hex 32
```

### 2. Start Services

```bash
docker-compose -f docker-compose.connector-http-sse.yml up -d
```

### 3. Verify

```bash
# Check services are running
docker ps

# Check logs
docker logs mcp-writing-system -f

# Test endpoints
docker exec mcp-writing-system curl http://localhost:3000/health
curl http://localhost:50880/health
```

### 4. Configure TypingMind

See [`TYPINGMIND-SETUP-FINAL.md`](TYPINGMIND-SETUP-FINAL.md) for detailed instructions.

**Quick version:**
- Connector URL: `http://localhost:50880`
- Auth Token: (from your `.env` file)
- Server configs: Use URLs like `http://localhost:3000/book-planning`

---

## Files

**Use these:**
- ✅ `docker-compose.connector-http-sse.yml` - Main Docker Compose file (RECOMMENDED)
- ✅ `Dockerfile.connector-http-sse` - Dockerfile for connector + HTTP/SSE
- ✅ `connector-http-sse-entrypoint.sh` - Startup script
- ✅ `TYPINGMIND-SETUP-FINAL.md` - **Complete setup guide (START HERE)**
- ✅ `.env` - Environment configuration

**Reference/Alternative:**
- `docker-compose.core.yml` - Original connector-only setup (command-based servers)
- `Dockerfile.mcp-connector` - Original connector Dockerfile
- `docker-entrypoint.sh` - Original entrypoint
- `README-MODULAR.md` - Information about modular deployment options

**Deprecated/Old:**
- `TYPINGMIND-SETUP-CORRECT.md` - Outdated (command-based approach)
- `TYPINGMIND-CONFIGURATION-OLD.md` - Outdated
- `CONNECTION-OPTIONS-OLD.md` - Outdated
- `DEPRECATED-*` - Old/incorrect documentation

---

## Commands

```bash
# Start services
docker-compose -f docker-compose.connector-http-sse.yml up -d

# View logs
docker logs mcp-writing-system -f
docker logs mcp-writing-db

# Stop services
docker-compose -f docker-compose.connector-http-sse.yml down

# Rebuild (after code changes)
docker-compose -f docker-compose.connector-http-sse.yml up -d --build

# Remove all data
docker-compose -f docker-compose.connector-http-sse.yml down -v
```

---

## Testing

```bash
# Test HTTP/SSE server (inside container)
docker exec mcp-writing-system curl http://localhost:3000/
docker exec mcp-writing-system curl http://localhost:3000/health
docker exec mcp-writing-system curl http://localhost:3000/book-planning/info

# Test connector (from host)
curl http://localhost:50880/health

# Test with auth
TOKEN=$(grep MCP_AUTH_TOKEN .env | cut -d= -f2)
curl -H "Authorization: Bearer $TOKEN" http://localhost:50880/clients

# Test database
docker exec mcp-writing-db psql -U writer -d mcp_writing_db -c "SELECT version()"
```

---

## Troubleshooting

**Container won't start:**
```bash
docker logs mcp-writing-system
docker logs mcp-writing-db
```

**Connection refused:**
```bash
# Verify containers are running
docker ps | grep mcp

# Check ports are exposed
docker ps | grep mcp-writing-system
# Should show: 0.0.0.0:50880->50880/tcp
```

**Database connection error:**
```bash
# Check database is ready
docker exec mcp-writing-db psql -U writer -d mcp_writing_db -c "SELECT 1"

# Check environment variables
docker exec mcp-writing-system env | grep -E "(DATABASE|POSTGRES)"
```

**No tools showing in TypingMind:**
- Check logs: `docker logs mcp-writing-system -f`
- Verify HTTP/SSE endpoints: `docker exec mcp-writing-system curl http://localhost:3000/`
- Check server configuration in TypingMind (must use URLs, not commands)

See [`TYPINGMIND-SETUP-FINAL.md`](TYPINGMIND-SETUP-FINAL.md) for detailed troubleshooting.

---

## Architecture Details

### Components

1. **PostgreSQL (Port 5432)**
   - Database for all MCP servers
   - Persistent storage via Docker volume

2. **HTTP/SSE Server (Port 3000 - internal)**
   - Runs all 8 MCP servers
   - Provides SSE endpoints for each server
   - Not exposed to host (internal to Docker)

3. **Connector (Port 50880 - exposed)**
   - Bridges TypingMind to HTTP/SSE server
   - Handles authentication
   - Exposes REST API for TypingMind
   - Official @typingmind/mcp package

### Why This Architecture?

**URL-based (this setup) vs Command-based:**

| Aspect | URL-based (Recommended) | Command-based |
|--------|------------------------|---------------|
| Transport | HTTP/SSE | STDIO |
| Server lifecycle | Always running | Spawned on-demand |
| Docker-friendly | ✅ Yes | ⚠️ Complex |
| Configuration | Simple URLs | Commands + env vars |
| Resource usage | Efficient | Higher |
| Debugging | Easy | Difficult |

---

## For Claude Desktop Users

If you want to use Claude Desktop (not TypingMind), you don't need the connector. See the Claude Desktop documentation for STDIO configuration.

**This guide is specifically for TypingMind users.**

---

## Documentation

- **Start here:** [`TYPINGMIND-SETUP-FINAL.md`](TYPINGMIND-SETUP-FINAL.md)
- Modular deployment: [`README-MODULAR.md`](README-MODULAR.md)
- HTTP/SSE server: [`../src/http-sse-server.js`](../src/http-sse-server.js)

---

## Support

- Connector: https://github.com/TypingMind/typingmind-mcp
- MCP Protocol: https://modelcontextprotocol.io
- TypingMind MCP: https://docs.typingmind.com/model-context-protocol-(mcp)-in-typingmind

---

**Questions?** See [`TYPINGMIND-SETUP-FINAL.md`](TYPINGMIND-SETUP-FINAL.md) for complete setup guide and troubleshooting.
