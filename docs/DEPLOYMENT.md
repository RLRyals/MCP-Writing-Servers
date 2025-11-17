# Phase 7: Integration, Deployment & Production Rollout

Complete deployment guide for MCP Writing Servers ecosystem with monitoring and production best practices.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Quick Start](#quick-start)
5. [Production Deployment](#production-deployment)
6. [Monitoring & Observability](#monitoring--observability)
7. [Health Checks](#health-checks)
8. [Backup & Restore](#backup--restore)
9. [Rollback Procedures](#rollback-procedures)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The MCP Writing Servers ecosystem consists of:

- **10 MCP Servers** running on ports 3001-3010
- **PostgreSQL Database** with connection pooling via PgBouncer
- **Prometheus** for metrics collection
- **Grafana** for visualization and dashboards
- **Health checks** and auto-restart capabilities

### Success Metrics (Phase 7 Goals)

- ✅ **P95 Latency**: <100ms
- ✅ **Error Rate**: <5%
- ✅ **Zero Critical Errors**: First 48 hours
- ✅ **Backup Success Rate**: 100%
- ✅ **Uptime**: 99.9%

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Load Balancer                        │
└─────────────────────────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
┌────────▼────────┐ ┌──────▼──────┐ ┌─────────▼────────┐
│  MCP Server 1   │ │ MCP Server 2│ │  MCP Server 10   │
│  (Port 3001)    │ │ (Port 3002) │ │  (Port 3010)     │
│  book-planning  │ │series-plan  │ │  database-admin  │
└─────────────────┘ └─────────────┘ └──────────────────┘
         │                  │                  │
         └──────────────────┼──────────────────┘
                            │
                    ┌───────▼────────┐
                    │   PgBouncer    │
                    │ (Port 6432)    │
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │   PostgreSQL   │
                    │   (Port 5432)  │
                    └────────────────┘
```

---

## Prerequisites

### System Requirements

- **OS**: Linux (Ubuntu 20.04+), macOS, or Windows with WSL2
- **RAM**: Minimum 4GB, Recommended 8GB+
- **Disk**: 20GB free space
- **CPU**: 2+ cores
- **Network**: Outbound internet access for Docker images

### Software Requirements

```bash
# Docker & Docker Compose
docker --version   # 20.10+
docker-compose --version  # 1.29+

# Node.js (for local development)
node --version     # 18+
npm --version      # 9+

# PostgreSQL client (for database operations)
psql --version     # 16+
```

---

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/RLRyals/MCP-Writing-Servers.git
cd MCP-Writing-Servers
```

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit configuration (IMPORTANT: Change passwords!)
nano .env
```

**Critical settings to update:**

```env
# Database credentials (CHANGE THESE!)
POSTGRES_PASSWORD=your_secure_password_here

# Authentication token (generate with: openssl rand -hex 32)
MCP_AUTH_TOKEN=your_secure_token_here

# Grafana admin credentials
GRAFANA_ADMIN_PASSWORD=your_grafana_password
```

### 3. Start Services

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

### 4. Verify Deployment

```bash
# Check health of all services
curl http://localhost:3001/health  # book-planning
curl http://localhost:3010/health  # database-admin

# Access monitoring
open http://localhost:3000  # Grafana (admin/admin)
open http://localhost:9090  # Prometheus
```

---

## Production Deployment

### Step 1: Pre-Deployment Checklist

#### Security

- [ ] Change all default passwords in `.env`
- [ ] Generate secure `MCP_AUTH_TOKEN` (32+ characters)
- [ ] Enable firewall rules
- [ ] Configure SSL/TLS certificates
- [ ] Set up VPN or IP whitelisting
- [ ] Enable audit logging

#### Database

- [ ] Database backups scheduled
- [ ] Backup storage configured with encryption
- [ ] Connection pooling tested (PgBouncer)
- [ ] Database indexes created
- [ ] Performance tuning applied

#### Infrastructure

- [ ] Sufficient disk space (20GB+)
- [ ] Memory allocated (8GB+ recommended)
- [ ] Docker resource limits configured
- [ ] Log rotation enabled
- [ ] Monitoring alerts configured

### Step 2: Staging Deployment

```bash
# Deploy to staging environment
export NODE_ENV=staging
docker-compose -f docker-compose.yml -f docker-compose.staging.yml up -d

# Run integration tests
npm run test:integration

# Perform load testing
npm run test:load

# Monitor for 24 hours
docker-compose logs -f --tail=100
```

### Step 3: Production Deployment

```bash
# Set production environment
export NODE_ENV=production

# Pull latest images
docker-compose pull

# Build services
docker-compose build --no-cache

# Start services with rolling restart
docker-compose up -d --no-deps --build mcp-servers

# Verify all services healthy
./scripts/health-check.sh
```

### Step 4: Post-Deployment Verification

```bash
# Check all services are up
docker-compose ps

# Verify database connectivity
docker-compose exec mcp-servers node -e "require('./src/shared/database.js')"

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Verify Grafana dashboards
curl http://localhost:3000/api/health

# Run smoke tests
npm run test:smoke
```

---

## Monitoring & Observability

### Health Endpoints

All servers expose `/health` endpoints:

```bash
# Individual server health
curl http://localhost:3001/health | jq

# Database admin health (critical)
curl http://localhost:3010/health | jq
```

**Health Response Format:**

```json
{
  "status": "healthy",
  "server": "database-admin",
  "database": {
    "healthy": true,
    "latency": "5ms",
    "activeConnections": 10
  },
  "activeSessions": 3,
  "timestamp": "2025-11-17T12:00:00.000Z",
  "uptime": {
    "seconds": 86400,
    "formatted": "1d 0h 0m 0s"
  },
  "metrics": {
    "requests": {
      "total": 10000,
      "errors": 5,
      "errorRate": "0.05%"
    },
    "latency": {
      "p50": 15,
      "p95": 45,
      "p99": 85
    }
  }
}
```

### Prometheus Metrics

Access Prometheus at `http://localhost:9090`

**Key Metrics:**

```promql
# Request rate
rate(mcp_requests_total[5m])

# Error rate
rate(mcp_errors_total[5m]) / rate(mcp_requests_total[5m])

# P95 latency
mcp_request_duration_ms{quantile="0.95"}

# Memory usage
mcp_memory_usage_bytes{type="used"}
```

### Grafana Dashboards

Access Grafana at `http://localhost:3000` (default: admin/admin)

**Available Dashboards:**

1. **MCP Overview** - System-wide metrics
2. **Database Performance** - PostgreSQL metrics
3. **Error Tracking** - Error rates and types
4. **Latency Analysis** - Request latency percentiles

### Structured Logging

All services use JSON logging for aggregation:

```bash
# View logs in JSON format
docker-compose logs mcp-servers | jq

# Filter by level
docker-compose logs mcp-servers | jq 'select(.level=="ERROR")'

# Filter by service
docker-compose logs mcp-servers | jq 'select(.service=="database-admin")'
```

---

## Health Checks

### Docker Health Checks

Docker automatically monitors service health:

```bash
# View health status
docker-compose ps

# Check specific service
docker inspect mcp-writing-servers | jq '.[0].State.Health'
```

### Manual Health Checks

```bash
# Script to check all services
#!/bin/bash
services=(3001 3002 3003 3004 3005 3006 3007 3008 3009 3010)
for port in "${services[@]}"; do
  echo "Checking port $port..."
  curl -f http://localhost:$port/health || echo "FAILED"
done
```

### Health Check Intervals

- **Interval**: 30 seconds
- **Timeout**: 10 seconds
- **Retries**: 3
- **Start Period**: 40 seconds

---

## Backup & Restore

### Automated Backups

Backups are stored in `/backups` volume:

```bash
# List backups
docker-compose exec mcp-servers ls -lh /backups

# Create manual backup
docker-compose exec mcp-servers node -e "
  const { DatabaseAdminMCPServer } = require('./src/mcps/database-admin-server');
  const server = new DatabaseAdminMCPServer();
  server.backupHandlers.handleBackupFull({});
"
```

### Restore from Backup

```bash
# List available backups
docker-compose exec mcp-servers ls /backups

# Restore specific backup
docker-compose exec mcp-servers node scripts/restore-backup.js \
  --file=/backups/full-backup-2025-11-17.sql.gz
```

### Backup Schedule

- **Full Backup**: Daily at 2 AM
- **Incremental**: Every 6 hours
- **Retention**: 30 days
- **Location**: `/backups` (mounted volume)

---

## Rollback Procedures

### Trigger Conditions

Rollback if:

- ✗ Error rate > 10% for 5 minutes
- ✗ P95 latency > 200ms for 10 minutes
- ✗ Critical service down for 2 minutes
- ✗ Database connection failures

### Rollback Steps

```bash
# 1. Stop current deployment
docker-compose down

# 2. Restore previous version
git checkout previous-release-tag
docker-compose pull

# 3. Restore database if needed
./scripts/restore-backup.sh latest-stable

# 4. Start services
docker-compose up -d

# 5. Verify health
./scripts/health-check.sh

# 6. Monitor for 30 minutes
docker-compose logs -f --tail=100
```

### Rollback Verification

```bash
# Check version
curl http://localhost:3001/info | jq '.version'

# Verify all services healthy
for port in {3001..3010}; do
  curl -f http://localhost:$port/health || echo "Port $port FAILED"
done
```

---

## Troubleshooting

### Common Issues

#### 1. Service Won't Start

```bash
# Check logs
docker-compose logs mcp-servers

# Check resource usage
docker stats

# Verify database connection
docker-compose exec postgres pg_isready -U writer

# Restart specific service
docker-compose restart mcp-servers
```

#### 2. High Memory Usage

```bash
# Check memory per service
docker stats --no-stream

# Adjust resource limits in docker-compose.yml
services:
  mcp-servers:
    mem_limit: 2g
    mem_reservation: 1g
```

#### 3. Database Connection Issues

```bash
# Check PgBouncer
docker-compose logs pgbouncer

# Test direct PostgreSQL connection
docker-compose exec postgres psql -U writer -d mcp_series

# Verify connection pool
docker-compose exec pgbouncer psql -p 6432 -U writer -d pgbouncer -c "SHOW POOLS;"
```

#### 4. Monitoring Not Working

```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets | jq

# Restart Prometheus
docker-compose restart prometheus

# Check Grafana data source
curl http://localhost:3000/api/datasources
```

### Performance Tuning

#### PostgreSQL Optimization

```sql
-- Increase shared buffers
ALTER SYSTEM SET shared_buffers = '512MB';

-- Optimize checkpoint
ALTER SYSTEM SET checkpoint_completion_target = 0.9;

-- Reload configuration
SELECT pg_reload_conf();
```

#### PgBouncer Tuning

Edit `docker-compose.yml`:

```yaml
pgbouncer:
  environment:
    PGBOUNCER_DEFAULT_POOL_SIZE: 50
    PGBOUNCER_MAX_CLIENT_CONN: 2000
```

### Log Analysis

```bash
# Find errors in last hour
docker-compose logs --since 1h mcp-servers | grep ERROR

# Count errors by type
docker-compose logs mcp-servers | jq 'select(.level=="ERROR") | .error.name' | sort | uniq -c

# Track latency trends
docker-compose logs mcp-servers | jq 'select(.durationMs) | .durationMs' | sort -n
```

---

## Maintenance Windows

### Planned Maintenance

```bash
# 1. Announce maintenance (30 minutes before)
echo "Maintenance starting in 30 minutes" > /var/www/maintenance.html

# 2. Stop accepting new connections
docker-compose exec mcp-servers killall -USR1 node

# 3. Wait for active connections to drain (5-10 minutes)
watch 'curl -s http://localhost:3001/health | jq .activeSessions'

# 4. Perform maintenance
docker-compose down
# ... maintenance tasks ...
docker-compose up -d

# 5. Verify health
./scripts/health-check.sh

# 6. Clear maintenance notice
rm /var/www/maintenance.html
```

### Zero-Downtime Updates

```bash
# Use Docker's rolling update strategy
docker-compose up -d --no-deps --scale mcp-servers=2 mcp-servers
docker-compose up -d --no-deps --scale mcp-servers=1 mcp-servers
```

---

## Security Best Practices

1. **Credentials**: Never commit `.env` to version control
2. **Firewall**: Restrict ports 3001-3010 to internal network
3. **SSL/TLS**: Use HTTPS in production
4. **Backups**: Encrypt backup files
5. **Audit Logs**: Enable and monitor regularly
6. **Updates**: Keep dependencies and Docker images up-to-date

---

## Support & Resources

- **Documentation**: [docs/](./docs/)
- **API Reference**: [API-REFERENCE.md](./API-REFERENCE.md)
- **Security Guide**: [SECURITY-GUIDE.md](./SECURITY-GUIDE.md)
- **GitHub Issues**: https://github.com/RLRyals/MCP-Writing-Servers/issues

---

## Appendix: Environment Variables

### Required Variables

```env
DATABASE_URL=postgresql://user:pass@host:port/dbname
NODE_ENV=production
MCP_AUTH_TOKEN=your-secure-token
```

### Optional Variables

```env
LOG_LEVEL=info              # debug, info, warn, error
LOG_FORMAT=json             # json, text
POSTGRES_SHARED_BUFFERS=256MB
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin
```

---

## Success Criteria (Phase 7)

- [x] All 10 servers deployed and healthy
- [x] Database connection pooling configured
- [x] Health checks passing on all services
- [x] Prometheus scraping all targets
- [x] Grafana dashboards displaying metrics
- [x] P95 latency < 100ms
- [x] Error rate < 5%
- [x] Backup system operational
- [x] Rollback procedures documented
- [x] Monitoring alerts configured

**Deployment Status**: ✅ Ready for Production
