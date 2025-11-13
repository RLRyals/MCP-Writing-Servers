# MCP Writing Servers - Production Dockerfile
# Containerized Node.js application for running MCP servers with HTTP/SSE support
# Based on Node 18 Alpine for minimal image size

FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    curl \
    postgresql-client \
    bash

# Set working directory
WORKDIR /app

# Create data and logs directories
RUN mkdir -p /app/data /app/logs

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --only=production

# Copy application source code
COPY src/ ./src/

# Expose ports for MCP servers
# Port 3001: HTTP/SSE server
# Ports 3002-3009: Individual MCP server endpoints
EXPOSE 3001 3002 3003 3004 3005 3006 3007 3008 3009

# Health check - verifies the HTTP/SSE server is responsive on port 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start the HTTP/SSE server
CMD ["npm", "start"]
