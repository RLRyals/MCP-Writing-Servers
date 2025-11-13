# TypingMind MCP Setup Guide

## Overview

This guide explains how to connect your MCP Writing Servers to TypingMind using the `@typingmind/mcp-connector`. The connector will automatically spawn and manage all 9 MCP servers.

## Architecture

```
TypingMind (Web UI)
    ↓
MCP Connector (localhost:50880)
    ↓
@typingmind/mcp-connector with mcp-config.json
    ↓
9 MCP Server Processes (spawned via stdio)
    ↓
PostgreSQL Database
```

## Prerequisites

- Docker and Docker Compose installed
- TypingMind account or self-hosted instance
- `.env` file configured in the docker directory

## Step 1: Configure Environment

Create or update your `docker/.env` file:

```bash
# Database Configuration
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_USER=writer
POSTGRES_DB=mcp_writing_db
POSTGRES_HOST=mcp-writing-db
POSTGRES_PORT=5432

# MCP Connector Configuration
MCP_AUTH_TOKEN=your_secure_token_here  # Generate with: openssl rand -hex 32
MCP_CONNECTOR_PORT=50880

# Network Configuration
MCP_NETWORK_NAME=mcp-network
```

## Step 2: Start the Docker Stack

Navigate to the docker directory and start the services:

```bash
cd docker
docker-compose -f docker-compose.connector-config.yml up -d
```

This will:
1. Start PostgreSQL database
2. Wait for database to be ready
3. Start the MCP Connector on port 50880
4. Auto-discover and configure 9 MCP servers from mcp-config.json

## Step 3: Verify the Setup

Check that the connector is running:

```bash
# Check container status
docker ps | grep mcp-writing-system

# Check connector logs
docker logs mcp-writing-system

# You should see output like:
# ✅ Found mcp-config.json
# ✅ Config file is valid JSON
# Servers defined: 9
# 🚀 Starting MCP Connector...
```

## Step 4: Configure TypingMind

### Option A: Using TypingMind Web UI

1. Open TypingMind Settings
2. Navigate to: **Settings → Advanced Settings → Model Context Protocol**
3. Select: **Remote Server**
4. Configure:
   - **Server URL**: `http://localhost:50880`
   - **Authentication Token**: Your `MCP_AUTH_TOKEN` from .env file
5. Click **Connect**
6. You should see **✓ Connected**

### Option B: Using TypingMind Desktop App

If you're using the MCP Electron App installer:

1. The app will automatically create a config file at:
   - Windows: `%APPDATA%\mcp-electron-app\typingmind-mcp-config.json`
   - macOS: `~/Library/Application Support/mcp-electron-app/typingmind-mcp-config.json`
   - Linux: `~/.config/mcp-electron-app/typingmind-mcp-config.json`

2. The config should look like:
```json
{
  "enabled": true,
  "serverUrl": "http://localhost:50880",
  "authToken": "your_token_here",
  "autoConnect": true
}
```

## Step 5: Verify MCP Plugins

Once connected, go to the **Plugins** tab in TypingMind. You should see all 9 MCP servers listed:

1. ✅ book-planning-server
2. ✅ chapter-planning-server
3. ✅ charater-planning-server (note: this has a typo in the original code)
4. ✅ core-continuity-server
5. ✅ reporting-server
6. ✅ review-server
7. ✅ scene-server
8. ✅ series-planning-server
9. ✅ author-server

Enable the servers you want to use in your chat sessions.

## Configuration Files

### mcp-config.json (Docker Container)

Located at: `docker/mcp-config.json`

This file defines how the connector spawns each MCP server:

```json
{
  "mcpServers": {
    "book-planning-server": {
      "command": "node",
      "args": ["/app/src/config-mcps/book-planning-server/index.js"],
      "env": {
        "MCP_STDIO_MODE": "true"
      }
    },
    // ... 8 more servers
  }
}
```

**Key Points:**
- `command`: The executable to run (node for JavaScript servers)
- `args`: Path to the server entry point
- `env`: Environment variables passed to the server process
- `MCP_STDIO_MODE`: Enables stdio communication mode

### Important Notes

1. **All servers run in stdio mode**: They communicate via stdin/stdout with the connector
2. **Database environment variables** are automatically passed to all spawned processes
3. **Each server shares the same PostgreSQL connection** via environment variables

## Troubleshooting

### Issue: "Connection Failed" in TypingMind

**Solution:**
1. Verify the connector is running: `docker ps | grep mcp-writing-system`
2. Check connector logs: `docker logs mcp-writing-system`
3. Verify the auth token matches in both .env and TypingMind config
4. Ensure port 50880 is not blocked by firewall

### Issue: "No Plugins Appearing"

**Solution:**
1. Check the mcp-config.json is valid JSON
2. Verify all server paths exist in the container
3. Check connector logs for startup errors
4. Restart the container: `docker restart mcp-writing-system`

### Issue: Database Connection Errors

**Solution:**
1. Verify PostgreSQL is running: `docker ps | grep postgres`
2. Check database logs: `docker logs mcp-writing-db`
3. Verify DATABASE_URL environment variable is correct
4. Test database connection:
```bash
docker exec -it mcp-writing-system \
  psql -h mcp-writing-db -U writer -d mcp_writing_db
```

### Issue: Servers Not Starting

**Solution:**
1. Check MCP_STDIO_MODE is set to "true" in mcp-config.json
2. Verify NODE_ENV and other environment variables are exported
3. Check individual server logs in connector output
4. Ensure all required npm packages are installed

## Advanced Configuration

### Changing the Connector Port

Edit `docker/.env`:
```bash
MCP_CONNECTOR_PORT=8080  # Change from 50880
```

Then update TypingMind settings to use the new port.

### Running Individual Servers

For testing or debugging, you can run individual servers:

```bash
# Run book-planning server standalone
docker exec -it mcp-writing-system \
  node /app/src/config-mcps/book-planning-server/index.js
```

### Viewing Server Tools

Each MCP server exposes different tools. To see available tools:

```bash
# Get server info (when running in HTTP mode)
curl http://localhost:50880/clients
```

## Architecture Details

### Process Management

The @typingmind/mcp-connector:
- Spawns each MCP server as a child process
- Manages stdin/stdout communication
- Handles server lifecycle (start, stop, restart)
- Routes tool calls to the correct server
- Aggregates responses back to TypingMind

### Environment Variable Inheritance

All spawned MCP processes inherit these environment variables:
- `DATABASE_URL`
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `NODE_ENV`
- `MCP_STDIO_MODE` (set to "true")

### Network Architecture

```
Host Network (localhost)
    ↓
Port 50880 → MCP Connector Container
    ↓
Internal Processes → 9 MCP Servers (stdio)
    ↓
Docker Network (mcp-network)
    ↓
PostgreSQL Container (port 5432)
```

## Security Considerations

1. **Authentication Token**: Keep your MCP_AUTH_TOKEN secure and never commit it to git
2. **Network Exposure**: Only expose port 50880 if needed; consider using reverse proxy
3. **Database Password**: Use strong passwords and rotate regularly
4. **Container Isolation**: All MCP servers run in the same container and share resources
5. **Environment Variables**: Sensitive data is passed via environment variables, not config files

## Performance Optimization

### Resource Limits

Add to docker-compose.connector-config.yml:

```yaml
services:
  mcp-writing-system:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
```

### Database Connection Pooling

Each MCP server uses a shared DatabaseManager that implements connection pooling. The pool configuration can be adjusted in `src/shared/database.js`.

## Updating Servers

When you update MCP server code:

1. Rebuild the Docker image:
```bash
cd docker
docker-compose -f docker-compose.connector-config.yml build
```

2. Restart the container:
```bash
docker-compose -f docker-compose.connector-config.yml up -d
```

3. Verify servers reloaded:
```bash
docker logs mcp-writing-system
```

## Development vs Production

### Development Setup

For local development, you might want to:
- Mount source code as a volume for live reloading
- Enable debug logging
- Run individual servers in HTTP mode for easier testing

### Production Setup

For production:
- Use the config-based connector (this setup)
- Enable resource limits
- Use Docker secrets for sensitive data
- Set up monitoring and logging
- Configure automated backups for PostgreSQL

## Migration from HTTP/SSE Architecture

If you were previously using the HTTP/SSE server architecture (http-sse-server.js):

### Old Architecture:
```
TypingMind → Connector → HTTP/SSE Server → MCP Servers → Database
```

### New Architecture:
```
TypingMind → Connector → MCP Servers (stdio) → Database
```

### Benefits of New Architecture:
- ✅ Auto-discovery in TypingMind (servers appear as plugins)
- ✅ Simpler deployment (no intermediate HTTP server)
- ✅ Better process management (connector handles lifecycle)
- ✅ More efficient (direct stdio communication)
- ✅ Easier debugging (clear process boundaries)

### Migration Steps:
1. Stop old containers
2. Update to new docker-compose.connector-config.yml
3. Update .env with MCP_AUTH_TOKEN
4. Start new stack
5. Reconfigure TypingMind connection

## Support

For issues or questions:
- Check troubleshooting section above
- Review connector logs: `docker logs mcp-writing-system`
- Review database logs: `docker logs mcp-writing-db`
- Check GitHub issues: https://github.com/RLRyals/MCP-Writing-Servers

## License

This MCP Writing System is licensed under the terms specified in the main repository LICENSE file.
