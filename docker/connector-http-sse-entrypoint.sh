#!/bin/bash
set -e

echo "=========================================="
echo "MCP Writing System - Connector + HTTP/SSE"
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

# Function to start MCP Connector
start_mcp_connector() {
    echo ""
    echo "🚀 Starting MCP Connector..."
    echo "   Port: ${MCP_CONNECTOR_PORT:-50880}"
    echo "   Auth Token: ${MCP_AUTH_TOKEN:0:8}****"
    echo "   HTTP/SSE Backend: http://localhost:${HTTP_SSE_PORT:-3000}"
    echo ""
    echo "ℹ️  Configure servers in TypingMind UI with URLs like:"
    echo "   http://localhost:${HTTP_SSE_PORT:-3000}/book-planning"
    echo "   http://localhost:${HTTP_SSE_PORT:-3000}/series-planning"
    echo "   etc."
    echo ""

    # Start the MCP Connector with mcp-config.json
    # It will forward TypingMind requests to our HTTP/SSE endpoints
    exec npx @typingmind/mcp@latest "$MCP_AUTH_TOKEN" /app/mcp-config.json
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

    # Execute startup sequence
    wait_for_postgres
    start_http_sse_server
    start_mcp_connector
}

# Run main function
main
