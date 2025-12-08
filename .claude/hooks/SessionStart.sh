#!/bin/bash
set -e

# MCP Writing Servers - Claude Code SessionStart Hook
# This hook runs when a new Claude Code session starts
# It ensures the environment is properly set up for development

echo "======================================"
echo "MCP Writing Servers - Session Setup"
echo "======================================"
echo ""

PROJECT_ROOT="/home/user/MCP-Writing-Servers"
cd "$PROJECT_ROOT"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Status tracking
WARNINGS=0
ERRORS=0

# Function to print status
print_status() {
    local status=$1
    local message=$2
    case $status in
        "ok")
            echo -e "${GREEN}✓${NC} $message"
            ;;
        "warn")
            echo -e "${YELLOW}⚠${NC} $message"
            WARNINGS=$((WARNINGS + 1))
            ;;
        "error")
            echo -e "${RED}✗${NC} $message"
            ERRORS=$((ERRORS + 1))
            ;;
        "info")
            echo -e "${BLUE}ℹ${NC} $message"
            ;;
    esac
}

# 1. Check Node.js version
echo "1. Checking Node.js environment..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    print_status "ok" "Node.js $NODE_VERSION detected"
else
    print_status "error" "Node.js not found. Please install Node.js 18+"
fi

# 2. Check and install dependencies
echo ""
echo "2. Checking npm dependencies..."
if [ -f "package.json" ]; then
    if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
        print_status "warn" "Dependencies not installed. Installing now..."
        npm install --quiet
        print_status "ok" "Dependencies installed successfully"
    else
        # Check if package.json is newer than node_modules
        if [ "package.json" -nt "node_modules" ]; then
            print_status "warn" "package.json updated. Running npm install..."
            npm install --quiet
            print_status "ok" "Dependencies updated"
        else
            print_status "ok" "Dependencies already installed"
        fi
    fi
else
    print_status "error" "package.json not found"
fi

# 3. Check and create .env file
echo ""
echo "3. Checking environment configuration..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        print_status "warn" ".env not found. Creating from .env.example..."
        cp .env.example .env
        print_status "ok" ".env file created"
        print_status "info" "Please review .env and update DATABASE_URL and MCP_AUTH_TOKEN"
    else
        print_status "error" ".env.example not found"
    fi
else
    print_status "ok" ".env file exists"
fi

# 4. Set GitHub Auth Token from environment
echo ""
echo "4. Checking GitHub authentication..."
if [ -n "$GITHUB_AUTH_TOKEN" ]; then
    print_status "ok" "GITHUB_AUTH_TOKEN found in environment"
    # Export for current session
    export GITHUB_TOKEN="$GITHUB_AUTH_TOKEN"
    # Optionally add to .env if not present
    if [ -f ".env" ] && ! grep -q "GITHUB_AUTH_TOKEN" .env; then
        echo "" >> .env
        echo "# GitHub Authentication (auto-added by SessionStart hook)" >> .env
        echo "GITHUB_AUTH_TOKEN=$GITHUB_AUTH_TOKEN" >> .env
        print_status "info" "Added GITHUB_AUTH_TOKEN to .env"
    fi
else
    print_status "warn" "GITHUB_AUTH_TOKEN not found in environment"
fi

# 5. Check database connection
echo ""
echo "5. Checking database connectivity..."
if [ -f ".env" ]; then
    # Source .env to get DATABASE_URL
    export $(grep -v '^#' .env | grep DATABASE_URL | xargs)

    if [ -n "$DATABASE_URL" ]; then
        # Extract connection details
        DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
        DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
        DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

        # Check if PostgreSQL is accessible
        if command -v psql &> /dev/null; then
            if psql "$DATABASE_URL" -c "SELECT 1;" &> /dev/null; then
                print_status "ok" "Database connection successful ($DB_NAME @ $DB_HOST:$DB_PORT)"
            else
                print_status "warn" "Cannot connect to database ($DB_NAME @ $DB_HOST:$DB_PORT)"
                print_status "info" "To start database: docker compose up -d postgres"
                print_status "info" "To initialize: docker compose exec postgres psql -U writer -d mcp_series -f /docker-entrypoint-initdb.d/init.sql"
            fi
        else
            # Try with docker if psql not available
            if command -v docker &> /dev/null; then
                if docker ps --format '{{.Names}}' | grep -q 'postgres\|mcp-series-db'; then
                    print_status "ok" "PostgreSQL container is running"
                else
                    print_status "warn" "PostgreSQL container not running"
                    print_status "info" "To start: docker compose up -d postgres"
                fi
            else
                print_status "warn" "Cannot verify database (psql or docker not found)"
            fi
        fi
    else
        print_status "warn" "DATABASE_URL not configured in .env"
    fi
fi

# 6. Check Docker availability
echo ""
echo "6. Checking Docker environment..."
if command -v docker &> /dev/null; then
    if docker info &> /dev/null; then
        print_status "ok" "Docker is running"

        # Check if docker compose file exists
        if [ -f "docker-compose.yml" ]; then
            print_status "ok" "docker-compose.yml found"
        fi
    else
        print_status "warn" "Docker is installed but not running"
    fi
else
    print_status "warn" "Docker not found (optional for local PostgreSQL)"
fi

# 7. Repository status
echo ""
echo "7. Checking repository status..."
if [ -d ".git" ]; then
    BRANCH=$(git branch --show-current)
    print_status "ok" "Git repository on branch: $BRANCH"

    # Check for uncommitted changes
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        print_status "info" "Working directory has uncommitted changes"
    fi
else
    print_status "warn" "Not a git repository"
fi

# 8. Quick reference commands
echo ""
echo "======================================"
echo "Quick Reference Commands"
echo "======================================"
echo ""
echo "Database:"
echo "  Start:      docker compose up -d postgres"
echo "  Initialize: docker compose exec postgres psql -U writer -d mcp_series -f /docker-entrypoint-initdb.d/init.sql"
echo "  Connect:    psql \$DATABASE_URL"
echo ""
echo "Servers:"
echo "  HTTP/SSE:   npm start"
echo "  stdio:      node src/stdio-server.js"
echo "  Adapter:    node mcp-stdio-adapter.js database-admin-server"
echo ""
echo "Testing:"
echo "  All tests:  npm test"
echo "  Adapter:    ./test-stdio-adapter.sh"
echo ""
echo "Documentation:"
echo "  Architecture:  docs/ARCHITECTURE.md"
echo "  Integration:   docs/MCP-ELECTRON-INTEGRATION.md"
echo "  API Reference: docs/API-REFERENCE.md"
echo ""

# Summary
echo "======================================"
echo "Setup Summary"
echo "======================================"
if [ $ERRORS -gt 0 ]; then
    print_status "error" "$ERRORS error(s) found - please review above"
    echo ""
    echo "The environment needs attention before starting work."
elif [ $WARNINGS -gt 0 ]; then
    print_status "warn" "$WARNINGS warning(s) found - review recommended"
    echo ""
    echo "You can start working, but some features may not be available."
else
    print_status "ok" "All checks passed! Environment is ready."
    echo ""
    echo "You're all set to work on MCP Writing Servers!"
fi

echo ""
echo "Integration Note: This repo is designed to be cloned into MCP-Electron-App (FictionLab)"
echo "                  at path: servers/mcp-writing"
echo ""
echo "======================================"
