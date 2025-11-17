# Database Admin Server - Operations & Migration Guide

Comprehensive guide for production operations and data migrations

---

## Table of Contents

1. [Production Deployment](#production-deployment)
2. [Monitoring & Alerting](#monitoring--alerting)
3. [Performance Optimization](#performance-optimization)
4. [Data Migration](#data-migration)
5. [Disaster Recovery](#disaster-recovery)
6. [Troubleshooting](#troubleshooting)
7. [Maintenance Procedures](#maintenance-procedures)

---

## Production Deployment

### Pre-Deployment Checklist

```bash
# 1. Environment Configuration
✓ DATABASE_URL configured with production credentials
✓ NODE_ENV=production
✓ SSL certificates installed
✓ Backup directory configured with sufficient space
✓ Log directory configured
✓ API keys generated and secured

# 2. Database Setup
✓ PostgreSQL 16+ installed
✓ Database created and initialized
✓ User roles and permissions configured
✓ SSL connections enabled
✓ Connection pooling configured (PgBouncer recommended)
✓ Indexes created for frequently queried columns
✓ Foreign key constraints verified

# 3. Security
✓ Firewall rules configured
✓ Audit logging enabled
✓ Backup encryption configured
✓ TLS/SSL certificates valid
✓ API authentication configured
✓ File permissions set (600 for sensitive files)

# 4. Monitoring
✓ Application monitoring configured
✓ Database monitoring configured
✓ Alert rules defined
✓ Log aggregation configured
✓ Health check endpoint responding
```

### Deployment Steps

#### 1. Initial Setup

```bash
# Clone repository
cd /opt/applications
git clone https://github.com/RLRyals/MCP-Writing-Servers.git
cd MCP-Writing-Servers

# Install dependencies
npm ci --production

# Configure environment
cp .env.example .env
nano .env  # Edit with production values
chmod 600 .env

# Initialize database
psql -U dbuser -d production_db -f init.sql
```

#### 2. Database Configuration

```sql
-- Create production database
CREATE DATABASE writing_server_prod;

-- Create users with appropriate permissions
CREATE USER app_user WITH PASSWORD 'secure_random_password';
GRANT CONNECT ON DATABASE writing_server_prod TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Enable SSL
ALTER SYSTEM SET ssl = on;
ALTER SYSTEM SET ssl_cert_file = '/path/to/server.crt';
ALTER SYSTEM SET ssl_key_file = '/path/to/server.key';
ALTER SYSTEM SET ssl_ca_file = '/path/to/ca.crt';

-- Performance tuning
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET work_mem = '64MB';
ALTER SYSTEM SET maintenance_work_mem = '128MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;

SELECT pg_reload_conf();
```

#### 3. Process Manager Setup (PM2)

```bash
# Install PM2 globally
npm install -g pm2

# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'mcp-db-admin',
    script: 'server.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    },
    error_file: 'logs/error.log',
    out_file: 'logs/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_memory_restart: '1G',
    autorestart: true,
    watch: false
  }]
};
EOF

# Start application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

#### 4. Reverse Proxy (Nginx)

```nginx
# /etc/nginx/sites-available/mcp-db-admin
upstream mcp_backend {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name db-admin.yourdomain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Request size limits
    client_max_body_size 100M;

    location / {
        proxy_pass http://mcp_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    location /health {
        access_log off;
        proxy_pass http://mcp_backend;
    }
}

# HTTP redirect to HTTPS
server {
    listen 80;
    server_name db-admin.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

```bash
# Enable site and reload nginx
ln -s /etc/nginx/sites-available/mcp-db-admin /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

## Monitoring & Alerting

### Application Monitoring

#### Health Check Endpoint

```javascript
// server.js
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await db.query('SELECT 1');

    // Check disk space
    const diskSpace = await checkDiskSpace();

    // Check backup status
    const lastBackup = await getLastBackupTime();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      diskSpace: diskSpace,
      lastBackup: lastBackup
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

#### Performance Metrics

```bash
# Install monitoring tools
npm install prom-client

# Create metrics endpoint
cat > metrics.js << 'EOF'
import promClient from 'prom-client';

const register = new promClient.Registry();

// Default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
const queryDuration = new promClient.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation', 'table'],
  registers: [register]
});

const queryErrors = new promClient.Counter({
  name: 'db_query_errors_total',
  help: 'Total number of database query errors',
  labelNames: ['operation', 'table', 'error_type'],
  registers: [register]
});

export { register, queryDuration, queryErrors };
EOF
```

### Database Monitoring

```sql
-- Create monitoring views

-- Slow queries
CREATE VIEW slow_queries AS
SELECT query, mean_exec_time, calls, total_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC;

-- Table sizes
CREATE VIEW table_sizes AS
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Active connections
CREATE VIEW active_connections AS
SELECT
    datname,
    COUNT(*) as connections,
    COUNT(*) FILTER (WHERE state = 'active') as active,
    COUNT(*) FILTER (WHERE state = 'idle') as idle
FROM pg_stat_activity
GROUP BY datname;

-- Lock monitoring
CREATE VIEW current_locks AS
SELECT
    pg_stat_activity.pid,
    pg_stat_activity.query,
    pg_locks.mode,
    pg_locks.granted
FROM pg_locks
JOIN pg_stat_activity ON pg_locks.pid = pg_stat_activity.pid
WHERE NOT pg_locks.granted;
```

### Alert Configuration

```yaml
# alertmanager.yml
groups:
  - name: database_alerts
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: rate(db_query_errors_total[5m]) > 0.1
        for: 5m
        annotations:
          summary: "High database error rate"
          description: "Error rate is {{ $value }} errors/sec"

      # Slow queries
      - alert: SlowQueries
        expr: histogram_quantile(0.95, db_query_duration_seconds) > 1
        for: 10m
        annotations:
          summary: "Slow database queries detected"
          description: "95th percentile query time is {{ $value }}s"

      # Disk space
      - alert: LowDiskSpace
        expr: node_filesystem_free_bytes{mountpoint="/backup"} < 10737418240
        annotations:
          summary: "Low backup disk space"
          description: "Less than 10GB free"

      # Backup failure
      - alert: BackupFailure
        expr: time() - last_successful_backup_timestamp > 86400
        annotations:
          summary: "No successful backup in 24 hours"

      # High connection count
      - alert: HighConnectionCount
        expr: pg_stat_database_numbackends > 80
        annotations:
          summary: "High number of database connections"
          description: "{{ $value }} active connections"
```

---

## Performance Optimization

### Indexing Strategy

```sql
-- Primary indexes (automatically created with constraints)
-- id columns have PRIMARY KEY indexes

-- Foreign key indexes (highly recommended)
CREATE INDEX idx_books_author_id ON books(author_id);
CREATE INDEX idx_chapters_book_id ON chapters(book_id);
CREATE INDEX idx_characters_created_by ON characters(created_by);
CREATE INDEX idx_character_scenes_character_id ON character_scenes(character_id);
CREATE INDEX idx_character_scenes_scene_id ON character_scenes(scene_id);

-- Query filter indexes
CREATE INDEX idx_books_status ON books(status) WHERE status IN ('draft', 'published');
CREATE INDEX idx_books_genre ON books(genre);
CREATE INDEX idx_characters_role ON characters(role);

-- Timestamp indexes for audit and filtering
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_books_created_at ON books(created_at DESC);
CREATE INDEX idx_books_published_at ON books(published_at DESC) WHERE published_at IS NOT NULL;

-- Composite indexes for common queries
CREATE INDEX idx_books_author_status ON books(author_id, status);
CREATE INDEX idx_chapters_book_chapter ON chapters(book_id, chapter_number);

-- Text search indexes
CREATE INDEX idx_books_title_trgm ON books USING gin(title gin_trgm_ops);
CREATE INDEX idx_authors_name_trgm ON authors USING gin(name gin_trgm_ops);

-- Partial indexes for soft-delete tables
CREATE INDEX idx_books_active ON books(id) WHERE deleted_at IS NULL;
CREATE INDEX idx_characters_active ON characters(id) WHERE deleted_at IS NULL;
```

### Query Optimization

```sql
-- Analyze table statistics
ANALYZE VERBOSE;

-- Update planner statistics for specific tables
ANALYZE books;
ANALYZE characters;
ANALYZE audit_logs;

-- Check for missing indexes
SELECT
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation
FROM pg_stats
WHERE schemaname = 'public'
AND correlation < 0.1
AND n_distinct > 100
ORDER BY n_distinct DESC;

-- Identify unused indexes
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Connection Pooling

```bash
# Install PgBouncer
apt-get install pgbouncer

# Configure PgBouncer
cat > /etc/pgbouncer/pgbouncer.ini << 'EOF'
[databases]
writing_server_prod = host=localhost port=5432 dbname=writing_server_prod

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 3
max_db_connections = 100
max_user_connections = 100
server_idle_timeout = 600
server_lifetime = 3600
server_connect_timeout = 15
query_timeout = 0
EOF

# Update application to use PgBouncer
DATABASE_URL=postgresql://user:pass@localhost:6432/writing_server_prod
```

### Caching Strategy

```javascript
// Implement schema caching
class SchemaCache {
  constructor() {
    this.cache = new Map();
    this.ttl = 3600000; // 1 hour
  }

  async getSchema(table) {
    const cached = this.cache.get(table);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.schema;
    }

    const schema = await this.fetchSchema(table);
    this.cache.set(table, {
      schema,
      timestamp: Date.now()
    });

    return schema;
  }

  invalidate(table) {
    this.cache.delete(table);
  }

  clear() {
    this.cache.clear();
  }
}
```

---

## Data Migration

### Migration Planning

#### Pre-Migration Checklist

```bash
✓ Full backup of source database created
✓ Full backup of target database created
✓ Migration scripts tested in staging
✓ Rollback plan documented
✓ Downtime window scheduled and communicated
✓ Data validation queries prepared
✓ Performance baselines captured
✓ Team notified and on standby
```

### Migration Strategies

#### Strategy 1: Full Export/Import (Downtime Required)

```bash
#!/bin/bash
# Full migration with downtime

# 1. Backup source database
echo "Creating backup..."
node scripts/backup-full.js

# 2. Stop application
pm2 stop mcp-db-admin

# 3. Export data
echo "Exporting data..."
pg_dump -Fc source_db > migration_export.dump

# 4. Import to target
echo "Importing data..."
pg_restore -d target_db migration_export.dump

# 5. Verify data
echo "Verifying data..."
node scripts/verify-migration.js

# 6. Update configuration
echo "Updating configuration..."
sed -i 's/source_db/target_db/' .env

# 7. Restart application
pm2 start mcp-db-admin

echo "Migration complete!"
```

#### Strategy 2: Incremental Migration (Minimal Downtime)

```javascript
// Incremental migration script
async function incrementalMigration() {
  const tables = [
    'authors',
    'series',
    'books',
    'chapters',
    'characters'
    // ... all tables in dependency order
  ];

  for (const table of tables) {
    console.log(`Migrating ${table}...`);

    // Export from source
    const data = await sourceDb.exportJson({
      table,
      pretty: false
    });

    // Import to target
    await targetDb.importJson({
      table,
      data,
      mode: 'insert'
    });

    // Verify counts
    const sourceCount = await sourceDb.query({
      table,
      columns: ['COUNT(*)']
    });

    const targetCount = await targetDb.query({
      table,
      columns: ['COUNT(*)']
    });

    console.log(`${table}: ${sourceCount} -> ${targetCount}`);

    if (sourceCount !== targetCount) {
      throw new Error(`Migration verification failed for ${table}`);
    }
  }

  console.log('Migration complete!');
}
```

#### Strategy 3: Live Migration (Zero Downtime)

```javascript
// Dual-write pattern for zero-downtime migration
class DualWriteProxy {
  constructor(primaryDb, secondaryDb) {
    this.primary = primaryDb;
    this.secondary = secondaryDb;
    this.readFrom = 'primary'; // or 'secondary'
  }

  async insert(params) {
    // Write to primary
    const primaryResult = await this.primary.insert(params);

    // Asynchronously write to secondary
    this.secondary.insert(params).catch(err => {
      console.error('Secondary write failed:', err);
      // Log for retry later
    });

    return primaryResult;
  }

  async query(params) {
    // Read from configured source
    return this.readFrom === 'primary'
      ? this.primary.query(params)
      : this.secondary.query(params);
  }

  switchReadSource() {
    this.readFrom = this.readFrom === 'primary' ? 'secondary' : 'primary';
    console.log(`Switched read source to: ${this.readFrom}`);
  }
}
```

### Data Validation

```javascript
// Comprehensive data validation
async function validateMigration(sourceDb, targetDb) {
  const tables = await sourceDb.listTables();

  const report = {
    tables: [],
    totalRows: { source: 0, target: 0 },
    mismatches: [],
    success: true
  };

  for (const table of tables) {
    console.log(`Validating ${table.name}...`);

    // Count comparison
    const sourceCount = await sourceDb.query({
      table: table.name,
      columns: ['COUNT(*) as count']
    });

    const targetCount = await targetDb.query({
      table: table.name,
      columns: ['COUNT(*) as count']
    });

    const match = sourceCount === targetCount;

    report.tables.push({
      table: table.name,
      sourceCount,
      targetCount,
      match
    });

    report.totalRows.source += sourceCount;
    report.totalRows.target += targetCount;

    if (!match) {
      report.success = false;
      report.mismatches.push(table.name);
    }

    // Sample data comparison
    const sourceSample = await sourceDb.query({
      table: table.name,
      limit: 10,
      orderBy: [{ column: 'id', direction: 'ASC' }]
    });

    const targetSample = await targetDb.query({
      table: table.name,
      limit: 10,
      orderBy: [{ column: 'id', direction: 'ASC' }]
    });

    // Compare samples
    // ... detailed comparison logic
  }

  console.log('Validation Report:');
  console.log(JSON.stringify(report, null, 2));

  return report;
}
```

---

## Disaster Recovery

### Recovery Time Objective (RTO) & Recovery Point Objective (RPO)

| Scenario | RTO | RPO | Strategy |
|----------|-----|-----|----------|
| Database corruption | 1 hour | 15 minutes | Restore from latest backup |
| Accidental deletion | 30 minutes | 0 (from audit logs) | Restore table or records |
| Hardware failure | 4 hours | 15 minutes | Failover to standby |
| Data center outage | 8 hours | 1 hour | Restore to alternate region |

### Backup Strategy

```bash
#!/bin/bash
# Comprehensive backup script

BACKUP_DIR="/backups"
RETENTION_DAYS=30

# Full backup daily at 2 AM
0 2 * * * /scripts/backup-full.sh

# Incremental backup every 4 hours
0 */4 * * * /scripts/backup-incremental.sh

# Transaction log backup every 15 minutes
*/15 * * * * /scripts/backup-wal.sh

# Cleanup old backups
0 3 * * * find $BACKUP_DIR -type f -mtime +$RETENTION_DAYS -delete
```

### Disaster Recovery Procedures

#### Procedure 1: Complete Database Restoration

```bash
#!/bin/bash
# Complete database restoration from backup

# 1. Stop application
echo "Stopping application..."
pm2 stop mcp-db-admin

# 2. List available backups
echo "Available backups:"
ls -lh /backups/backup_*.sql.gz

# 3. Validate backup
echo "Validating backup..."
node scripts/validate-backup.js --file backup_2024-01-15.sql.gz

# 4. Drop existing database (CAUTION!)
echo "Dropping existing database..."
dropdb writing_server_prod

# 5. Create new database
echo "Creating database..."
createdb writing_server_prod

# 6. Restore from backup
echo "Restoring from backup..."
gunzip -c /backups/backup_2024-01-15.sql.gz | psql writing_server_prod

# 7. Verify restoration
echo "Verifying data..."
psql writing_server_prod -c "SELECT COUNT(*) FROM books;"
psql writing_server_prod -c "SELECT COUNT(*) FROM authors;"

# 8. Restart application
echo "Restarting application..."
pm2 start mcp-db-admin

# 9. Verify application health
sleep 5
curl http://localhost:3000/health

echo "Recovery complete!"
```

#### Procedure 2: Point-in-Time Recovery

```bash
#!/bin/bash
# Point-in-time recovery using WAL logs

TARGET_TIME="2024-01-15 10:30:00"

# 1. Restore base backup
pg_restore -d writing_server_prod base_backup.dump

# 2. Configure recovery
cat > recovery.conf << EOF
restore_command = 'cp /wal_archive/%f %p'
recovery_target_time = '$TARGET_TIME'
recovery_target_action = 'promote'
EOF

# 3. Start recovery
pg_ctl start -D /var/lib/postgresql/data

# 4. Wait for recovery to complete
tail -f /var/log/postgresql/postgresql.log | grep -q "database system is ready"

echo "Point-in-time recovery complete!"
```

---

## Troubleshooting

### Common Issues

#### Issue 1: High Database CPU Usage

**Symptoms:**
- Database CPU > 80%
- Slow query responses
- Application timeouts

**Diagnosis:**
```sql
-- Find expensive queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time * calls DESC
LIMIT 10;

-- Check for missing indexes
SELECT schemaname, tablename, seq_scan, seq_tup_read, idx_scan
FROM pg_stat_user_tables
WHERE seq_scan > 1000
ORDER BY seq_tup_read DESC;
```

**Solution:**
```sql
-- Add missing indexes
CREATE INDEX idx_problematic_column ON table_name(column_name);

-- Analyze tables
ANALYZE table_name;

-- Optimize queries
-- Replace sequential scans with index scans
```

#### Issue 2: Connection Pool Exhaustion

**Symptoms:**
- "Too many connections" errors
- Application unable to connect
- Slow response times

**Diagnosis:**
```sql
-- Check active connections
SELECT COUNT(*), state
FROM pg_stat_activity
GROUP BY state;

-- Find long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;
```

**Solution:**
```bash
# Increase max connections (PostgreSQL)
ALTER SYSTEM SET max_connections = 200;
SELECT pg_reload_conf();

# Configure PgBouncer
pool_mode = transaction
default_pool_size = 25
max_client_conn = 1000

# Kill idle connections
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
AND state_change < NOW() - INTERVAL '10 minutes';
```

#### Issue 3: Slow Backups

**Symptoms:**
- Backup taking > 10 minutes
- Disk I/O saturation during backup
- Application slow during backup

**Solution:**
```bash
# Use parallel backup
pg_dump -Fd -j 4 -f backup_dir dbname

# Schedule during off-peak hours
0 2 * * * /scripts/backup.sh

# Use compression
pg_dump -Fc dbname | gzip > backup.sql.gz

# Exclude large tables from regular backups
pg_dump --exclude-table=audit_logs dbname
```

---

## Maintenance Procedures

### Daily Maintenance

```bash
#!/bin/bash
# Daily maintenance script

# Check backup status
echo "Checking backups..."
last_backup=$(ls -t /backups/backup_*.sql.gz | head -1)
backup_age=$(( ($(date +%s) - $(stat -c %Y "$last_backup")) / 3600 ))

if [ $backup_age -gt 24 ]; then
    echo "WARNING: Last backup is $backup_age hours old!"
fi

# Check disk space
echo "Checking disk space..."
df -h | grep -E '(backup|postgres)'

# Check audit log size
echo "Checking audit log size..."
psql -c "SELECT pg_size_pretty(pg_total_relation_size('audit_logs'));"

# Review failed operations
echo "Failed operations in last 24 hours:"
psql -c "SELECT COUNT(*) FROM audit_logs WHERE success = false AND timestamp > NOW() - INTERVAL '24 hours';"
```

### Weekly Maintenance

```bash
#!/bin/bash
# Weekly maintenance script

# Vacuum analyze all tables
echo "Running VACUUM ANALYZE..."
vacuumdb --all --analyze --verbose

# Reindex if needed
echo "Checking for bloated indexes..."
psql -c "SELECT schemaname, tablename, indexname FROM pg_indexes WHERE schemaname = 'public';" | while read line; do
    echo "Reindexing $line..."
done

# Update table statistics
echo "Updating statistics..."
psql -c "ANALYZE VERBOSE;"

# Archive old audit logs
echo "Archiving audit logs..."
psql -c "INSERT INTO audit_logs_archive SELECT * FROM audit_logs WHERE timestamp < NOW() - INTERVAL '90 days';"
psql -c "DELETE FROM audit_logs WHERE timestamp < NOW() - INTERVAL '90 days';"

# Validate all backups
echo "Validating backups..."
for backup in /backups/backup_*.sql.gz; do
    node scripts/validate-backup.js --file "$backup"
done
```

### Monthly Maintenance

```bash
#!/bin/bash
# Monthly maintenance script

# Full database analysis
echo "Running full analysis..."
psql -c "ANALYZE VERBOSE;"

# Check for table bloat
echo "Checking table bloat..."
psql -f scripts/check-bloat.sql

# Security audit
echo "Running security audit..."
psql -c "SELECT * FROM pg_roles WHERE rolsuper = true;"
psql -c "SELECT * FROM pg_stat_ssl;"

# Performance review
echo "Performance review..."
psql -c "SELECT * FROM pg_stat_database;"
psql -c "SELECT * FROM pg_stat_user_tables ORDER BY seq_scan DESC LIMIT 20;"

# Backup rotation
echo "Rotating old backups..."
find /backups -type f -mtime +90 -delete

# Generate monthly report
echo "Generating monthly report..."
node scripts/generate-monthly-report.js
```

---

**For more information:**
- [API Reference](./API-REFERENCE.md)
- [Security Guide](./SECURITY-GUIDE.md)
- [Tutorials](./TUTORIALS.md)
- [User Guides](./USER-GUIDES.md)
