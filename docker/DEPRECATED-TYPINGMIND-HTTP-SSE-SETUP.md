# TypingMind Setup - HTTP/SSE Mode (RECOMMENDED)

## Overview

This setup provides **direct HTTP/SSE connections** from TypingMind to your MCP servers. This is the **recommended approach** for Docker deployments.

**Advantages:**
- ✅ Simple and straightforward
- ✅ No connector/proxy needed
- ✅ Direct communication with MCP servers
- ✅ Each server has its own endpoint
- ✅ Easy to debug and monitor
- ✅ True HTTP/SSE as TypingMind expects

## Quick Start

### Step 1: Start the Docker Container

```bash
cd /home/user/MCP-Writing-Servers/docker

# Edit .env file first - set your POSTGRES_PASSWORD
nano .env

# Start the services
docker-compose -f docker-compose.http-sse.yml up -d

# Check the logs
docker logs mcp-writing-system -f
```

You should see:
```
═══════════════════════════════════════════════════
  MCP Writing System - HTTP/SSE Server
═══════════════════════════════════════════════════
  Port: 3000
  Servers: 8
───────────────────────────────────────────────────
  Ready for TypingMind connections!
═══════════════════════════════════════════════════
```

### Step 2: Verify the Server is Running

```bash
# Test the health endpoint
curl http://localhost:3000/health

# List all available servers
curl http://localhost:3000/

# Test a specific server's info
curl http://localhost:3000/book-planning/info
```

### Step 3: Configure TypingMind

In TypingMind, go to **Settings** → **Advanced Settings** → **Model Context Protocol**

For each server you want to use, add it with this format:

#### Server URL Format

```
http://localhost:3000/<server-name>
```

If accessing from a remote machine:
```
http://your-server-ip:3000/<server-name>
```

## Available Servers

Here are all the servers and their endpoints:

### 1. Book Planning Server
```
Name: Book Planning
URL: http://localhost:3000/book-planning
```

**Tools:** create_book, update_book, get_book, list_books, plot threads, timeline events, locations, organizations

---

### 2. Series Planning Server
```
Name: Series Planning
URL: http://localhost:3000/series-planning
```

**Tools:** create_series, update_series, get_series, list_series, series overview

---

### 3. Chapter Planning Server
```
Name: Chapter Planning
URL: http://localhost:3000/chapter-planning
```

**Tools:** create_chapter, update_chapter, get_chapter, list_chapters, chapter ordering

---

### 4. Character Planning Server
```
Name: Character Planning
URL: http://localhost:3000/character-planning
```

**Tools:** create_character, update_character, get_character, list_characters, character relationships, character arcs

---

### 5. Scene Server
```
Name: Scene
URL: http://localhost:3000/scene
```

**Tools:** create_scene, update_scene, get_scene, list_scenes, scene analysis

---

### 6. Core Continuity Server
```
Name: Core Continuity
URL: http://localhost:3000/core-continuity
```

**Tools:** Track continuity, check consistency, timeline validation

---

### 7. Review Server
```
Name: Review
URL: http://localhost:3000/review
```

**Tools:** Content review, quality checks, consistency validation

---

### 8. Reporting Server
```
Name: Reporting
URL: http://localhost:3000/reporting
```

**Tools:** Generate reports, analytics, statistics

---

## TypingMind Configuration Examples

### Add a Single Server

In TypingMind MCP settings:

```json
{
  "name": "Book Planning",
  "url": "http://localhost:3000/book-planning"
}
```

### Add All Servers

You can add multiple servers by repeating the process for each one:

1. Click "Add MCP Server"
2. Enter:
   - **Name:** Book Planning
   - **URL:** `http://localhost:3000/book-planning`
3. Save
4. Repeat for each server

## Testing Your Setup

### Test 1: Check Server Health

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "serverCount": 8,
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### Test 2: List a Server's Tools

```bash
curl http://localhost:3000/book-planning/info
```

Expected response:
```json
{
  "server": "book-planning",
  "version": "1.0.0",
  "path": "/book-planning",
  "tools": [
    {
      "name": "create_book",
      "description": "Create a new book..."
    },
    ...
  ]
}
```

### Test 3: Test SSE Connection

```bash
curl -N http://localhost:3000/book-planning
```

You should see Server-Sent Events stream starting.

## Troubleshooting

### Error: "Cannot connect to server"

**Check if Docker is running:**
```bash
docker ps | grep mcp-writing-system
```

**Check logs:**
```bash
docker logs mcp-writing-system
```

**Verify port is accessible:**
```bash
curl http://localhost:3000/health
```

If you get "connection refused", the Docker container isn't running.

---

### Error: "Server responded with 500"

**Check server logs:**
```bash
docker logs mcp-writing-system -f
```

**Common causes:**
- Database connection failed
- Environment variables not set correctly
- Server class failed to initialize

---

### Error: "No tools available"

**Test the info endpoint:**
```bash
curl http://localhost:3000/book-planning/info
```

If this returns empty tools array, the server initialized but tools didn't load.

**Check:**
1. Database is healthy: `docker logs mcp-writing-db`
2. Database tables exist (run init.sql if needed)
3. DATABASE_URL is correct in environment

---

### Error: "Connection times out"

**For remote connections:**

1. **Check firewall:**
```bash
# On server, test locally first
curl http://localhost:3000/health

# Then from remote machine
curl http://server-ip:3000/health
```

2. **Check Docker port binding:**
```bash
docker ps
# Should show: 0.0.0.0:3000->3000/tcp
```

3. **Check network settings:**
- Ensure port 3000 is open in firewall
- Ensure Docker is binding to all interfaces (0.0.0.0)

---

## Environment Variables

Edit `.env` file in the docker directory:

```bash
# Required
POSTGRES_PASSWORD=your_secure_password_here

# Optional (with defaults shown)
HTTP_SSE_PORT=3000
POSTGRES_HOST=mcp-writing-db
POSTGRES_PORT=5432
POSTGRES_DB=mcp_writing_db
POSTGRES_USER=writer
NODE_ENV=production
```

## Accessing from Remote Machines

If you want to access from a different computer:

### Option 1: SSH Tunnel (Secure)

On your local machine:
```bash
ssh -L 3000:localhost:3000 user@your-server
```

Then use `http://localhost:3000/book-planning` in TypingMind.

### Option 2: Direct Access (Less Secure)

Make sure Docker binds to all interfaces (it does by default).

In TypingMind, use:
```
http://your-server-ip:3000/book-planning
```

**Security Note:** Consider using HTTPS/SSL in production. You can add nginx in front of this setup with SSL certificates.

## Updating the System

```bash
cd /home/user/MCP-Writing-Servers/docker

# Pull latest changes
git pull

# Rebuild the container
docker-compose -f docker-compose.http-sse.yml up -d --build

# Check logs
docker logs mcp-writing-system -f
```

## Comparing to Connector Mode

| Feature | HTTP/SSE Mode (This Guide) | Connector Mode |
|---------|---------------------------|----------------|
| Setup Complexity | ⭐ Simple | ⭐⭐⭐ Complex |
| Configuration | URLs only | JSON configs per server |
| Debugging | ⭐⭐⭐ Easy | ⭐ Difficult |
| Architecture | Direct | Proxy layer |
| Transport | HTTP/SSE | HTTP → Connector → STDIO |
| Recommended | ✅ Yes | ❌ No (deprecated) |

## Next Steps

1. ✅ Start Docker container
2. ✅ Verify services are running
3. ✅ Add servers to TypingMind
4. ✅ Start using your MCP writing tools!

## Support

If you encounter issues:

1. Check Docker logs: `docker logs mcp-writing-system -f`
2. Check database logs: `docker logs mcp-writing-db`
3. Test endpoints: `curl http://localhost:3000/`
4. Verify environment variables in `.env`

For more information, see:
- `CONNECTION-OPTIONS.md` - Architecture overview
- `docker-compose.http-sse.yml` - Docker configuration
- `README-MODULAR.md` - Deployment options
