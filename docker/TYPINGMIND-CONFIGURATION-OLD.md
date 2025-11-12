# TypingMind MCP Server Configuration Guide

## Overview

Your MCP Writing System Docker container runs the **@typingmind/mcp connector** on port 50880. This connector acts as a bridge between TypingMind and your MCP servers.

## Connection Setup

### 1. Connect TypingMind to the Connector

In TypingMind:
1. Go to **Settings** → **Advanced Settings** → **Model Context Protocol**
2. Enter:
   - **Connector URL**: `http://localhost:50880` (or `http://your-server-ip:50880` if remote)
   - **Auth Token**: The value from your `.env` file's `MCP_AUTH_TOKEN`

### 2. Configure Each MCP Server

After connecting, you need to configure each MCP server individually. The connector will spawn these servers as child processes.

## MCP Server Configurations

Copy and paste these configurations into TypingMind's MCP server settings:

### Core Content Planning Servers

#### Book Planning Server
```json
{
  "book-planning": {
    "command": "node",
    "args": ["/app/src/config-mcps/book-planning-server/index.js"],
    "env": {
      "MCP_STDIO_MODE": "true",
      "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
      "NODE_ENV": "production"
    }
  }
}
```

#### Series Planning Server
```json
{
  "series-planning": {
    "command": "node",
    "args": ["/app/src/config-mcps/series-planning-server/index.js"],
    "env": {
      "MCP_STDIO_MODE": "true",
      "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
      "NODE_ENV": "production"
    }
  }
}
```

#### Chapter Planning Server
```json
{
  "chapter-planning": {
    "command": "node",
    "args": ["/app/src/config-mcps/chapter-planning-server/index.js"],
    "env": {
      "MCP_STDIO_MODE": "true",
      "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
      "NODE_ENV": "production"
    }
  }
}
```

#### Character Planning Server
```json
{
  "character-planning": {
    "command": "node",
    "args": ["/app/src/config-mcps/charater-planning-server/index.js"],
    "env": {
      "MCP_STDIO_MODE": "true",
      "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
      "NODE_ENV": "production"
    }
  }
}
```

#### Scene Server
```json
{
  "scene": {
    "command": "node",
    "args": ["/app/src/config-mcps/scene-server/index.js"],
    "env": {
      "MCP_STDIO_MODE": "true",
      "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
      "NODE_ENV": "production"
    }
  }
}
```

#### Core Continuity Server
```json
{
  "core-continuity": {
    "command": "node",
    "args": ["/app/src/config-mcps/core-continuity-server/index.js"],
    "env": {
      "MCP_STDIO_MODE": "true",
      "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
      "NODE_ENV": "production"
    }
  }
}
```

#### Review Server
```json
{
  "review": {
    "command": "node",
    "args": ["/app/src/config-mcps/review-server/index.js"],
    "env": {
      "MCP_STDIO_MODE": "true",
      "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
      "NODE_ENV": "production"
    }
  }
}
```

### Optional Servers

#### Author Server (if INCLUDE_AUTHOR_SERVER=true)
```json
{
  "author": {
    "command": "node",
    "args": ["/app/src/mcps/author-server/index.js", "--stdio"],
    "env": {
      "MCP_STDIO_MODE": "true",
      "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
      "NODE_ENV": "production"
    }
  }
}
```

## All-in-One Configuration

If TypingMind allows pasting multiple servers at once, use this combined configuration:

```json
{
  "mcpServers": {
    "book-planning": {
      "command": "node",
      "args": ["/app/src/config-mcps/book-planning-server/index.js"],
      "env": {
        "MCP_STDIO_MODE": "true",
        "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
        "NODE_ENV": "production"
      }
    },
    "series-planning": {
      "command": "node",
      "args": ["/app/src/config-mcps/series-planning-server/index.js"],
      "env": {
        "MCP_STDIO_MODE": "true",
        "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
        "NODE_ENV": "production"
      }
    },
    "chapter-planning": {
      "command": "node",
      "args": ["/app/src/config-mcps/chapter-planning-server/index.js"],
      "env": {
        "MCP_STDIO_MODE": "true",
        "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
        "NODE_ENV": "production"
      }
    },
    "character-planning": {
      "command": "node",
      "args": ["/app/src/config-mcps/charater-planning-server/index.js"],
      "env": {
        "MCP_STDIO_MODE": "true",
        "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
        "NODE_ENV": "production"
      }
    },
    "scene": {
      "command": "node",
      "args": ["/app/src/config-mcps/scene-server/index.js"],
      "env": {
        "MCP_STDIO_MODE": "true",
        "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
        "NODE_ENV": "production"
      }
    },
    "core-continuity": {
      "command": "node",
      "args": ["/app/src/config-mcps/core-continuity-server/index.js"],
      "env": {
        "MCP_STDIO_MODE": "true",
        "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
        "NODE_ENV": "production"
      }
    },
    "review": {
      "command": "node",
      "args": ["/app/src/config-mcps/review-server/index.js"],
      "env": {
        "MCP_STDIO_MODE": "true",
        "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
        "NODE_ENV": "production"
      }
    },
    "author": {
      "command": "node",
      "args": ["/app/src/mcps/author-server/index.js", "--stdio"],
      "env": {
        "MCP_STDIO_MODE": "true",
        "DATABASE_URL": "postgresql://writer:your_secure_password2025@mcp-writing-db:5432/mcp_writing_db",
        "NODE_ENV": "production"
      }
    }
  }
}
```

## Important Notes

1. **Database Password**: Replace `your_secure_password2025` with your actual `POSTGRES_PASSWORD` from the `.env` file

2. **Environment Variables**: Each server needs:
   - `MCP_STDIO_MODE=true` - Tells the server to use stdio instead of HTTP
   - `DATABASE_URL` - Connection string to PostgreSQL
   - `NODE_ENV` - Set to production

3. **Container Context**: The paths (e.g., `/app/src/config-mcps/...`) are relative to INSIDE the Docker container, not your host machine

4. **Network**: The servers connect to the database using the container name `mcp-writing-db`, which works because they're all on the `mcp-network` Docker network

## Troubleshooting

### "Cannot connect to connector"
- Verify the Docker container is running: `docker ps | grep mcp-writing-system`
- Check if port 50880 is accessible: `curl http://localhost:50880` (should return 404 or similar, not connection refused)
- Ensure your firewall allows port 50880

### "Server fails to start"
- Check Docker logs: `docker logs mcp-writing-system`
- Verify the DATABASE_URL password matches your `.env` file
- Ensure PostgreSQL is running and healthy

### "No tools available"
- The server may have started but crashed
- Check logs for each server's stderr output
- Verify the file paths are correct inside the container: `docker exec mcp-writing-system ls /app/src/config-mcps/`

## Testing the Connection

After configuring, you can test by:

1. In TypingMind, try listing available tools - you should see tools from your configured servers
2. Check Docker logs to see server startup messages
3. Try executing a simple tool like listing books or series

## For Claude Desktop Users

If you want to use Claude Desktop instead of (or in addition to) TypingMind, you'll need a different configuration. See the Claude Desktop section in the main README for stdio configuration examples.
