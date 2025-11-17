# Database Admin Server - Security Guide

Comprehensive security documentation and best practices

---

## Table of Contents

1. [Security Architecture](#security-architecture)
2. [Authentication & Authorization](#authentication--authorization)
3. [SQL Injection Prevention](#sql-injection-prevention)
4. [Data Validation](#data-validation)
5. [Audit Logging](#audit-logging)
6. [Backup Security](#backup-security)
7. [Network Security](#network-security)
8. [Compliance](#compliance)
9. [Security Checklist](#security-checklist)

---

## Security Architecture

### Multi-Layer Defense Strategy

The database admin server implements defense-in-depth with multiple security layers:

```
┌─────────────────────────────────────────────┐
│  Layer 1: Network Security                  │
│  - TLS/SSL encryption                       │
│  - Firewall rules                           │
│  - IP whitelisting                          │
└─────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────┐
│  Layer 2: Authentication                     │
│  - API key validation                       │
│  - JWT token verification                   │
│  - Session management                       │
└─────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────┐
│  Layer 3: Authorization                      │
│  - Role-based access control                │
│  - Table-level permissions                  │
│  - Operation-level checks                   │
└─────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────┐
│  Layer 4: Input Validation                   │
│  - Whitelisting (tables, columns)           │
│  - SQL injection prevention                 │
│  - Data type validation                     │
│  - Range checking                           │
└─────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────┐
│  Layer 5: Database Security                  │
│  - Parameterized queries                    │
│  - Least privilege principle                │
│  - Foreign key constraints                  │
│  - Read-only tables                         │
└─────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────┐
│  Layer 6: Audit & Monitoring                │
│  - Comprehensive audit logging              │
│  - Real-time alerting                       │
│  - Anomaly detection                        │
│  - Security event tracking                  │
└─────────────────────────────────────────────┘
```

---

## Authentication & Authorization

### Database User Roles

```sql
-- Read-only user (minimum permissions)
CREATE USER readonly_user WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE writing_server TO readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;

-- Application user (CRUD operations)
CREATE USER app_user WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE writing_server TO app_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT DELETE ON specific_tables TO app_user;

-- Admin user (full access)
CREATE USER admin_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE writing_server TO admin_user;
```

### Environment Variables Security

```bash
# .env file (NEVER commit to git!)
DATABASE_URL=postgresql://user:pass@host:5432/db

# Use strong passwords
# Minimum 16 characters, mix of uppercase, lowercase, numbers, symbols
DATABASE_PASSWORD=$(openssl rand -base64 32)

# Restrict file permissions
chmod 600 .env
```

### API Key Management

```javascript
// Generate secure API keys
const crypto = require('crypto');
const apiKey = crypto.randomBytes(32).toString('hex');

// Store hashed versions
const hash = crypto
  .createHash('sha256')
  .update(apiKey)
  .digest('hex');

// Validate on each request
function validateApiKey(providedKey) {
  const providedHash = crypto
    .createHash('sha256')
    .update(providedKey)
    .digest('hex');

  return providedHash === storedHash;
}
```

---

## SQL Injection Prevention

### 100% Parameterized Queries

**❌ NEVER do this (vulnerable):**
```javascript
const query = `SELECT * FROM books WHERE title = '${userInput}'`;
// Vulnerable to: ' OR '1'='1' --
```

**✅ ALWAYS do this (safe):**
```javascript
const query = 'SELECT * FROM books WHERE title = $1';
const values = [userInput];
await db.query(query, values);
```

### How We Prevent SQL Injection

#### 1. Identifier Whitelisting

```javascript
// SecurityValidator.js
export const WHITELIST = {
  authors: ['id', 'name', 'email', 'bio', 'created_at'],
  books: ['id', 'title', 'author_id', 'genre', 'status'],
  // ... only pre-approved tables and columns
};

// Reject any non-whitelisted table/column
if (!WHITELIST[table]) {
  throw new Error('Table not whitelisted');
}
```

#### 2. Pattern Validation

```javascript
// Only allow safe characters in identifiers
const SAFE_PATTERN = /^[a-z_][a-z0-9_]*$/;

function validateIdentifier(name) {
  if (!SAFE_PATTERN.test(name)) {
    throw new Error('Invalid identifier format');
  }
}
```

#### 3. Operator Whitelisting

```javascript
const ALLOWED_OPERATORS = [
  '=', '$gt', '$gte', '$lt', '$lte', '$ne',
  '$like', '$ilike', '$in', '$null'
];

function validateOperator(op) {
  if (!ALLOWED_OPERATORS.includes(op)) {
    throw new Error('Operator not allowed');
  }
}
```

#### 4. Query Builder with Parameterization

```javascript
// QueryBuilder.js - ALWAYS uses $1, $2 placeholders
buildSelectQuery(table, columns, where) {
  const params = [];
  let paramCount = 1;

  let sql = `SELECT ${this.buildColumnList(columns)} FROM ${table}`;

  if (where) {
    const { clause, values } = this.buildWhereClause(where, paramCount);
    sql += ` WHERE ${clause}`;
    params.push(...values);
  }

  return { sql, params };
}
```

### Common Attack Patterns Blocked

| Attack Pattern | Blocked By |
|----------------|------------|
| `'; DROP TABLE users--` | Identifier whitelisting |
| `OR 1=1--` | Parameterized queries |
| `UNION SELECT password FROM users` | Parameterized queries |
| `admin'--` | Parameterized queries |
| `' OR ''='` | Parameterized queries |
| `../../../etc/passwd` | Path validation (backups) |
| `<script>alert('xss')</script>` | Input sanitization |
| `${malicious}` | No string interpolation |

---

## Data Validation

### Input Validation Rules

#### 1. Type Validation

```javascript
// ValidationUtils.js
validateDataType(value, expectedType) {
  switch (expectedType) {
    case 'integer':
      if (!Number.isInteger(value)) {
        throw new Error('Value must be an integer');
      }
      break;

    case 'character varying':
      if (typeof value !== 'string') {
        throw new Error('Value must be a string');
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new Error('Value must be a boolean');
      }
      break;

    case 'timestamp':
      if (!(value instanceof Date) && isNaN(Date.parse(value))) {
        throw new Error('Invalid timestamp');
      }
      break;
  }
}
```

#### 2. Range Validation

```javascript
// Pagination limits
if (limit < 1 || limit > 1000) {
  throw new Error('Limit must be between 1 and 1000');
}

if (offset < 0) {
  throw new Error('Offset must be non-negative');
}

// Batch size limits
if (records.length < 1 || records.length > 1000) {
  throw new Error('Batch size must be between 1 and 1000');
}
```

#### 3. Foreign Key Validation

```javascript
// Validate foreign key exists before insert
async validateForeignKey(table, column, value) {
  const refTable = this.getForeignKeyTable(table, column);
  const result = await this.db.query(
    'SELECT 1 FROM ' + refTable + ' WHERE id = $1',
    [value]
  );

  if (result.rows.length === 0) {
    throw new Error(`Referenced ${refTable} with id ${value} not found`);
  }
}
```

#### 4. Required Field Validation

```javascript
async validateRequiredFields(table, data) {
  const schema = await this.getTableSchema(table);
  const required = schema.columns.filter(col =>
    !col.nullable && col.default === null
  );

  for (const col of required) {
    if (!(col.name in data)) {
      throw new Error(`Required field missing: ${col.name}`);
    }
  }
}
```

---

## Audit Logging

### What Gets Logged

Every operation is logged with:

```javascript
{
  id: 12345,
  timestamp: "2024-01-15T10:30:00Z",
  operation: "INSERT",
  table_name: "books",
  record_id: "123",
  user_id: "user-456",
  success: true,
  execution_time_ms: 12,
  changes: {
    title: "New Book",
    author_id: 1,
    status: "draft"
  },
  ip_address: "192.168.1.100",
  user_agent: "MCP-Client/1.0"
}
```

### Audit Log Queries

**Check for suspicious activity:**

```sql
-- Failed operations in last hour
SELECT * FROM audit_logs
WHERE success = false
AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC;

-- Unusual number of deletes
SELECT user_id, COUNT(*) as delete_count
FROM audit_logs
WHERE operation = 'DELETE'
AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY user_id
HAVING COUNT(*) > 100;

-- Access to sensitive tables
SELECT user_id, operation, timestamp
FROM audit_logs
WHERE table_name IN ('users', 'permissions', 'api_keys')
ORDER BY timestamp DESC;
```

### Audit Log Retention

```sql
-- Create archive table for old logs
CREATE TABLE audit_logs_archive AS
SELECT * FROM audit_logs
WHERE timestamp < NOW() - INTERVAL '1 year';

-- Delete archived logs
DELETE FROM audit_logs
WHERE timestamp < NOW() - INTERVAL '1 year';

-- Or use partitioning for automatic management
CREATE TABLE audit_logs_2024_q1 PARTITION OF audit_logs
FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');
```

### Compliance Requirements

| Regulation | Requirement | Implementation |
|------------|-------------|----------------|
| GDPR | 6-year retention | Archive after 6 years |
| HIPAA | 6-year retention | Archive after 6 years |
| SOX | 7-year retention | Archive after 7 years |
| PCI DSS | 90-day immediate access | Keep 90 days in main table |

---

## Backup Security

### Secure Backup Practices

#### 1. Encrypt Backups

```bash
# Encrypt backup file
openssl enc -aes-256-cbc -salt \
  -in backup.sql \
  -out backup.sql.enc \
  -pass pass:$BACKUP_PASSWORD

# Decrypt backup file
openssl enc -aes-256-cbc -d \
  -in backup.sql.enc \
  -out backup.sql \
  -pass pass:$BACKUP_PASSWORD
```

#### 2. Secure Backup Storage

```javascript
// StorageManager.js
validateBackupPath(path) {
  // Prevent directory traversal
  if (path.includes('..')) {
    throw new Error('Invalid path: directory traversal not allowed');
  }

  // Restrict to backup directory
  const fullPath = join(BACKUP_DIR, path);
  if (!fullPath.startsWith(BACKUP_DIR)) {
    throw new Error('Path must be within backup directory');
  }

  return fullPath;
}
```

#### 3. Backup Access Control

```bash
# Restrict backup file permissions
chmod 600 backups/*.sql.gz
chown backup_user:backup_group backups/

# Backup directory permissions
chmod 700 backups/
```

#### 4. Offsite Backups

```bash
# Sync to secure offsite location
rsync -avz --delete \
  -e "ssh -i /path/to/key" \
  backups/ \
  backup@offsite.server:/secure/backups/

# Or use cloud storage with encryption
aws s3 cp backup.sql.gz \
  s3://secure-bucket/backups/ \
  --sse AES256
```

### Backup Integrity Verification

```javascript
// Generate checksum
const crypto = require('crypto');
const fs = require('fs');

function generateChecksum(file) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(file);
  hash.update(data);
  return hash.digest('hex');
}

// Verify checksum
function verifyChecksum(file, expectedChecksum) {
  const actualChecksum = generateChecksum(file);
  if (actualChecksum !== expectedChecksum) {
    throw new Error('Backup integrity check failed!');
  }
  return true;
}
```

---

## Network Security

### TLS/SSL Configuration

```javascript
// server.js
import https from 'https';
import fs from 'fs';

const options = {
  key: fs.readFileSync('path/to/private-key.pem'),
  cert: fs.readFileSync('path/to/certificate.pem'),
  ca: fs.readFileSync('path/to/ca-cert.pem'),

  // Security options
  minVersion: 'TLSv1.2',
  ciphers: 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',
  honorCipherOrder: true,
  requestCert: true,
  rejectUnauthorized: true
};

https.createServer(options, app).listen(443);
```

### Database Connection Security

```bash
# PostgreSQL connection with SSL
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

# With certificate verification
DATABASE_URL=postgresql://user:pass@host:5432/db?\
sslmode=verify-full&\
sslrootcert=/path/to/ca-cert.pem&\
sslcert=/path/to/client-cert.pem&\
sslkey=/path/to/client-key.pem
```

### Firewall Rules

```bash
# Allow only necessary ports
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp  # SSH
ufw allow 443/tcp # HTTPS
ufw enable

# Restrict database access to application server
ufw allow from 192.168.1.10 to any port 5432
```

---

## Compliance

### GDPR Compliance

#### Right to be Forgotten

```javascript
// Permanently delete user data
async function deleteUserData(userId) {
  // 1. Backup before deletion
  await db.backupTable({ table: 'users' });

  // 2. Delete user records
  await db.deleteRecords({
    table: 'users',
    where: { id: userId },
    hard: true
  });

  // 3. Log the deletion
  await audit.log({
    operation: 'GDPR_DELETE',
    user_id: userId,
    reason: 'Right to be forgotten'
  });
}
```

#### Data Export

```javascript
// Export user data (GDPR data portability)
async function exportUserData(userId) {
  const data = {};

  // Export from all relevant tables
  data.user = await db.query({ table: 'users', where: { id: userId } });
  data.books = await db.query({ table: 'books', where: { author_id: userId } });
  data.sessions = await db.query({ table: 'sessions', where: { user_id: userId } });

  // Export as JSON
  await db.exportJson({
    data: JSON.stringify(data, null, 2),
    filename: `user_${userId}_data_export.json`
  });
}
```

### PCI DSS Compliance

#### Encryption at Rest

```sql
-- Enable PostgreSQL encryption
ALTER DATABASE writing_server SET default_tablespace = encrypted_tablespace;

-- Encrypt sensitive columns
CREATE EXTENSION pgcrypto;

UPDATE users
SET credit_card = pgp_sym_encrypt(credit_card, 'encryption_key')
WHERE credit_card IS NOT NULL;
```

#### Access Logging

```sql
-- Log all access to payment data
CREATE TABLE payment_access_log (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50),
  accessed_at TIMESTAMP DEFAULT NOW(),
  ip_address INET,
  action VARCHAR(50)
);
```

---

## Security Checklist

### Development Phase

- [ ] All database queries use parameterized statements
- [ ] Input validation for all user inputs
- [ ] No sensitive data in source code or logs
- [ ] Environment variables for configuration
- [ ] Dependency vulnerability scanning
- [ ] Code review for security issues
- [ ] Unit tests for security functions

### Deployment Phase

- [ ] TLS/SSL certificates installed and configured
- [ ] Database connections use SSL
- [ ] Strong passwords for all accounts
- [ ] File permissions properly set (600 for sensitive files)
- [ ] Firewall rules configured
- [ ] Backup encryption enabled
- [ ] Audit logging enabled
- [ ] Monitoring and alerting configured

### Operations Phase

- [ ] Regular security updates
- [ ] Backup verification (weekly)
- [ ] Audit log review (daily)
- [ ] Access review (monthly)
- [ ] Penetration testing (annually)
- [ ] Incident response plan documented
- [ ] Security training for team

### Monitoring

- [ ] Failed login attempts
- [ ] Unusual query patterns
- [ ] High volume of deletions
- [ ] Access to sensitive tables
- [ ] Backup failures
- [ ] Certificate expiration
- [ ] Disk space usage

---

## Security Incident Response

### Step 1: Detect

```sql
-- Monitor for suspicious activity
SELECT user_id, operation, COUNT(*) as count
FROM audit_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
AND success = false
GROUP BY user_id, operation
HAVING COUNT(*) > 10;
```

### Step 2: Contain

```bash
# Immediately revoke access
psql -c "REVOKE ALL PRIVILEGES ON DATABASE writing_server FROM suspicious_user;"

# Block IP address
ufw deny from 192.168.1.100

# Disable API keys
```

### Step 3: Investigate

```sql
-- Review all actions by user
SELECT * FROM audit_logs
WHERE user_id = 'suspicious_user'
ORDER BY timestamp DESC;

-- Check for data modifications
SELECT * FROM audit_logs
WHERE operation IN ('UPDATE', 'DELETE', 'INSERT')
AND user_id = 'suspicious_user';
```

### Step 4: Recover

```bash
# Restore from backup if needed
node scripts/restore-backup.js --file backup_before_incident.sql.gz

# Verify data integrity
node scripts/verify-integrity.js
```

### Step 5: Post-Incident

- Document the incident
- Update security procedures
- Implement additional controls
- Train team on lessons learned
- Notify affected parties if required

---

## Best Practices Summary

1. **Always validate input** - Never trust user input
2. **Use parameterized queries** - 100% of the time
3. **Implement least privilege** - Users get minimum necessary permissions
4. **Enable audit logging** - Track all operations
5. **Encrypt sensitive data** - At rest and in transit
6. **Regular backups** - Automated, tested, and encrypted
7. **Monitor continuously** - Real-time alerting for suspicious activity
8. **Keep software updated** - Regular security patches
9. **Security training** - Educate all team members
10. **Incident response plan** - Document and practice

---

**For more information:**
- [API Reference](./API-REFERENCE.md)
- [Operations Guide](./OPERATIONS-GUIDE.md)
- [User Guides](./USER-GUIDES.md)
