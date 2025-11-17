# Database Admin Server - User Guides

Comprehensive guides for different user personas

---

## Table of Contents

1. [For Developers](#for-developers)
2. [For AI Agents](#for-ai-agents)
3. [For Operations Teams](#for-operations-teams)
4. [For Database Administrators](#for-database-administrators)
5. [For Application Users](#for-application-users)

---

## For Developers

### Getting Started

**1. Installation and Setup**

```bash
# Clone the repository
git clone https://github.com/RLRyals/MCP-Writing-Servers.git
cd MCP-Writing-Servers

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and set DATABASE_URL
```

**2. Database Configuration**

```env
DATABASE_URL=postgresql://username:password@localhost:5432/dbname
NODE_ENV=development
```

**3. Initialize Database Schema**

```bash
# Run initialization script
psql -U username -d dbname -f init.sql
```

**4. Start the Server**

```bash
# Start in MCP stdio mode
node server.js

# Or with specific server
MCP_SERVER=database-admin-server node server.js
```

### Common Development Tasks

#### Creating a New Book Record

```javascript
// Use db_insert_record tool
{
  table: "books",
  data: {
    title: "My New Novel",
    author_id: 1,
    genre: "fantasy",
    status: "draft",
    word_count: 0
  }
}
```

#### Querying Books by Status

```javascript
// Use db_query_records tool
{
  table: "books",
  columns: ["id", "title", "status", "word_count"],
  where: {
    status: "published",
    word_count: { $gte: 50000 }
  },
  orderBy: [
    { column: "created_at", direction: "DESC" }
  ],
  limit: 20
}
```

#### Batch Creating Characters

```javascript
// Use db_batch_insert tool
{
  table: "characters",
  records: [
    { name: "Alice", role: "protagonist", age: 28 },
    { name: "Bob", role: "antagonist", age: 35 },
    { name: "Charlie", role: "supporting", age: 42 }
  ],
  returnRecords: true
}
```

#### Inspecting Table Schema

```javascript
// Use db_get_schema tool
{
  table: "books"
}

// Returns detailed column information, constraints, indexes
```

#### Creating Daily Backups

```javascript
// Use db_backup_full tool
{
  compress: true,
  includeSchema: true
}

// Schedule with cron:
// 0 2 * * * node backup-script.js
```

### Development Best Practices

1. **Always Use Transactions for Related Operations**
   - Use batch operations for multiple records
   - Ensures data consistency

2. **Implement Proper Error Handling**
   ```javascript
   try {
     const result = await dbAdmin.insertRecord({
       table: "books",
       data: bookData
     });
   } catch (error) {
     if (error.code === 'FOREIGN_KEY_VIOLATION') {
       // Handle missing author
     }
   }
   ```

3. **Use Pagination for Large Result Sets**
   ```javascript
   // Good
   { table: "books", limit: 100, offset: 0 }

   // Bad
   { table: "books" } // Returns all records!
   ```

4. **Leverage Schema Introspection**
   ```javascript
   // Discover relationships before querying
   const relationships = await dbAdmin.getRelationships({
     table: "books",
     depth: 2
   });
   ```

5. **Monitor Audit Logs**
   ```javascript
   // Review recent operations
   const logs = await dbAdmin.queryAuditLogs({
     start_date: today,
     success: false, // Only failures
     limit: 50
   });
   ```

### Debugging Tips

**Enable Debug Logging:**
```bash
DEBUG=database:* node server.js
```

**Check Audit Logs for Operation History:**
```javascript
{
  table: "audit_logs",
  where: {
    table_name: "books",
    operation: "INSERT"
  },
  orderBy: [{ column: "timestamp", direction: "DESC" }],
  limit: 10
}
```

**Validate Data Before Insertion:**
```javascript
// Get column info first
const schema = await dbAdmin.getSchema({ table: "books" });
// Validate against schema before inserting
```

---

## For AI Agents

### Integration Guide

**1. Understanding MCP Protocol**

The Database Admin Server implements the Model Context Protocol (MCP) for AI-native database operations.

**2. Tool Discovery**

```javascript
// List all available tools
const tools = await mcpClient.listTools();

// Tools are organized by phase:
// - Phase 1: db_query_records, db_insert_record, db_update_records, db_delete_records
// - Phase 2: db_batch_insert, db_batch_update, db_batch_delete
// - Phase 3: db_get_schema, db_list_tables, db_get_relationships, db_list_table_columns
// - Phase 4: db_query_audit_logs, db_get_audit_summary
// - Phase 5: db_backup_full, db_restore_full, db_export_json, etc.
```

**3. Schema-Aware Operations**

AI agents should always inspect schema before operations:

```javascript
// Step 1: Discover available tables
const tables = await mcpClient.callTool("db_list_tables", {});

// Step 2: Inspect target table schema
const schema = await mcpClient.callTool("db_get_schema", {
  table: "books"
});

// Step 3: Understand relationships
const relationships = await mcpClient.callTool("db_get_relationships", {
  table: "books",
  depth: 1
});

// Step 4: Perform operation with validated data
const result = await mcpClient.callTool("db_insert_record", {
  table: "books",
  data: {
    title: "AI-Generated Story",
    author_id: validatedAuthorId,
    // ... other fields from schema
  }
});
```

### AI Agent Workflows

#### Workflow 1: Creating a Complete Book Entry

```javascript
async function createBookEntry(aiAgent, bookDetails) {
  // 1. Validate author exists
  const author = await aiAgent.callTool("db_query_records", {
    table: "authors",
    where: { id: bookDetails.authorId },
    limit: 1
  });

  if (author.count === 0) {
    throw new Error("Author not found");
  }

  // 2. Insert book record
  const book = await aiAgent.callTool("db_insert_record", {
    table: "books",
    data: {
      title: bookDetails.title,
      author_id: bookDetails.authorId,
      genre: bookDetails.genre,
      status: "draft"
    }
  });

  // 3. Create chapters (batch operation)
  if (bookDetails.chapters.length > 0) {
    const chapters = bookDetails.chapters.map((ch, idx) => ({
      book_id: book.id,
      chapter_number: idx + 1,
      title: ch.title,
      content: ch.content
    }));

    await aiAgent.callTool("db_batch_insert", {
      table: "chapters",
      records: chapters
    });
  }

  // 4. Log the operation
  await aiAgent.callTool("db_query_audit_logs", {
    table: "books",
    operation: "INSERT",
    limit: 1,
    orderBy: [{ column: "timestamp", direction: "DESC" }]
  });

  return book;
}
```

#### Workflow 2: Analyzing Story Structure

```javascript
async function analyzeStoryStructure(aiAgent, bookId) {
  // 1. Get book details
  const book = await aiAgent.callTool("db_query_records", {
    table: "books",
    where: { id: bookId }
  });

  // 2. Get all chapters
  const chapters = await aiAgent.callTool("db_query_records", {
    table: "chapters",
    where: { book_id: bookId },
    orderBy: [{ column: "chapter_number", direction: "ASC" }]
  });

  // 3. Get characters appearing in each chapter
  const characterAppearances = await aiAgent.callTool("db_query_records", {
    table: "character_scenes",
    where: {
      scene_id: { $in: chapters.records.map(ch => ch.id) }
    }
  });

  // 4. Analyze structure
  return {
    book: book.records[0],
    totalChapters: chapters.count,
    averageChapterLength: chapters.records.reduce((sum, ch) =>
      sum + (ch.word_count || 0), 0) / chapters.count,
    characterDistribution: analyzeCharacterDistribution(characterAppearances)
  };
}
```

#### Workflow 3: Maintaining Data Consistency

```javascript
async function archiveOldDrafts(aiAgent, olderThanDays = 90) {
  // 1. Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  // 2. Query old drafts
  const oldDrafts = await aiAgent.callTool("db_query_records", {
    table: "books",
    where: {
      status: "draft",
      created_at: { $lt: cutoffDate.toISOString() }
    },
    columns: ["id", "title", "created_at"]
  });

  // 3. Create backup before modification
  await aiAgent.callTool("db_backup_table", {
    table: "books",
    compress: true
  });

  // 4. Archive using batch update
  const updates = oldDrafts.records.map(book => ({
    data: { status: "archived" },
    where: { id: book.id }
  }));

  await aiAgent.callTool("db_batch_update", {
    table: "books",
    updates
  });

  // 5. Verify and audit
  const summary = await aiAgent.callTool("db_get_audit_summary", {
    table: "books",
    start_date: new Date().toISOString()
  });

  return {
    archived: oldDrafts.count,
    auditSummary: summary
  };
}
```

### Error Handling for AI Agents

```javascript
async function robustDatabaseOperation(aiAgent, operation) {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      attempt++;

      // Handle specific error types
      switch (error.code) {
        case 'FOREIGN_KEY_VIOLATION':
          // Fix missing referenced record
          await handleForeignKeyViolation(error);
          continue;

        case 'DUPLICATE_KEY':
          // Use update instead of insert
          return await updateExistingRecord(error);

        case 'TIMEOUT':
          // Reduce batch size or add delay
          await delay(1000 * attempt);
          continue;

        default:
          if (attempt === maxRetries) throw error;
      }
    }
  }
}
```

### Best Practices for AI Agents

1. **Always Inspect Schema First**: Understand table structure before operations
2. **Use Relationships**: Leverage `db_get_relationships` to maintain referential integrity
3. **Batch When Possible**: Use batch operations for multiple records
4. **Validate Before Insert**: Check foreign keys exist before inserting
5. **Monitor Audit Logs**: Track your operations for debugging
6. **Handle Errors Gracefully**: Implement retry logic with exponential backoff
7. **Use Soft Deletes**: Prefer soft deletes over hard deletes for data recovery
8. **Backup Before Major Changes**: Create backups before bulk operations

---

## For Operations Teams

### Deployment Guide

**1. Production Deployment**

```bash
# Set production environment
export NODE_ENV=production
export DATABASE_URL=postgresql://user:pass@prod-db:5432/dbname

# Use connection pooler (PgBouncer)
export DATABASE_URL=postgresql://user:pass@pgbouncer:6432/dbname

# Start with process manager
pm2 start server.js --name "mcp-db-admin"
pm2 save
```

**2. Monitoring Setup**

```bash
# Enable audit logging
# Already enabled by default - logs to audit_logs table

# Monitor logs
tail -f logs/database-admin.log

# Check server health
curl http://localhost:3000/health
```

**3. Backup Strategy**

```bash
# Daily full backup (cron: 0 2 * * *)
node scripts/backup-full.js

# Hourly incremental (cron: 0 * * * *)
node scripts/backup-incremental.js

# Weekly validation (cron: 0 3 * * 0)
node scripts/validate-backups.js
```

**4. Performance Tuning**

```sql
-- Add indexes for frequently queried columns
CREATE INDEX idx_books_author_id ON books(author_id);
CREATE INDEX idx_books_status ON books(status);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- Optimize PostgreSQL settings
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET work_mem = '64MB';
```

### Monitoring and Alerts

**Key Metrics to Monitor:**

1. **Database Performance**
   - Query execution time (target: < 50ms)
   - Connection pool usage
   - Lock contention

2. **Audit Metrics**
   ```javascript
   // Daily summary
   const summary = await db.getAuditSummary({
     start_date: todayStart,
     end_date: todayEnd
   });

   // Alert on high failure rate
   if (summary.successRate < 0.95) {
     alertOps("High failure rate: " + summary.successRate);
   }
   ```

3. **Backup Status**
   ```bash
   # Verify backups exist
   node scripts/check-backup-status.js

   # Alert if no backup in 24 hours
   ```

### Incident Response

**Scenario 1: Database Corruption**

```bash
# 1. Stop the application
pm2 stop mcp-db-admin

# 2. Create emergency backup
pg_dump dbname > emergency_backup.sql

# 3. Restore from last known good backup
node scripts/restore-backup.js --file backup_2024-01-15.sql.gz

# 4. Verify data integrity
node scripts/verify-integrity.js

# 5. Restart application
pm2 start mcp-db-admin
```

**Scenario 2: Performance Degradation**

```sql
-- Check for slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check table bloat
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Vacuum if needed
VACUUM ANALYZE;
```

**Scenario 3: Accidental Data Deletion**

```javascript
// 1. Check audit logs
const deletedRecords = await db.queryAuditLogs({
  operation: "DELETE",
  table: "books",
  start_date: incidentTime,
  limit: 1000
});

// 2. Restore from backup (table-specific)
await db.restoreTable({
  backupFile: "table_backup_books_yesterday.sql",
  table: "books"
});

// 3. Verify restoration
const restoredCount = await db.queryRecords({
  table: "books",
  where: { deleted_at: null }
});
```

---

## For Database Administrators

### Schema Management

**1. Understanding the Whitelist System**

The server restricts access to 29 whitelisted tables:

```javascript
// Core tables
- authors, series, books, chapters, scenes

// Character tables
- characters, character_arcs, character_relationships,
  character_timeline_events, character_knowledge

// World-building tables
- locations, world_elements, organizations

// Plot tables
- plot_threads, tropes

// Junction tables
- series_genres, book_genres, book_tropes, character_scenes

// Metadata tables (read-only)
- genres, lookup_values

// Operations tables
- writing_sessions, exports

// Audit table (read-only)
- audit_logs
```

**2. Adding New Tables to Whitelist**

```javascript
// Edit src/mcps/database-admin-server/utils/security-validator.js

export const WHITELIST = {
  // ... existing tables ...

  // Add new table
  new_table: [
    'id', 'name', 'description', 'created_at', 'updated_at'
  ]
};

// If table supports soft delete, add to:
export const SOFT_DELETE_TABLES = [
  // ... existing tables ...
  'new_table'
];

// If table is read-only, add to:
export const READ_ONLY_TABLES = [
  // ... existing tables ...
  'new_table'
];
```

**3. Database Maintenance**

```sql
-- Regular maintenance tasks

-- Analyze tables for query planner
ANALYZE;

-- Vacuum to reclaim space
VACUUM;

-- Reindex if needed
REINDEX DATABASE dbname;

-- Update statistics
ANALYZE VERBOSE;

-- Check for missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
AND correlation < 0.1
ORDER BY n_distinct DESC;
```

**4. Audit Log Management**

```sql
-- Archive old audit logs (older than 1 year)
CREATE TABLE audit_logs_archive AS
SELECT * FROM audit_logs
WHERE timestamp < NOW() - INTERVAL '1 year';

DELETE FROM audit_logs
WHERE timestamp < NOW() - INTERVAL '1 year';

-- Partition audit logs for better performance
CREATE TABLE audit_logs_2024_q1 PARTITION OF audit_logs
FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');
```

### Security Administration

**1. User Permissions**

```sql
-- Create read-only user
CREATE USER readonly_user WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE dbname TO readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;

-- Create application user with limited permissions
CREATE USER app_user WITH PASSWORD 'secure_password';
GRANT SELECT, INSERT, UPDATE ON specific_tables TO app_user;

-- Revoke dangerous permissions
REVOKE DROP ON ALL TABLES IN SCHEMA public FROM app_user;
```

**2. Monitoring Security Events**

```sql
-- Check failed operations
SELECT timestamp, operation, table_name, error_message, user_id
FROM audit_logs
WHERE success = false
AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- Detect unusual activity
SELECT user_id, operation, COUNT(*) as count
FROM audit_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY user_id, operation
HAVING COUNT(*) > 100;
```

**3. Backup and Recovery**

```bash
# Full database backup (compressed)
pg_dump -Fc dbname > backup_$(date +%Y%m%d).dump

# Restore from compressed backup
pg_restore -d dbname backup_20240115.dump

# Point-in-time recovery setup
# Enable WAL archiving in postgresql.conf:
# wal_level = replica
# archive_mode = on
# archive_command = 'cp %p /backup/wal/%f'
```

---

## For Application Users

### Using the API

**1. Basic Operations**

**Creating a New Book:**
```
Use the db_insert_record tool with:
- table: "books"
- data: your book information (title, author_id, genre, etc.)
```

**Finding Books:**
```
Use the db_query_records tool with:
- table: "books"
- where: filter conditions (e.g., status: "published")
- orderBy: sort by date or title
- limit: how many results you want
```

**Updating a Book:**
```
Use the db_update_records tool with:
- table: "books"
- data: fields to update (e.g., status: "published")
- where: which book to update (e.g., id: 123)
```

**2. Common Workflows**

**Workflow: Starting a New Book Project**

1. Create the author record (if new)
2. Create the book record
3. Create chapter outlines
4. Create character profiles
5. Link characters to chapters

**Workflow: Publishing a Book**

1. Update book status to "published"
2. Set published date
3. Export final version as JSON
4. Create backup of published version

**3. Understanding Results**

**Query Results Include:**
- `total`: Total matching records
- `count`: Records returned in this page
- `records`: Array of actual data
- `offset`: Starting position
- `limit`: Maximum records per page

**Insert Results Include:**
- All fields of the created record
- Auto-generated `id`
- Auto-set timestamps (`created_at`, `updated_at`)

**Update Results Include:**
- `updated`: Number of records updated
- `records`: Array of updated records with new values

### Tips and Tricks

1. **Use Filters Effectively**
   - Combine multiple conditions in `where` clause
   - Use operators like `$gte`, `$like` for flexible matching

2. **Pagination for Large Results**
   - Always set a `limit` to avoid overwhelming results
   - Use `offset` to navigate through pages

3. **Sort Results**
   - Use `orderBy` to control sort order
   - Can sort by multiple columns

4. **Backup Your Work**
   - Create backups before major changes
   - Export important data as JSON for safekeeping

---

**For more information, see:**
- [API Reference](./API-REFERENCE.md)
- [Code Examples](./EXAMPLES.md)
- [Tutorials](./TUTORIALS.md)
