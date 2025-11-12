#!/bin/bash
set -e

echo "=========================================="
echo "MCP Writing System - HTTP/SSE Server Starting"
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

# Function to start HTTP/SSE Server
start_http_sse_server() {
    echo ""
    echo "🚀 Starting HTTP/SSE Server..."
    echo "   Port: ${PORT:-3000}"
    echo "   Mode: HTTP/SSE (Direct connections)"
    echo "   Database: $POSTGRES_DB @ $POSTGRES_HOST"
    echo ""

    # Start the HTTP/SSE server
    # This will serve all MCP servers via HTTP/SSE endpoints
    exec node /app/src/http-sse-server.js
}

# Main execution
main() {
    # Validate required environment variables
    if [ -z "$POSTGRES_PASSWORD" ]; then
        echo "❌ ERROR: POSTGRES_PASSWORD is not set"
        exit 1
    fi

    # Execute startup sequence
    wait_for_postgres
    start_http_sse_server
}

# Run main function
main
