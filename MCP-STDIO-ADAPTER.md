# MCP Stdio Adapter

## Overview

The `mcp-stdio-adapter.js` bridges Claude Desktop's stdio protocol with HTTP-based MCP servers, enabling communication between Claude Desktop and Dockerized MCP Writing Servers.

## Architecture

```
┌─────────────────┐      stdin/stdout      ┌──────────────────┐
│                 │ ◄──────────────────────► │                  │
│ Claude Desktop  │      JSON-RPC 2.0       │  Stdio Adapter   │
│                 │                          │                  │
└─────────────────┘                          └────────┬─────────┘
                                                      │ HTTP POST
                                                      │ /mcp endpoint
                                             ┌────────▼─────────┐
                                             │   MCP Servers    │
                                             │  ports 3001-3009 │
                                             │                  │
                                             │ • book-planning  │
                                             │ • series-planning│
                                             │ • chapter-planning│
                                             │ • character-planning│
                                             │ • scene          │
                                             │ • core-continuity│
                                             │ • review         │
                                             │ • reporting      │
                                             │ • author         │
                                             └──────────────────┘
```

## Features

- ✅ **Stdin/Stdout Communication**: Reads JSON-RPC messages from stdin, writes responses to stdout
- ✅ **HTTP Forwarding**: Routes requests to appropriate MCP servers via HTTP POST to `/mcp` endpoint
- ✅ **Tool Discovery**: Automatically discovers and maps tools from all 9 MCP servers
- ✅ **Intelligent Routing**: Routes tool calls to the correct server based on tool name
- ✅ **Error Handling**: Comprehensive error handling with proper JSON-RPC error responses
- ✅ **Stderr Logging**: All logs go to stderr, preserving stdout for JSON-RPC communication
- ✅ **Graceful Shutdown**: Handles SIGTERM/SIGINT signals cleanly

## Prerequisites

1. **MCP Servers Running**: All 9 MCP servers must be running on ports 3001-3009
   ```bash
   npm run start:orchestrator
   ```

2. **Node.js**: Version 18 or higher (for native fetch support)

## Usage

### Starting the Adapter

```bash
# Using npm script
npm run start:adapter

# Or directly
node mcp-stdio-adapter.js
```

### Configuration for Claude Desktop

Add to your Claude Desktop configuration (typically `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "writing-servers": {
      "command": "node",
      "args": ["/path/to/MCP-Writing-Servers/mcp-stdio-adapter.js"]
    }
  }
}
```

**Important**: Replace `/path/to/MCP-Writing-Servers` with the actual absolute path to your repository.

### Docker Configuration

If running in Docker, ensure the adapter can reach the servers:

```json
{
  "mcpServers": {
    "writing-servers": {
      "command": "docker",
      "args": [
        "exec",
        "mcp-writing-servers",
        "node",
        "/app/mcp-stdio-adapter.js"
      ]
    }
  }
}
```

## Supported JSON-RPC Methods

### 1. `initialize`

Initializes the adapter connection.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {}
    },
    "serverInfo": {
      "name": "mcp-stdio-adapter",
      "version": "1.0.0"
    }
  }
}
```

### 2. `tools/list`

Lists all available tools from all MCP servers.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "create_series",
        "description": "Create a new series",
        "inputSchema": { ... }
      },
      ...
    ]
  }
}
```

### 3. `tools/call`

Executes a specific tool. The adapter automatically routes to the correct server.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "create_series",
    "arguments": {
      "name": "My Fantasy Series",
      "genre": "Fantasy"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Series created successfully"
      }
    ]
  }
}
```

## Error Handling

The adapter returns standard JSON-RPC 2.0 error codes:

- `-32700`: Parse error (invalid JSON)
- `-32600`: Invalid Request (not valid JSON-RPC 2.0)
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error
- `-32000`: Server error (tool execution failed)

**Example Error Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32601,
    "message": "Unknown tool: invalid_tool_name",
    "data": {
      "tool": "invalid_tool_name",
      "availableTools": ["create_series", "create_book", ...]
    }
  }
}
```

## Logging

All logs are written to **stderr** to keep stdout clean for JSON-RPC communication.

**Log Format:**
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Tool create_series executed successfully",
  "data": { ... }
}
```

**Log Levels:**
- `debug`: Detailed request/response information
- `info`: Normal operation logs
- `warn`: Non-critical issues (server unavailable, duplicate tools)
- `error`: Error conditions

**Example Log Output:**
```
{"timestamp":"2024-01-15T10:30:00.000Z","level":"info","message":"Initializing stdio adapter..."}
{"timestamp":"2024-01-15T10:30:00.123Z","level":"info","message":"Discovered 45 tools from book-planning","data":{"server":"book-planning","port":3001,"toolCount":45}}
{"timestamp":"2024-01-15T10:30:01.456Z","level":"info","message":"Initialization complete. Mapped 312 tools across 9/9 servers"}
```

## Testing

### Manual Testing

1. Start the servers:
   ```bash
   npm run start:orchestrator
   ```

2. In another terminal, start the adapter:
   ```bash
   npm run start:adapter
   ```

3. Type JSON-RPC messages and press Enter:
   ```bash
   {"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
   {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
   ```

### Automated Testing

Run the test script:
```bash
./test-stdio-adapter.sh
```

## Troubleshooting

### Adapter Can't Connect to Servers

**Symptom:** Errors like `Failed to connect to book-planning:3001`

**Solution:**
1. Ensure servers are running: `npm run start:orchestrator`
2. Check that ports 3001-3009 are not blocked by firewall
3. Verify servers are healthy: `curl http://localhost:3001/health`

### No Tools Available

**Symptom:** `tools/list` returns empty array

**Solution:**
1. Check server logs for errors
2. Verify database connection is working
3. Restart the orchestrator

### Claude Desktop Can't Find Adapter

**Symptom:** Error in Claude Desktop about missing executable

**Solution:**
1. Use absolute path in configuration
2. Ensure `mcp-stdio-adapter.js` is executable: `chmod +x mcp-stdio-adapter.js`
3. Test manually first: `node /absolute/path/to/mcp-stdio-adapter.js`

### Duplicate Tool Names

**Symptom:** Warning about duplicate tools in logs

**Solution:**
- This is expected if multiple servers expose the same tool name
- The adapter uses the first occurrence
- Check server configurations to ensure tools are unique

## Server Mapping

The adapter routes to these servers:

| Server              | Port | Purpose                          |
|---------------------|------|----------------------------------|
| book-planning       | 3001 | Book planning and management     |
| series-planning     | 3002 | Series planning and management   |
| chapter-planning    | 3003 | Chapter planning and structure   |
| character-planning  | 3004 | Character development            |
| scene               | 3005 | Scene writing and management     |
| core-continuity     | 3006 | Continuity tracking              |
| review              | 3007 | Review and validation            |
| reporting           | 3008 | Analytics and reporting          |
| author              | 3009 | Author and metadata management   |

## Development

### Adding New Servers

To add a new server:

1. Add to the `SERVERS` array in `mcp-stdio-adapter.js`:
   ```javascript
   const SERVERS = [
       // ... existing servers
       { name: 'new-server', port: 3010 }
   ];
   ```

2. Ensure the server exposes the `/mcp` endpoint

3. Restart the adapter

### Modifying the /mcp Endpoint

The `/mcp` endpoint is defined in `src/single-server-runner.js`. It handles:
- `initialize`: Returns server info
- `tools/list`: Returns available tools
- `tools/call`: Executes a tool

## Related Documentation

- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [Server Orchestrator Documentation](./server.js)
- [Individual Server Documentation](./src/config-mcps/README.md)

## License

ISC

## Contributing

Issues and pull requests are welcome at: https://github.com/RLRyals/MCP-Writing-Servers/issues
