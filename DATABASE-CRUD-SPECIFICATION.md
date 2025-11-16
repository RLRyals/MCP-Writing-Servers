# Database CRUD Operations Specification

## Overview

This document specifies the design and implementation requirements for database CRUD (Create, Read, Update, Delete) operations and batch actions for the MCP Writing System. These operations should be implemented in the **MCP-Writing-Servers** repository as they involve business logic and direct database access.

**Repository**: https://github.com/RLRyals/MCP-Writing-Servers
**Database**: PostgreSQL (via PgBouncer connection pool)
**Connection**: `postgresql://writer:password@localhost:6432/mcp_writing_db`

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database CRUD Server Specification](#database-crud-server-specification)
3. [MCP Tool Definitions](#mcp-tool-definitions)
4. [Batch Operations](#batch-operations)
5. [Security Considerations](#security-considerations)
6. [Error Handling](#error-handling)
7. [Testing Strategy](#testing-strategy)
8. [Implementation Roadmap](#implementation-roadmap)

---

## Architecture Overview

### Current System Architecture

```
┌─────────────────────────────────────────────────────────┐
│  AI Client (Claude Desktop / TypingMind)                │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  MCP Connector (port 50880)                             │
│  - Routes requests to appropriate MCP servers           │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  MCP Writing Servers (ports 3001-3009)                  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 1. book-planning-server                           │  │
│  │ 2. series-planning-server                         │  │
│  │ 3. chapter-planning-server                        │  │
│  │ 4. character-planning-server                      │  │
│  │ 5. scene-server                                   │  │
│  │ 6. core-continuity-server                         │  │
│  │ 7. review-server                                  │  │
│  │ 8. reporting-server                               │  │
│  │ 9. author-server                                  │  │
│  │ 10. database-admin-server (NEW - CRUD ops)        │  │
│  └───────────────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  PgBouncer (port 6432)                                  │
│  - Connection pooling (transaction mode)                │
│  - 30x overhead reduction                               │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  PostgreSQL 16 (port 5432)                              │
│  - Performance-tuned configuration                      │
│  - Database: mcp_writing_db                             │
└─────────────────────────────────────────────────────────┘
```

### Proposed CRUD Architecture

Add a new **database-admin-server** to the MCP-Writing-Servers repository that provides:

1. **Generic CRUD operations** across all tables
2. **Batch operations** for bulk data management
3. **Schema introspection** for dynamic operations
4. **Data validation and constraints** enforcement
5. **Audit logging** for compliance

---

## Database CRUD Server Specification

### Server Details

**Name**: `database-admin-server`
**Port**: `3010`
**Purpose**: Provide administrative CRUD operations for all database tables
**Authentication**: Inherits MCP system authentication
**Database Access**: Via PgBouncer connection pool

### Core Capabilities

#### 1. Generic CRUD Operations

##### Create (Insert)
- **Purpose**: Insert new records into any table
- **Validation**: Check for required fields, data types, constraints
- **Return**: Inserted record with auto-generated IDs

##### Read (Select)
- **Purpose**: Query records with flexible filtering
- **Features**:
  - Pagination support
  - Sorting
  - Field selection
  - JOIN support
- **Return**: Array of matching records

##### Update
- **Purpose**: Modify existing records
- **Features**:
  - Single record update
  - Bulk update with conditions
  - Partial updates (only specified fields)
- **Return**: Updated record count and data

##### Delete
- **Purpose**: Remove records from tables
- **Features**:
  - Soft delete support (if applicable)
  - Cascading delete handling
  - Bulk delete with conditions
- **Return**: Deleted record count

#### 2. Schema Introspection

- **List Tables**: Get all available tables
- **Get Schema**: Retrieve table structure, columns, types
- **Get Constraints**: Foreign keys, unique constraints, indexes
- **Get Relationships**: Table relationships and dependencies

---

## MCP Tool Definitions

### Tool: `db_query_records`

**Description**: Query records from a database table with flexible filtering

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "table": {
      "type": "string",
      "description": "Name of the table to query"
    },
    "columns": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Columns to select (default: all)"
    },
    "where": {
      "type": "object",
      "description": "WHERE conditions as key-value pairs"
    },
    "orderBy": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "column": { "type": "string" },
          "direction": { "enum": ["ASC", "DESC"] }
        }
      }
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 1000,
      "description": "Maximum number of records to return"
    },
    "offset": {
      "type": "integer",
      "minimum": 0,
      "description": "Number of records to skip"
    }
  },
  "required": ["table"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean" },
    "data": {
      "type": "array",
      "items": { "type": "object" }
    },
    "totalCount": { "type": "integer" },
    "returnedCount": { "type": "integer" }
  }
}
```

**Example**:
```typescript
// Query all books in a series
const result = await mcpServer.callTool("db_query_records", {
  table: "books",
  columns: ["id", "title", "author_id", "series_id"],
  where: { series_id: 42 },
  orderBy: [{ column: "sequence_number", direction: "ASC" }],
  limit: 50
});
```

---

### Tool: `db_insert_record`

**Description**: Insert a new record into a table

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "table": {
      "type": "string",
      "description": "Name of the table"
    },
    "data": {
      "type": "object",
      "description": "Record data as key-value pairs"
    },
    "returnRecord": {
      "type": "boolean",
      "default": true,
      "description": "Whether to return the inserted record"
    }
  },
  "required": ["table", "data"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean" },
    "insertedId": { "type": ["integer", "string"] },
    "record": { "type": "object" },
    "message": { "type": "string" }
  }
}
```

**Example**:
```typescript
// Insert a new character
const result = await mcpServer.callTool("db_insert_record", {
  table: "characters",
  data: {
    name: "Jane Doe",
    role: "protagonist",
    book_id: 123,
    description: "A mysterious detective"
  }
});
```

---

### Tool: `db_update_records`

**Description**: Update existing records in a table

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "table": {
      "type": "string",
      "description": "Name of the table"
    },
    "data": {
      "type": "object",
      "description": "Fields to update"
    },
    "where": {
      "type": "object",
      "description": "WHERE conditions to match records"
    },
    "returnRecords": {
      "type": "boolean",
      "default": false,
      "description": "Whether to return updated records"
    }
  },
  "required": ["table", "data", "where"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean" },
    "updatedCount": { "type": "integer" },
    "records": {
      "type": "array",
      "items": { "type": "object" }
    },
    "message": { "type": "string" }
  }
}
```

**Example**:
```typescript
// Update character status
const result = await mcpServer.callTool("db_update_records", {
  table: "characters",
  data: { status: "deceased" },
  where: { id: 456 }
});
```

---

### Tool: `db_delete_records`

**Description**: Delete records from a table

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "table": {
      "type": "string",
      "description": "Name of the table"
    },
    "where": {
      "type": "object",
      "description": "WHERE conditions to match records to delete"
    },
    "softDelete": {
      "type": "boolean",
      "default": false,
      "description": "Use soft delete if table supports it"
    }
  },
  "required": ["table", "where"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean" },
    "deletedCount": { "type": "integer" },
    "message": { "type": "string" }
  }
}
```

**Example**:
```typescript
// Delete draft chapters
const result = await mcpServer.callTool("db_delete_records", {
  table: "chapters",
  where: { status: "draft", book_id: 789 }
});
```

---

### Tool: `db_get_schema`

**Description**: Get schema information for a table

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "table": {
      "type": "string",
      "description": "Name of the table"
    },
    "includeConstraints": {
      "type": "boolean",
      "default": true
    },
    "includeIndexes": {
      "type": "boolean",
      "default": true
    }
  },
  "required": ["table"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "tableName": { "type": "string" },
    "columns": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "type": { "type": "string" },
          "nullable": { "type": "boolean" },
          "default": { "type": ["string", "null"] },
          "isPrimaryKey": { "type": "boolean" }
        }
      }
    },
    "constraints": { "type": "array" },
    "indexes": { "type": "array" }
  }
}
```

---

## Batch Operations

### Tool: `db_batch_insert`

**Description**: Insert multiple records in a single transaction

**Features**:
- Transactional (all-or-nothing)
- Automatic rollback on error
- Optimized bulk insert
- Returns IDs of all inserted records

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "table": { "type": "string" },
    "records": {
      "type": "array",
      "items": { "type": "object" },
      "minItems": 1,
      "maxItems": 1000
    }
  },
  "required": ["table", "records"]
}
```

**Example**:
```typescript
// Bulk insert scenes
const result = await mcpServer.callTool("db_batch_insert", {
  table: "scenes",
  records: [
    { chapter_id: 10, scene_number: 1, description: "Opening scene" },
    { chapter_id: 10, scene_number: 2, description: "Conflict introduction" },
    { chapter_id: 10, scene_number: 3, description: "Rising action" }
  ]
});
```

---

### Tool: `db_batch_update`

**Description**: Update multiple records with different values

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "table": { "type": "string" },
    "updates": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "where": { "type": "object" },
          "data": { "type": "object" }
        },
        "required": ["where", "data"]
      }
    }
  },
  "required": ["table", "updates"]
}
```

**Example**:
```typescript
// Batch update chapter statuses
const result = await mcpServer.callTool("db_batch_update", {
  table: "chapters",
  updates: [
    { where: { id: 1 }, data: { status: "published" } },
    { where: { id: 2 }, data: { status: "published" } },
    { where: { id: 3 }, data: { status: "in_review" } }
  ]
});
```

---

### Tool: `db_batch_delete`

**Description**: Delete multiple sets of records in a transaction

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "table": { "type": "string" },
    "conditions": {
      "type": "array",
      "items": { "type": "object" }
    }
  },
  "required": ["table", "conditions"]
}
```

---

## Security Considerations

### 1. SQL Injection Prevention

**Strategy**: Use parameterized queries exclusively

```typescript
// ✅ CORRECT - Parameterized query
const query = 'SELECT * FROM books WHERE id = $1';
const result = await pool.query(query, [bookId]);

// ❌ WRONG - String concatenation
const query = `SELECT * FROM books WHERE id = ${bookId}`;
```

**Implementation**:
- Use `pg` library's parameterized queries
- Validate and sanitize all table/column names
- Whitelist allowed tables
- Use prepared statements

### 2. Access Control

**Table Access Matrix**:
```typescript
const ACCESS_CONTROL = {
  read: ['books', 'chapters', 'characters', 'scenes', 'series'],
  write: ['books', 'chapters', 'characters', 'scenes'],
  delete: ['drafts', 'temp_data'],
  restricted: ['users', 'auth_tokens', 'system_config']
};
```

**Validation**:
```typescript
function validateTableAccess(table: string, operation: 'read' | 'write' | 'delete'): boolean {
  // Check if table is in restricted list
  if (ACCESS_CONTROL.restricted.includes(table)) {
    throw new Error(`Access denied: Table '${table}' is restricted`);
  }

  // Check if operation is allowed
  if (!ACCESS_CONTROL[operation].includes(table)) {
    throw new Error(`Access denied: ${operation} not allowed on table '${table}'`);
  }

  return true;
}
```

### 3. Audit Logging

**Log all CRUD operations**:
```typescript
interface AuditLog {
  timestamp: Date;
  operation: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
  table: string;
  recordId?: number | string;
  userId?: string;
  changes?: object;
  success: boolean;
  error?: string;
}

async function logOperation(log: AuditLog): Promise<void> {
  await pool.query(
    'INSERT INTO audit_logs (timestamp, operation, table_name, record_id, user_id, changes, success, error) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [log.timestamp, log.operation, log.table, log.recordId, log.userId, JSON.stringify(log.changes), log.success, log.error]
  );
}
```

### 4. Data Validation

**Validate inputs before database operations**:
```typescript
function validateRecordData(table: string, data: any, schema: TableSchema): ValidationResult {
  const errors: string[] = [];

  // Check required fields
  for (const column of schema.columns) {
    if (column.nullable === false && !(column.name in data)) {
      errors.push(`Missing required field: ${column.name}`);
    }
  }

  // Check data types
  for (const [key, value] of Object.entries(data)) {
    const column = schema.columns.find(c => c.name === key);
    if (column && !isValidType(value, column.type)) {
      errors.push(`Invalid type for ${key}: expected ${column.type}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
```

---

## Error Handling

### Error Codes

```typescript
enum DatabaseErrorCode {
  // Client errors (4xx)
  INVALID_TABLE = 'DB_400_INVALID_TABLE',
  INVALID_COLUMN = 'DB_400_INVALID_COLUMN',
  VALIDATION_ERROR = 'DB_400_VALIDATION',
  CONSTRAINT_VIOLATION = 'DB_400_CONSTRAINT',

  // Authorization errors (403)
  ACCESS_DENIED = 'DB_403_ACCESS_DENIED',

  // Not found (404)
  RECORD_NOT_FOUND = 'DB_404_NOT_FOUND',

  // Server errors (5xx)
  DATABASE_ERROR = 'DB_500_DATABASE',
  TRANSACTION_ERROR = 'DB_500_TRANSACTION',
  CONNECTION_ERROR = 'DB_500_CONNECTION',
}
```

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "DB_400_VALIDATION",
    "message": "Validation failed for record insertion",
    "details": {
      "field": "email",
      "issue": "Invalid email format"
    },
    "timestamp": "2025-11-16T10:30:00Z"
  }
}
```

### Recovery Strategies

**Transaction Rollback**:
```typescript
async function batchInsertWithRollback(table: string, records: any[]): Promise<BatchResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const insertedIds = [];
    for (const record of records) {
      const result = await client.query(
        `INSERT INTO ${table} (...) VALUES (...) RETURNING id`,
        Object.values(record)
      );
      insertedIds.push(result.rows[0].id);
    }

    await client.query('COMMIT');
    return { success: true, insertedIds };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;

  } finally {
    client.release();
  }
}
```

---

## Testing Strategy

### 1. Unit Tests

**Test each CRUD operation in isolation**:

```typescript
describe('db_query_records', () => {
  it('should query records with WHERE conditions', async () => {
    const result = await queryRecords({
      table: 'books',
      where: { author_id: 123 }
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeInstanceOf(Array);
  });

  it('should handle pagination correctly', async () => {
    const result = await queryRecords({
      table: 'books',
      limit: 10,
      offset: 20
    });

    expect(result.returnedCount).toBeLessThanOrEqual(10);
  });

  it('should reject invalid table names', async () => {
    await expect(
      queryRecords({ table: 'invalid_table' })
    ).rejects.toThrow('INVALID_TABLE');
  });
});
```

### 2. Integration Tests

**Test with actual PostgreSQL database**:

```typescript
describe('Database Integration Tests', () => {
  beforeAll(async () => {
    // Setup test database
    await setupTestDatabase();
  });

  afterAll(async () => {
    // Cleanup
    await teardownTestDatabase();
  });

  it('should perform full CRUD cycle', async () => {
    // Create
    const inserted = await insertRecord({ table: 'test_books', data: { title: 'Test' } });
    expect(inserted.success).toBe(true);

    // Read
    const queried = await queryRecords({ table: 'test_books', where: { id: inserted.insertedId } });
    expect(queried.data).toHaveLength(1);

    // Update
    const updated = await updateRecords({
      table: 'test_books',
      where: { id: inserted.insertedId },
      data: { title: 'Updated' }
    });
    expect(updated.updatedCount).toBe(1);

    // Delete
    const deleted = await deleteRecords({
      table: 'test_books',
      where: { id: inserted.insertedId }
    });
    expect(deleted.deletedCount).toBe(1);
  });
});
```

### 3. Performance Tests

**Test batch operations at scale**:

```typescript
describe('Performance Tests', () => {
  it('should handle batch insert of 1000 records', async () => {
    const records = generateTestRecords(1000);

    const startTime = Date.now();
    const result = await batchInsert({ table: 'test_data', records });
    const duration = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(5000); // Should complete in < 5 seconds
  });
});
```

### 4. Security Tests

**Test SQL injection prevention**:

```typescript
describe('Security Tests', () => {
  it('should prevent SQL injection in WHERE clause', async () => {
    const maliciousInput = "1; DROP TABLE books; --";

    await expect(
      queryRecords({
        table: 'books',
        where: { id: maliciousInput }
      })
    ).rejects.toThrow('VALIDATION_ERROR');
  });

  it('should block access to restricted tables', async () => {
    await expect(
      queryRecords({ table: 'users' })
    ).rejects.toThrow('ACCESS_DENIED');
  });
});
```

---

## Implementation Roadmap

### Phase 1: Core CRUD Operations (Week 1-2)

**Deliverables**:
- [ ] Create `database-admin-server` project structure
- [ ] Implement `db_query_records` tool
- [ ] Implement `db_insert_record` tool
- [ ] Implement `db_update_records` tool
- [ ] Implement `db_delete_records` tool
- [ ] Add input validation
- [ ] Write unit tests for all operations

**Success Criteria**:
- All CRUD operations work with test database
- 90%+ test coverage
- Input validation catches common errors

### Phase 2: Batch Operations (Week 3)

**Deliverables**:
- [ ] Implement `db_batch_insert` tool
- [ ] Implement `db_batch_update` tool
- [ ] Implement `db_batch_delete` tool
- [ ] Add transaction management
- [ ] Add rollback mechanisms
- [ ] Performance optimization for bulk operations

**Success Criteria**:
- Can handle batches of 1000+ records
- All-or-nothing transaction semantics
- Performance within acceptable limits (<5s for 1000 records)

### Phase 3: Schema Introspection (Week 4)

**Deliverables**:
- [ ] Implement `db_get_schema` tool
- [ ] Implement `db_list_tables` tool
- [ ] Add relationship mapping
- [ ] Dynamic query builder based on schema

**Success Criteria**:
- Can query and display any table schema
- Relationship mapping is accurate
- Dynamic queries work correctly

### Phase 4: Security & Audit (Week 5)

**Deliverables**:
- [ ] Implement access control system
- [ ] Add audit logging for all operations
- [ ] SQL injection prevention tests
- [ ] Security documentation
- [ ] Admin dashboard for audit logs

**Success Criteria**:
- All operations logged
- Access control prevents unauthorized operations
- Passes security audit

### Phase 5: Testing & Documentation (Week 6)

**Deliverables**:
- [ ] Comprehensive test suite
- [ ] Performance benchmarks
- [ ] API documentation
- [ ] User guide with examples
- [ ] Migration guide from existing code

**Success Criteria**:
- 95%+ test coverage
- All features documented
- Performance meets requirements

### Phase 6: Integration & Deployment (Week 7)

**Deliverables**:
- [ ] Integrate with MCP Connector
- [ ] Update Docker configuration
- [ ] Add to Electron app UI (optional)
- [ ] Deploy to production
- [ ] Monitor and fix issues

**Success Criteria**:
- Works seamlessly with existing MCP servers
- No regressions in existing functionality
- Stable in production

---

## Additional Considerations

### Connection Pooling

Use PgBouncer for connection pooling:
- Already configured in the system
- Transaction mode for transactional operations
- Connection limit: 200
- Pool size: 25

### Performance Optimization

1. **Use prepared statements** for frequently executed queries
2. **Batch operations** when possible (reduces round trips)
3. **Index optimization** for common query patterns
4. **Query result caching** for read-heavy operations

### Monitoring

Track these metrics:
- Query execution time
- Transaction success/failure rate
- Connection pool utilization
- Error rates by operation type

---

## Conclusion

This specification provides a comprehensive blueprint for implementing database CRUD operations in the MCP-Writing-Servers repository. The proposed `database-admin-server` will provide users with powerful, secure, and efficient database management capabilities while maintaining the separation of concerns in the architecture.

**Next Steps**:
1. Review this specification with stakeholders
2. Create implementation tasks in GitHub
3. Begin Phase 1 development
4. Establish CI/CD pipeline for automated testing

---

## References

- MCP Protocol Specification: https://modelcontextprotocol.io/
- PostgreSQL Documentation: https://www.postgresql.org/docs/
- PgBouncer Configuration: https://www.pgbouncer.org/
- Node.js pg Library: https://node-postgres.com/

---

**Document Version**: 1.0
**Last Updated**: 2025-11-16
**Author**: Claude (MCP Electron App AI Assistant)
