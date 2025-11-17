# Database Admin Server - Comprehensive API Reference

Version: 1.0.0
Last Updated: 2024
Coverage: All 25 MCP Tools

---

## Table of Contents

1. [Phase 1: Core CRUD Operations](#phase-1-core-crud-operations)
2. [Phase 2: Batch Operations](#phase-2-batch-operations)
3. [Phase 3: Schema Introspection](#phase-3-schema-introspection)
4. [Phase 4: Security & Audit](#phase-4-security--audit)
5. [Phase 5: Backup & Restore](#phase-5-backup--restore)
6. [Error Handling](#error-handling)
7. [Security Considerations](#security-considerations)
8. [Performance Guidelines](#performance-guidelines)

---

## Phase 1: Core CRUD Operations

### 1. db_query_records

Query database records with filtering, sorting, and pagination.

**Parameters:**
- `table` (string, required): Table name to query
- `columns` (array<string>, optional): Specific columns to return (default: all)
- `where` (object, optional): Filter conditions
- `orderBy` (array<object>, optional): Sort specification
- `limit` (number, optional): Maximum records to return (1-1000, default: 100)
- `offset` (number, optional): Number of records to skip (default: 0)

**WHERE Clause Operators:**
- `=` : Exact match (default)
- `$gt` : Greater than
- `$gte` : Greater than or equal
- `$lt` : Less than
- `$lte` : Less than or equal
- `$ne` : Not equal
- `$like` : Pattern match (use % wildcard)
- `$ilike` : Case-insensitive pattern match
- `$in` : Value in array
- `$null` : true/false for NULL checks

**Example:**
```json
{
  "table": "books",
  "columns": ["id", "title", "author_id", "created_at"],
  "where": {
    "status": "published",
    "word_count": { "$gte": 50000 },
    "genre": { "$in": ["fantasy", "sci-fi"] }
  },
  "orderBy": [
    { "column": "created_at", "direction": "DESC" }
  ],
  "limit": 50,
  "offset": 0
}
```

**Response:**
```json
{
  "total": 127,
  "count": 50,
  "offset": 0,
  "limit": 50,
  "records": [...]
}
```

**Performance:**
- Single query: < 50ms (typical)
- With indexes: < 10ms
- Large result sets: Use pagination

---

### 2. db_insert_record

Insert a single record into a table.

**Parameters:**
- `table` (string, required): Table name
- `data` (object, required): Record data as key-value pairs

**Example:**
```json
{
  "table": "authors",
  "data": {
    "name": "Jane Smith",
    "email": "jane@example.com",
    "bio": "Award-winning science fiction author"
  }
}
```

**Response:**
```json
{
  "id": 42,
  "name": "Jane Smith",
  "email": "jane@example.com",
  "bio": "Award-winning science fiction author",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

**Behavior:**
- Auto-generates `id` if using SERIAL/UUID
- Auto-sets `created_at` and `updated_at` timestamps
- Validates foreign key constraints
- Validates data types and required fields

**Performance Target:**
- Single INSERT: < 10ms

---

### 3. db_update_records

Update one or more records matching the WHERE clause.

**Parameters:**
- `table` (string, required): Table name
- `data` (object, required): Fields to update
- `where` (object, required): Filter conditions (same operators as query)

**Example:**
```json
{
  "table": "books",
  "data": {
    "status": "published",
    "published_at": "2024-01-15T00:00:00Z"
  },
  "where": {
    "id": 123
  }
}
```

**Response:**
```json
{
  "updated": 1,
  "records": [
    {
      "id": 123,
      "title": "The Great Novel",
      "status": "published",
      "published_at": "2024-01-15T00:00:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Behavior:**
- Auto-updates `updated_at` timestamp
- WHERE clause is mandatory (prevents accidental mass updates)
- Supports partial updates (only specified fields)
- Returns all updated records

---

### 4. db_delete_records

Delete one or more records with soft delete support.

**Parameters:**
- `table` (string, required): Table name
- `where` (object, required): Filter conditions
- `hard` (boolean, optional): Force permanent deletion (default: false)

**Example:**
```json
{
  "table": "characters",
  "where": {
    "id": 456
  },
  "hard": false
}
```

**Response (Soft Delete):**
```json
{
  "deleted": 1,
  "type": "soft",
  "records": [
    {
      "id": 456,
      "name": "Old Character",
      "deleted_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Soft Delete Supported Tables:**
- books, chapters, scenes
- characters, character_arcs
- locations, world_elements
- organizations, plot_threads

**Hard Delete:**
- Permanently removes records
- Cannot be undone
- May fail due to foreign key constraints

---

## Phase 2: Batch Operations

### 5. db_batch_insert

Insert multiple records in a single atomic transaction.

**Parameters:**
- `table` (string, required): Table name
- `records` (array<object>, required): Array of records (1-1000)
- `returnRecords` (boolean, optional): Return inserted records (default: false)

**Example:**
```json
{
  "table": "characters",
  "records": [
    {
      "name": "Alice",
      "role": "protagonist",
      "age": 28
    },
    {
      "name": "Bob",
      "role": "antagonist",
      "age": 35
    }
  ],
  "returnRecords": true
}
```

**Response:**
```json
{
  "inserted": 2,
  "records": [...]
}
```

**Behavior:**
- Atomic transaction (all-or-nothing)
- Validates all records before insertion
- Auto-generates IDs and timestamps
- Validates foreign key constraints

**Performance Target:**
- 1000 records: < 5 seconds

---

### 6. db_batch_update

Update multiple sets of records in a single transaction.

**Parameters:**
- `table` (string, required): Table name
- `updates` (array<object>, required): Array of update operations (1-100)

Each update operation:
- `data` (object): Fields to update
- `where` (object): Filter conditions

**Example:**
```json
{
  "table": "books",
  "updates": [
    {
      "data": { "status": "published" },
      "where": { "id": 1 }
    },
    {
      "data": { "status": "archived" },
      "where": { "id": 2 }
    }
  ]
}
```

**Response:**
```json
{
  "totalUpdated": 2,
  "results": [
    { "updated": 1 },
    { "updated": 1 }
  ]
}
```

**Behavior:**
- Atomic transaction
- Each operation executes independently
- Rollback on any failure

---

### 7. db_batch_delete

Delete multiple sets of records in a single transaction.

**Parameters:**
- `table` (string, required): Table name
- `deletes` (array<object>, required): Array of delete operations (1-100)
- `hard` (boolean, optional): Force hard delete (default: false)

Each delete operation:
- `where` (object): Filter conditions

**Example:**
```json
{
  "table": "scenes",
  "deletes": [
    { "where": { "id": 10 } },
    { "where": { "id": 20 } }
  ],
  "hard": false
}
```

**Response:**
```json
{
  "totalDeleted": 2,
  "type": "soft",
  "results": [
    { "deleted": 1 },
    { "deleted": 1 }
  ]
}
```

---

## Phase 3: Schema Introspection

### 8. db_get_schema

Get detailed schema information for a table.

**Parameters:**
- `table` (string, required): Table name

**Example:**
```json
{
  "table": "books"
}
```

**Response:**
```json
{
  "table": "books",
  "columns": [
    {
      "name": "id",
      "type": "integer",
      "nullable": false,
      "default": "nextval('books_id_seq')",
      "isPrimaryKey": true,
      "isForeignKey": false
    },
    {
      "name": "author_id",
      "type": "integer",
      "nullable": false,
      "default": null,
      "isPrimaryKey": false,
      "isForeignKey": true,
      "references": {
        "table": "authors",
        "column": "id"
      }
    },
    {
      "name": "title",
      "type": "character varying(500)",
      "nullable": false,
      "default": null
    }
  ],
  "primaryKey": ["id"],
  "foreignKeys": [...],
  "indexes": [...],
  "constraints": [...]
}
```

---

### 9. db_list_tables

List all accessible tables in the database.

**Parameters:** None

**Example:**
```json
{}
```

**Response:**
```json
{
  "tables": [
    {
      "name": "authors",
      "type": "BASE TABLE",
      "rowCount": 142,
      "size": "32 kB",
      "description": "Author information and metadata"
    },
    {
      "name": "books",
      "type": "BASE TABLE",
      "rowCount": 567,
      "size": "128 kB",
      "description": "Book records with metadata"
    }
  ],
  "total": 29
}
```

---

### 10. db_get_relationships

Discover foreign key relationships for a table.

**Parameters:**
- `table` (string, required): Table name
- `depth` (number, optional): Relationship depth to traverse (default: 1, max: 3)

**Example:**
```json
{
  "table": "books",
  "depth": 2
}
```

**Response:**
```json
{
  "table": "books",
  "outgoing": [
    {
      "column": "author_id",
      "referencesTable": "authors",
      "referencesColumn": "id",
      "relationship": "many-to-one"
    }
  ],
  "incoming": [
    {
      "fromTable": "chapters",
      "fromColumn": "book_id",
      "relationship": "one-to-many"
    }
  ]
}
```

---

### 11. db_list_table_columns

Get column metadata for a specific table.

**Parameters:**
- `table` (string, required): Table name

**Example:**
```json
{
  "table": "characters"
}
```

**Response:**
```json
{
  "table": "characters",
  "columns": [
    {
      "name": "id",
      "type": "integer",
      "nullable": false,
      "maxLength": null,
      "default": "nextval('characters_id_seq')"
    },
    {
      "name": "name",
      "type": "character varying",
      "nullable": false,
      "maxLength": 200,
      "default": null
    }
  ],
  "total": 15
}
```

---

## Phase 4: Security & Audit

### 12. db_query_audit_logs

Query audit log entries with filtering.

**Parameters:**
- `start_date` (string, optional): Start of date range (ISO 8601)
- `end_date` (string, optional): End of date range (ISO 8601)
- `table` (string, optional): Filter by table name
- `operation` (string, optional): Filter by operation type
- `user_id` (string, optional): Filter by user ID
- `success` (boolean, optional): Filter by success status
- `limit` (number, optional): Max records (default: 100, max: 1000)
- `offset` (number, optional): Skip records (default: 0)

**Operation Types:**
- QUERY, INSERT, UPDATE, DELETE
- BATCH_INSERT, BATCH_UPDATE, BATCH_DELETE
- GET_SCHEMA, LIST_TABLES, GET_RELATIONSHIPS
- BACKUP_FULL, RESTORE_FULL, EXPORT_JSON, etc.

**Example:**
```json
{
  "start_date": "2024-01-01T00:00:00Z",
  "end_date": "2024-01-31T23:59:59Z",
  "table": "books",
  "operation": "UPDATE",
  "success": true,
  "limit": 50
}
```

**Response:**
```json
{
  "count": 42,
  "limit": 50,
  "offset": 0,
  "logs": [
    {
      "id": 1523,
      "timestamp": "2024-01-15T10:30:00Z",
      "operation": "UPDATE",
      "table": "books",
      "recordId": "123",
      "userId": "user-456",
      "success": true,
      "executionTime": 12,
      "changes": {
        "status": { "old": "draft", "new": "published" }
      }
    }
  ]
}
```

---

### 13. db_get_audit_summary

Get statistical summary of audit logs.

**Parameters:**
- `start_date` (string, optional): Start date
- `end_date` (string, optional): End date
- `table` (string, optional): Filter by table

**Example:**
```json
{
  "start_date": "2024-01-01T00:00:00Z",
  "end_date": "2024-01-31T23:59:59Z"
}
```

**Response:**
```json
{
  "summary": {
    "totalOperations": 5432,
    "successfulOperations": 5201,
    "failedOperations": 231,
    "successRate": "95.7%",
    "tablesAccessed": 18,
    "uniqueUsers": 7,
    "avgExecutionTime": "15.3ms",
    "maxExecutionTime": "1250ms",
    "timeRange": {
      "earliest": "2024-01-01T00:05:23Z",
      "latest": "2024-01-31T23:58:12Z"
    }
  },
  "byOperation": [
    {
      "operation": "QUERY",
      "count": 3200,
      "successful": 3180,
      "failed": 20
    }
  ],
  "byTable": [
    {
      "table_name": "books",
      "count": 1250,
      "successful": 1240,
      "failed": 10
    }
  ]
}
```

---

## Phase 5: Backup & Restore

### 14. db_backup_full

Create a complete database backup.

**Parameters:**
- `compress` (boolean, optional): Compress backup file (default: true)
- `includeSchema` (boolean, optional): Include table schemas (default: true)

**Example:**
```json
{
  "compress": true,
  "includeSchema": true
}
```

**Response:**
```json
{
  "backupFile": "backup_2024-01-15_103045.sql.gz",
  "size": 2457600,
  "tables": 29,
  "recordCount": 12450,
  "duration": 3500,
  "compressed": true,
  "checksum": "a7f3c2e9d8b4a1f6e5c3d2b1a0f9e8d7"
}
```

**Performance Target:**
- 1GB database: < 2 minutes

---

### 15. db_backup_table

Backup a specific table.

**Parameters:**
- `table` (string, required): Table name
- `dataOnly` (boolean, optional): Backup data only (default: false)
- `schemaOnly` (boolean, optional): Backup schema only (default: false)
- `compress` (boolean, optional): Compress backup (default: true)

**Example:**
```json
{
  "table": "books",
  "dataOnly": false,
  "compress": true
}
```

**Response:**
```json
{
  "backupFile": "table_backup_books_2024-01-15.sql.gz",
  "table": "books",
  "recordCount": 567,
  "size": 128000,
  "duration": 450,
  "compressed": true
}
```

---

### 16. db_backup_incremental

Create incremental backup since a specific time.

**Parameters:**
- `since` (string, required): ISO 8601 timestamp
- `tables` (array<string>, optional): Specific tables (default: all)
- `compress` (boolean, optional): Compress backup (default: true)

**Example:**
```json
{
  "since": "2024-01-14T00:00:00Z",
  "compress": true
}
```

**Response:**
```json
{
  "backupFile": "incremental_2024-01-15_103045.sql.gz",
  "since": "2024-01-14T00:00:00Z",
  "recordCount": 234,
  "tables": 12,
  "size": 45600,
  "duration": 850
}
```

---

### 17. db_export_json

Export table data as JSON.

**Parameters:**
- `table` (string, required): Table name
- `where` (object, optional): Filter conditions
- `pretty` (boolean, optional): Pretty print JSON (default: false)

**Example:**
```json
{
  "table": "authors",
  "where": {
    "status": "active"
  },
  "pretty": true
}
```

**Response:**
```json
{
  "exportFile": "export_authors_2024-01-15.json",
  "table": "authors",
  "recordCount": 142,
  "size": 25600,
  "format": "json"
}
```

---

### 18. db_export_csv

Export table data as CSV.

**Parameters:**
- `table` (string, required): Table name
- `where` (object, optional): Filter conditions
- `columns` (array<string>, optional): Specific columns
- `delimiter` (string, optional): CSV delimiter (default: ",")
- `includeHeaders` (boolean, optional): Include header row (default: true)

**Example:**
```json
{
  "table": "books",
  "columns": ["id", "title", "author_id", "created_at"],
  "includeHeaders": true
}
```

**Response:**
```json
{
  "exportFile": "export_books_2024-01-15.csv",
  "table": "books",
  "recordCount": 567,
  "size": 89000,
  "format": "csv"
}
```

---

### 19. db_restore_full

Restore complete database from backup.

**Parameters:**
- `backupFile` (string, required): Backup file name
- `dropExisting` (boolean, optional): Drop existing tables (default: false)
- `skipErrors` (boolean, optional): Continue on errors (default: false)

**Example:**
```json
{
  "backupFile": "backup_2024-01-15_103045.sql.gz",
  "dropExisting": false,
  "skipErrors": false
}
```

**Response:**
```json
{
  "restored": true,
  "tables": 29,
  "recordCount": 12450,
  "duration": 4200,
  "errors": []
}
```

**Warning:** Use with caution in production!

---

### 20. db_restore_table

Restore a specific table from backup.

**Parameters:**
- `backupFile` (string, required): Backup file name
- `table` (string, required): Table name
- `dropExisting` (boolean, optional): Drop table first (default: false)

**Example:**
```json
{
  "backupFile": "table_backup_books_2024-01-15.sql.gz",
  "table": "books",
  "dropExisting": false
}
```

**Response:**
```json
{
  "restored": true,
  "table": "books",
  "recordCount": 567,
  "duration": 920
}
```

---

### 21. db_import_json

Import data from JSON file.

**Parameters:**
- `table` (string, required): Target table name
- `data` (string or array, required): JSON data or file content
- `mode` (string, optional): Import mode: "insert", "upsert", "replace" (default: "insert")

**Example:**
```json
{
  "table": "characters",
  "data": [
    {
      "name": "Alice",
      "role": "protagonist"
    }
  ],
  "mode": "insert"
}
```

**Response:**
```json
{
  "imported": 1,
  "table": "characters",
  "mode": "insert",
  "errors": []
}
```

---

### 22. db_import_csv

Import data from CSV file.

**Parameters:**
- `table` (string, required): Target table name
- `data` (string, required): CSV data
- `delimiter` (string, optional): CSV delimiter (default: ",")
- `hasHeaders` (boolean, optional): First row contains headers (default: true)
- `mode` (string, optional): Import mode (default: "insert")

**Example:**
```json
{
  "table": "locations",
  "data": "name,type,description\nCastle,fortress,Ancient castle\n",
  "hasHeaders": true
}
```

**Response:**
```json
{
  "imported": 1,
  "table": "locations",
  "mode": "insert",
  "errors": []
}
```

---

### 23. db_list_backups

List all available backups.

**Parameters:**
- `type` (string, optional): Filter by type: "full", "table", "incremental"

**Example:**
```json
{
  "type": "full"
}
```

**Response:**
```json
{
  "backups": [
    {
      "file": "backup_2024-01-15_103045.sql.gz",
      "type": "full",
      "size": 2457600,
      "created": "2024-01-15T10:30:45Z",
      "compressed": true,
      "checksum": "a7f3c2e9..."
    }
  ],
  "total": 5
}
```

---

### 24. db_delete_backup

Delete a backup file.

**Parameters:**
- `backupFile` (string, required): Backup file name

**Example:**
```json
{
  "backupFile": "backup_2024-01-10_000000.sql.gz"
}
```

**Response:**
```json
{
  "deleted": true,
  "file": "backup_2024-01-10_000000.sql.gz"
}
```

---

### 25. db_validate_backup

Validate backup file integrity.

**Parameters:**
- `backupFile` (string, required): Backup file name

**Example:**
```json
{
  "backupFile": "backup_2024-01-15_103045.sql.gz"
}
```

**Response:**
```json
{
  "valid": true,
  "file": "backup_2024-01-15_103045.sql.gz",
  "size": 2457600,
  "compressed": true,
  "checksum": "a7f3c2e9d8b4a1f6e5c3d2b1a0f9e8d7",
  "verified": true,
  "tables": 29
}
```

---

## Error Handling

All tools return errors in a consistent format:

```json
{
  "error": true,
  "message": "Detailed error message",
  "code": "ERROR_CODE",
  "details": {
    "table": "books",
    "constraint": "fk_book_author"
  }
}
```

**Common Error Codes:**
- `VALIDATION_ERROR`: Invalid input parameters
- `NOT_FOUND`: Table or record not found
- `PERMISSION_DENIED`: Access denied to resource
- `FOREIGN_KEY_VIOLATION`: Foreign key constraint violation
- `DUPLICATE_KEY`: Unique constraint violation
- `TIMEOUT`: Operation timeout
- `DATABASE_ERROR`: General database error

---

## Security Considerations

### Whitelisting
- Only 29 pre-approved tables are accessible
- Each table has approved column list
- Read-only tables cannot be modified

### SQL Injection Prevention
- 100% parameterized queries
- No string concatenation in SQL
- Pattern validation for identifiers
- Operator whitelisting

### Access Control
- Table-level permissions
- Operation-level checks
- Default deny policy

### Audit Logging
- All operations logged with timestamp
- Success/failure tracking
- User attribution
- Change tracking

---

## Performance Guidelines

### Query Optimization
- Use indexes for filtered columns
- Limit result sets with pagination
- Specify only required columns
- Use appropriate operators

### Batch Operations
- Prefer batch operations for multiple records
- Maximum 1000 records per batch insert
- Maximum 100 operations per batch update/delete

### Backup Operations
- Schedule full backups during off-peak hours
- Use incremental backups for frequent changes
- Enable compression for large backups
- Validate backups regularly

### Performance Targets
- Single INSERT: < 10ms
- Batch INSERT (1000 records): < 5s
- Full backup (1GB): < 2 minutes
- Query with index: < 10ms
- Audit log query: < 100ms

---

## Version History

- **1.0.0** (2024): Initial release with all 25 tools
  - Phase 1: Core CRUD (4 tools)
  - Phase 2: Batch Operations (3 tools)
  - Phase 3: Schema Introspection (4 tools)
  - Phase 4: Security & Audit (2 tools)
  - Phase 5: Backup & Restore (12 tools)

---

**For more information:**
- [User Guides](./USER-GUIDES.md)
- [Code Examples](./EXAMPLES.md)
- [Security Guide](./SECURITY-GUIDE.md)
- [Tutorial Series](./TUTORIALS.md)
