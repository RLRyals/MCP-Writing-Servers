# TypingMind MCP Setup Guide

## Overview

This guide explains how to connect your MCP Writing Servers to TypingMind using the direct HTTP/SSE architecture. Each MCP server runs on its own dedicated port for simple, direct communication.

## Architecture

```
 TypingMind (Web UI)
    ↓
HTTP/SSE Server (ports 3001-3009)
    ↓
9 MCP Server Instances (one per port)
    ↓
PostgreSQL Database
```

## Prerequisites

- Docker installed
- PostgreSQL database (running separately or via Docker)
- TypingMind account or self-hosted instance
- `.env` file configured (use .env.example as template)

## Step 1: Configure Environment

Create your `.env` file in the project root:

```bash
# Database Configuration
DATABASE_URL=postgresql://writer:your_secure_password_here@localhost:5432/mcp_writing_db
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_USER=writer
POSTGRES_DB=mcp_writing_db
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Server Configuration
NODE_ENV=production
PORT=3001  # Main HTTP/SSE server port
```

## Step 2: Build and Run the Docker Container

Build the Docker image and run the container:

```bash
# Build the image
docker build -t mcp-writing-servers .

# Run the container
docker run -d \
  --name mcp-writing-servers \
  --env-file .env \
  -p 3001:3001 \
  -p 3002:3002 \
  -p 3003:3003 \
  -p 3004:3004 \
  -p 3005:3005 \
  -p 3006:3006 \
  -p 3007:3007 \
  -p 3008:3008 \
  -p 3009:3009 \
  mcp-writing-servers
```

This will:
1. Start the HTTP/SSE server on port 3001
2. Start individual MCP servers on ports 3001-3009
3. Each server handles SSE connections independently

## Step 3: Verify the Setup

Check that the servers are running:

```bash
# Check container status
docker ps | grep mcp-writing-servers

# Check server logs
docker logs mcp-writing-servers

# Test the health endpoint
curl http://localhost:3001/health

# You should see output like:
# {"status":"healthy","servers":9}
```

## Step 4: Configure TypingMind

In TypingMind, you need to add each MCP server individually:

1. Open TypingMind Settings
2. Navigate to: **Settings → Advanced Settings → Model Context Protocol**
3. Add each server with its dedicated port

### Server Endpoints

| Server | URL | Port |
|--------|-----|------|
| Book Planning | `http://localhost:3001/sse` | 3001 |
| Series Planning | `http://localhost:3002/sse` | 3002 |
| Chapter Planning | `http://localhost:3003/sse` | 3003 |
| Character Planning | `http://localhost:3004/sse` | 3004 |
| Scene | `http://localhost:3005/sse` | 3005 |
| Core Continuity | `http://localhost:3006/sse` | 3006 |
| Review | `http://localhost:3007/sse` | 3007 |
| Reporting | `http://localhost:3008/sse` | 3008 |
| Author | `http://localhost:3009/sse` | 3009 |

## Step 5: Verify MCP Servers

Test each server endpoint:

```bash
# Test book planning server
curl http://localhost:3001/sse

# Test series planning server
curl http://localhost:3002/sse

# Each should establish an SSE connection
```

Once connected, go to the **Plugins** tab in TypingMind. You should see all 9 MCP servers listed.

## Troubleshooting

### Issue: "Connection Failed" in TypingMind

**Solution:**
1. Verify the container is running: `docker ps | grep mcp-writing-servers`
2. Check server logs: `docker logs mcp-writing-servers`
3. Ensure ports 3001-3009 are not blocked by firewall
4. Test endpoint directly: `curl http://localhost:3001/health`

### Issue: "No Servers Responding"

**Solution:**
1. Check server logs for errors: `docker logs mcp-writing-servers -f`
2. Verify all ports are exposed: `docker port mcp-writing-servers`
3. Test each endpoint individually

### Issue: Database Connection Errors

**Solution:**
1. Verify PostgreSQL is running
2. Check DATABASE_URL environment variable is correct
3. Test database connection:
```bash
docker exec -it mcp-writing-servers \
  node -e "const pg = require('pg'); const client = new pg.Client(process.env.DATABASE_URL); client.connect().then(() => console.log('Connected')).catch(err => console.error(err));"
```

### Issue: Servers Not Starting

**Solution:**
1. Check container logs: `docker logs mcp-writing-servers -f`
2. Verify NODE_ENV and other environment variables are set
3. Ensure all required npm packages are installed in the image

## Advanced Configuration

### Changing Server Ports

Edit the Dockerfile `EXPOSE` directive and update the port mappings in your `docker run` command.

### Running Individual Servers

For testing or debugging, you can run individual servers:

```bash
# Run book-planning server standalone
docker exec -it mcp-writing-servers \
  node /app/src/config-mcps/book-planning-server/index.js
```

### Viewing Server Tools

Each MCP server exposes different tools. To see available tools, connect to the server via TypingMind and check the available functions.

## Architecture Details

### Process Management

The HTTP/SSE server (`src/http-sse-server.js`):
- Runs multiple Express instances, one per port
- Each instance handles SSE connections for one MCP server
- Manages SSE session lifecycle (connect, message, disconnect)
- Routes tool calls to the correct MCP server instance
- Streams responses back to TypingMind via SSE

### Environment Variable Usage

All MCP server processes use these environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `POSTGRES_HOST` - Database host
- `POSTGRES_PORT` - Database port
- `POSTGRES_DB` - Database name
- `POSTGRES_USER` - Database user
- `POSTGRES_PASSWORD` - Database password
- `NODE_ENV` - Environment (production/development)

### Network Architecture

```
Host Network (localhost)
    ↓
Ports 3001-3009 → Docker Container
    ↓
Express Servers (one per port)
    ↓
MCP Server Instances (one per server)
    ↓
PostgreSQL Database (external or Docker)
```

## Security Considerations

1. **Port Exposure**: Only expose ports 3001-3009 if needed; consider using reverse proxy
2. **Database Password**: Use strong passwords and rotate regularly
3. **Container Isolation**: Run with appropriate user permissions
4. **Environment Variables**: Sensitive data is passed via environment variables, not committed to git
5. **Firewall Rules**: Configure firewall to restrict access to necessary ports only

## Performance Optimization

### Resource Limits

Add resource limits when running the container:

```bash
docker run -d \
  --name mcp-writing-servers \
  --env-file .env \
  --memory="4g" \
  --cpus="2.0" \
  -p 3001-3009:3001-3009 \
  mcp-writing-servers
```

### Database Connection Pooling

Each MCP server uses a shared DatabaseManager that implements connection pooling. The pool configuration is in `src/shared/database.js`.

## Updating Servers

When you update MCP server code:

1. Rebuild the Docker image:
```bash
docker build -t mcp-writing-servers .
```

2. Stop and remove the old container:
```bash
docker stop mcp-writing-servers
docker rm mcp-writing-servers
```

3. Start the new container:
```bash
docker run -d \
  --name mcp-writing-servers \
  --env-file .env \
  -p 3001-3009:3001-3009 \
  mcp-writing-servers
```

4. Verify servers reloaded:
```bash
docker logs mcp-writing-servers -f
```

## Development vs Production

### Development Setup

For local development:
- Use `npm run dev` for hot-reloading
- Enable debug logging by setting `NODE_ENV=development`
- Run individual servers for easier testing
- Connect directly without Docker

### Production Setup

For production:
- Use Docker container (this setup)
- Enable resource limits
- Use Docker secrets or env files for sensitive data
- Set up monitoring and logging
- Configure automated backups for PostgreSQL
- Use reverse proxy (nginx/traefik) for SSL termination

## Support

For issues or questions:
- Check troubleshooting section above
- Review server logs: `docker logs mcp-writing-servers`
- Check GitHub issues: https://github.com/RLRyals/MCP-Writing-Servers

## License

This MCP Writing System is licensed under the terms specified in the main repository LICENSE file.
