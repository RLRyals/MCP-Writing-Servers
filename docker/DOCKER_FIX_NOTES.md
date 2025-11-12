# Docker 404 Error Fixes

## Issues Identified

The 404 errors you were experiencing were caused by three main configuration problems:

### 1. Missing mcp-config.json in Container
**Problem**: The `mcp-config.json` file was not being copied into the Docker container, so the @typingmind/mcp connector couldn't find the server configurations.

**Fix**: Updated both Dockerfiles to copy the configuration file:
- `docker/Dockerfile.mcp-connector` - line 27
- `docker/Dockerfile.connector-http-sse` - line 26

### 2. HTTP/SSE Port Not Exposed
**Problem**: The HTTP/SSE server runs on port 3000 internally but this port was not exposed in `docker-compose.connector-http-sse.yml`, preventing external connections.

**Fix**: Updated `docker/docker-compose.connector-http-sse.yml` to expose port 3000:
```yaml
ports:
  - "${MCP_CONNECTOR_PORT:-50880}:${MCP_CONNECTOR_PORT:-50880}"
  - "${HTTP_SSE_PORT:-3000}:${HTTP_SSE_PORT:-3000}"
```

### 3. Connector Not Using Config File
**Problem**: The entrypoint scripts were starting the @typingmind/mcp connector without specifying the config file path.

**Fix**: Updated both entrypoint scripts to pass the config file path:
- `docker/connector-http-sse-entrypoint.sh` - line 72
- `docker/docker-entrypoint.sh` - line 72

## How to Apply the Fixes

1. **Rebuild the Docker images**:
   ```bash
   cd docker
   docker-compose -f docker-compose.connector-http-sse.yml build --no-cache
   ```

2. **Restart the containers**:
   ```bash
   docker-compose -f docker-compose.connector-http-sse.yml down
   docker-compose -f docker-compose.connector-http-sse.yml up -d
   ```

3. **Verify the fix**:
   ```bash
   # Check container logs
   docker logs mcp-writing-system

   # Test HTTP/SSE endpoints
   curl http://localhost:3000/health
   curl http://localhost:3000/

   # Test individual server endpoints
   curl http://localhost:3000/book-planning/health
   curl http://localhost:3000/series-planning/health
   ```

## Expected Behavior After Fix

1. **No more 404 errors** - The connector will successfully connect to all configured servers
2. **HTTP/SSE endpoints accessible** - You can access the SSE endpoints at `http://localhost:3000/<server-name>`
3. **Connector runs smoothly** - The @typingmind/mcp connector will properly load server configurations from mcp-config.json

## Architecture Overview

```
TypingMind Client
    ↓ (connects to)
MCP Connector (port 50880)
    ↓ (forwards requests to)
HTTP/SSE Server (port 3000)
    ↓ (manages)
Individual MCP Servers
    ↓ (connect to)
PostgreSQL Database (port 5432)
```

## Available Endpoints

Once fixed, the following endpoints will be available:

- **Root**: `http://localhost:3000/` - Lists all servers
- **Health**: `http://localhost:3000/health` - Global health check
- **Server SSE**: `http://localhost:3000/<server-name>` - SSE endpoint for each server
- **Server Health**: `http://localhost:3000/<server-name>/health` - Individual server health
- **Server Info**: `http://localhost:3000/<server-name>/info` - Server information and tools

### Available Servers:
- book-planning
- series-planning
- chapter-planning
- character-planning
- scene
- core-continuity
- review
- reporting

## Troubleshooting

If you still see errors after applying these fixes:

1. **Check environment variables**:
   ```bash
   docker exec mcp-writing-system env | grep -E 'MCP|POSTGRES|HTTP'
   ```

2. **Verify mcp-config.json is in container**:
   ```bash
   docker exec mcp-writing-system cat /app/mcp-config.json
   ```

3. **Check if HTTP/SSE server is running**:
   ```bash
   docker exec mcp-writing-system ps aux | grep node
   ```

4. **Test database connection**:
   ```bash
   docker exec mcp-writing-system psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB -c '\q'
   ```

## Configuration Files Modified

1. `docker/Dockerfile.mcp-connector`
2. `docker/Dockerfile.connector-http-sse`
3. `docker/docker-compose.connector-http-sse.yml`
4. `docker/connector-http-sse-entrypoint.sh`
5. `docker/docker-entrypoint.sh`
