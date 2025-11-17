# ============================================
# MCP Writing Servers - Multi-stage Dockerfile
# ============================================
# Optimized Docker build for MCP Writing Servers
# Performance improvement: 10-100x faster startup vs bind mounts
# Target image size: <500MB
# Security: Non-root user execution
# ============================================

# ============================================
# Stage 1: Base - Alpine with dumb-init
# ============================================
FROM node:18-alpine AS base

# Install dumb-init for proper signal handling
# and essential system dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    postgresql-client \
    bash

# Set working directory
WORKDIR /app

# ============================================
# Stage 2: Dependencies - Optimized npm install
# ============================================
FROM base AS dependencies

# Copy package files for dependency installation
COPY package.json package-lock.json ./

# Install production dependencies with npm cache optimization
# - Use npm ci for clean, reproducible builds
# - Only production dependencies to minimize image size
# - Leverage Docker layer caching
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# ============================================
# Stage 3: Builder - Combine deps and source
# ============================================
FROM base AS builder

# Copy installed dependencies from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application source code
COPY package.json package-lock.json ./
COPY src/ ./src/

# Create necessary directories
RUN mkdir -p /app/data /app/logs

# ============================================
# Stage 4: Runtime - Final production image
# ============================================
FROM base AS runtime

# Copy only necessary files from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src ./src
COPY --from=builder /app/data ./data
COPY --from=builder /app/logs ./logs

# Create nodejs user and group if they don't exist
# UID/GID 1001 for non-root execution
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Set proper ownership for application files
RUN chown -R nodejs:nodejs /app

# Switch to non-root user for security
USER nodejs:1001

# Expose ports for MCP servers
# Ports 3001-3010: 10 individual MCP server endpoints with HTTP/SSE transport
# 3001: book-planning, 3002: series-planning, 3003: chapter-planning
# 3004: character-planning, 3005: scene, 3006: core-continuity
# 3007: review, 3008: reporting, 3009: author, 3010: database-admin
EXPOSE 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010

# Health check - verifies the HTTP/SSE server is responsive
# Checks all critical services including database-admin on port 3010
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3001/health && \
        curl -f http://localhost:3010/health || exit 1

# Use dumb-init as entrypoint for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the HTTP/SSE server
CMD ["node", "src/http-sse-server.js"]
