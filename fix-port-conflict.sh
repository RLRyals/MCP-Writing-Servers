#!/bin/bash
# Fix for port 50880 already in use error

echo "=========================================="
echo "Fixing Port Conflict for MCP Writing System"
echo "=========================================="
echo ""

cd "$(dirname "$0")/docker"

# Stop all running containers for this project
echo "1️⃣  Stopping existing containers..."
docker-compose -f docker-compose.connector-http-sse.yml down

# Remove any orphaned containers
echo ""
echo "2️⃣  Removing orphaned containers..."
docker-compose -f docker-compose.connector-http-sse.yml rm -f

# Kill any processes using port 50880 (if accessible)
echo ""
echo "3️⃣  Checking for processes on port 50880..."
if command -v lsof &> /dev/null; then
    PIDS=$(lsof -ti:50880)
    if [ -n "$PIDS" ]; then
        echo "   Found processes: $PIDS"
        echo "   Killing processes..."
        kill -9 $PIDS 2>/dev/null || true
    else
        echo "   No processes found on port 50880"
    fi
elif command -v ss &> /dev/null; then
    echo "   Checking with ss..."
    ss -tlnp | grep 50880 || echo "   No processes found on port 50880"
else
    echo "   ⚠️  Cannot check (lsof/ss not available)"
fi

# Prune any stopped containers
echo ""
echo "4️⃣  Pruning stopped containers..."
docker container prune -f

echo ""
echo "=========================================="
echo "✅ Cleanup complete!"
echo "=========================================="
echo ""
echo "Now you can start the services with:"
echo "  cd docker"
echo "  docker-compose -f docker-compose.connector-http-sse.yml up"
echo ""
