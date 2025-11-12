#!/bin/bash
set -e

echo "=========================================="
echo "MCP Writing System - Config Mode"
echo "=========================================="

# Function to wait for PostgreSQL
wait_for_postgres() {
    echo "⏳ Waiting for PostgreSQL to be ready..."

    local max_attempts=30
    local attempt=0

    until PGPASSWORD=$POSTGRES_PASSWORD psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\q' 2>/dev/null; do
        attempt=$((attempt + 1))

        if [ $attempt -eq $max_attempts ]; then
            echo "❌ PostgreSQL did not become ready in time"
            exit 1
        fi

        echo "   PostgreSQL is unavailable - attempt $attempt/$max_attempts"
        sleep 2
    done

    echo "✅ PostgreSQL is ready!"
}

# Function to start HTTP/SSE Server in background
start_http_sse_server() {
    echo ""
    echo "🚀 Starting HTTP/SSE Server..."
    echo "   Port: ${HTTP_SSE_PORT:-3000}"
    echo "   Mode: HTTP/SSE (SSE endpoints)"
    echo ""

    # Start HTTP/SSE server in background
    node /app/src/http-sse-server.js &
    HTTP_SSE_PID=$!

    echo "✅ HTTP/SSE Server started (PID: $HTTP_SSE_PID)"

    # Wait a moment for server to start
    sleep 3

    # Verify it's running
    if kill -0 $HTTP_SSE_PID 2>/dev/null; then
        echo "✅ HTTP/SSE Server is running"
    else
        echo "❌ HTTP/SSE Server failed to start"
        exit 1
    fi
}

# Function to check for config file
check_config_file() {
    local config_file="/app/mcp-config.json"

    if [ -f "$config_file" ]; then
        echo ""
        echo "✅ Found mcp-config.json"
        echo "   Reading server configurations from file..."

        # Validate JSON
        if node -e "JSON.parse(require('fs').readFileSync('$config_file', 'utf8'))" 2>/dev/null; then
            echo "✅ Config file is valid JSON"

            # Show server count
            local server_count=$(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('$config_file', 'utf8')).mcpServers || {}).length)")
            echo "   Servers defined: $server_count"

            return 0
        else
            echo "⚠️  Config file contains invalid JSON"
            echo "   Falling back to default mode"
            return 1
        fi
    else
        echo ""
        echo "ℹ️  No mcp-config.json found at $config_file"
        echo "   Running in default mode (servers configured via TypingMind UI)"
        return 1
    fi
}

# Function to start MCP Connector
start_mcp_connector() {
    local config_mode=$1

    echo ""
    echo "🚀 Starting MCP Connector..."
    echo "   Port: ${MCP_CONNECTOR_PORT:-50880}"
    echo "   Auth Token: ${MCP_AUTH_TOKEN:0:8}****"
    echo "   HTTP/SSE Backend: http://localhost:${HTTP_SSE_PORT:-3000}"

    if [ "$config_mode" = "true" ]; then
        echo "   Config Mode: ENABLED (using mcp-config.json)"
        echo ""
        echo "ℹ️  Servers will be auto-discovered from config file"
        echo ""

        # Start connector with config file
        exec npx @typingmind/mcp@latest "$MCP_AUTH_TOKEN" --config /app/mcp-config.json
    else
        echo "   Config Mode: DISABLED (manual configuration)"
        echo ""
        echo "ℹ️  Configure servers in TypingMind UI with URLs like:"
        echo "   http://localhost:${HTTP_SSE_PORT:-3000}/book-planning"
        echo "   http://localhost:${HTTP_SSE_PORT:-3000}/series-planning"
        echo "   etc."
        echo ""

        # Start connector without config file (default mode)
        exec npx @typingmind/mcp@latest "$MCP_AUTH_TOKEN"
    fi
}

# Main execution
main() {
    # Validate required environment variables
    if [ -z "$MCP_AUTH_TOKEN" ]; then
        echo "❌ ERROR: MCP_AUTH_TOKEN is not set"
        exit 1
    fi

    if [ -z "$POSTGRES_PASSWORD" ]; then
        echo "❌ ERROR: POSTGRES_PASSWORD is not set"
        exit 1
    fi

    # Display configuration info
    echo ""
    echo "Configuration:"
    echo "   Database: $POSTGRES_DB @ $POSTGRES_HOST:${POSTGRES_PORT:-5432}"
    echo "   User: $POSTGRES_USER"
    echo "   HTTP/SSE Port: ${HTTP_SSE_PORT:-3000}"
    echo "   Connector Port: ${MCP_CONNECTOR_PORT:-50880}"
    echo ""

    # Execute startup sequence
    wait_for_postgres
    start_http_sse_server

    # Check for config file and store result
    if check_config_file; then
        start_mcp_connector "true"
    else
        start_mcp_connector "false"
    fi
}

# Run main function
main
