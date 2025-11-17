# Database Admin Server - Architecture Documentation

Comprehensive system architecture and design documentation

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Component Architecture](#component-architecture)
3. [Security Architecture](#security-architecture)
4. [Data Flow](#data-flow)
5. [Database Schema](#database-schema)
6. [Technology Stack](#technology-stack)
7. [Deployment Architecture](#deployment-architecture)

---

## System Overview

The Database Admin Server is a secure, MCP-compliant database administration system providing 25 tools for CRUD operations, batch processing, schema introspection, audit logging, and backup/restore operations.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Client Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   AI Agent   │  │  Developer   │  │  Operations  │              │
│  │   (Claude)   │  │    Tools     │  │     Team     │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    MCP Protocol Layer                                │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Model Context Protocol (MCP) v1.17.5                         │  │
│  │  - Tool Discovery  - Execution  - Response Formatting         │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                   Application Server Layer                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │              DatabaseAdminMCPServer                            │  │
│  │                                                                │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │  │
│  │  │  Database   │  │   Batch     │  │   Schema    │           │  │
│  │  │  Handlers   │  │  Handlers   │  │  Handlers   │           │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘           │  │
│  │                                                                │  │
│  │  ┌─────────────┐  ┌─────────────┐                            │  │
│  │  │   Audit     │  │   Backup    │                            │  │
│  │  │  Handlers   │  │  Handlers   │                            │  │
│  │  └─────────────┘  └─────────────┘                            │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    Security & Validation Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  Security    │  │    Query     │  │    Access    │             │
│  │  Validator   │  │   Builder    │  │   Control    │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │    Audit     │  │     Data     │  │  Validation  │             │
│  │   Logger     │  │  Validator   │  │    Utils     │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     Database Layer                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                  PostgreSQL 16                                 │  │
│  │                                                                │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │  │
│  │  │  Books  │  │ Authors │  │Characters│  │  Audit  │         │  │
│  │  │  Table  │  │  Table  │  │  Table   │  │  Logs   │         │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘         │  │
│  │                    (29 tables total)                          │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      Storage Layer                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │   Backups    │  │    Exports   │  │     Logs     │             │
│  │  (*.sql.gz)  │  │ (*.json/csv) │  │   (*.log)    │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### Handler Components

```
DatabaseAdminMCPServer
│
├── DatabaseHandlers (Phase 1: CRUD Operations)
│   ├── handleQueryRecords()      - Query with filtering, sorting, pagination
│   ├── handleInsertRecord()      - Insert single record with validation
│   ├── handleUpdateRecords()     - Update with WHERE conditions
│   └── handleDeleteRecords()     - Soft/hard delete support
│
├── BatchHandlers (Phase 2: Batch Operations)
│   ├── handleBatchInsert()       - Atomic batch insert (1-1000 records)
│   ├── handleBatchUpdate()       - Atomic batch update (1-100 operations)
│   └── handleBatchDelete()       - Atomic batch delete (1-100 operations)
│
├── SchemaHandlers (Phase 3: Schema Introspection)
│   ├── handleGetSchema()         - Detailed table structure
│   ├── handleListTables()        - List all accessible tables
│   ├── handleGetRelationships()  - Foreign key relationships
│   └── handleListTableColumns()  - Column metadata
│
├── AuditHandlers (Phase 4: Security & Audit)
│   ├── handleQueryAuditLogs()    - Query audit trail with filtering
│   └── handleGetAuditSummary()   - Statistical audit summary
│
└── BackupHandlers (Phase 5: Backup & Restore)
    ├── handleBackupFull()        - Full database backup
    ├── handleBackupTable()       - Table-specific backup
    ├── handleBackupIncremental() - Incremental backup
    ├── handleExportJson()        - Export as JSON
    ├── handleExportCsv()         - Export as CSV
    ├── handleRestoreFull()       - Full database restore
    ├── handleRestoreTable()      - Table-specific restore
    ├── handleImportJson()        - Import from JSON
    ├── handleImportCsv()         - Import from CSV
    ├── handleListBackups()       - List available backups
    ├── handleDeleteBackup()      - Delete backup file
    └── handleValidateBackup()    - Validate backup integrity
```

### Utility Components

```
Utilities Layer
│
├── SecurityValidator
│   ├── validateTable()           - Whitelist table validation
│   ├── validateColumns()         - Whitelist column validation
│   ├── validateWhereClause()     - WHERE clause validation
│   ├── validateData()            - Data object validation
│   ├── validateOrderBy()         - ORDER BY validation
│   └── validatePagination()      - Limit/offset validation
│
├── QueryBuilder
│   ├── buildSelectQuery()        - SELECT query generation
│   ├── buildInsertQuery()        - INSERT query generation
│   ├── buildUpdateQuery()        - UPDATE query generation
│   ├── buildDeleteQuery()        - DELETE query generation
│   ├── buildSoftDeleteQuery()    - Soft delete query
│   ├── buildWhereClause()        - WHERE clause builder
│   └── buildCountQuery()         - COUNT query generation
│
├── AccessControl
│   ├── checkTableAccess()        - Table-level permissions
│   ├── checkOperationAccess()    - Operation-level permissions
│   └── enforceReadOnly()         - Read-only table enforcement
│
├── AuditLogger
│   ├── log()                     - Log operation
│   ├── queryAuditLogs()          - Query audit trail
│   └── getAuditSummary()         - Generate summary statistics
│
├── DataValidator
│   ├── validateDataTypes()       - Type checking
│   ├── validateForeignKeys()     - FK constraint checking
│   ├── validateRequiredFields()  - Required field checking
│   └── validateColumnValues()    - Value validation
│
├── BackupManager
│   ├── createFullBackup()        - Full backup creation
│   ├── createTableBackup()       - Table backup creation
│   ├── createIncrementalBackup() - Incremental backup
│   ├── restoreBackup()           - Backup restoration
│   └── validateBackup()          - Backup validation
│
├── StorageManager
│   ├── saveBackup()              - Save backup file
│   ├── loadBackup()              - Load backup file
│   ├── deleteBackup()            - Delete backup file
│   ├── listBackups()             - List backup files
│   └── validatePath()            - Path validation
│
├── TransactionManager
│   ├── begin()                   - Start transaction
│   ├── commit()                  - Commit transaction
│   ├── rollback()                - Rollback transaction
│   └── executeInTransaction()    - Execute with auto-rollback
│
└── ValidationUtils
    ├── validateTimestamp()       - Timestamp validation
    ├── validateJson()            - JSON validation
    ├── validateCsv()             - CSV validation
    └── validateChecksum()        - Checksum validation
```

---

## Security Architecture

### Multi-Layer Security Model

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: Network Security                                       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • TLS/SSL Encryption (TLSv1.2+)                             │ │
│ │ • Firewall Rules (UFW/iptables)                             │ │
│ │ • IP Whitelisting                                           │ │
│ │ • DDoS Protection                                           │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2: Application Security                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • API Key Authentication                                    │ │
│ │ • JWT Token Validation                                      │ │
│ │ • Session Management                                        │ │
│ │ • Rate Limiting                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3: Authorization                                           │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • Role-Based Access Control (RBAC)                          │ │
│ │ • Table-Level Permissions                                   │ │
│ │ • Operation-Level Checks                                    │ │
│ │ • Read-Only Table Enforcement                               │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 4: Input Validation                                        │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • Table Whitelisting (29 approved tables)                   │ │
│ │ • Column Whitelisting (per-table approved columns)          │ │
│ │ • SQL Injection Prevention (100% parameterized)             │ │
│ │ • Data Type Validation                                      │ │
│ │ • Range Checking (limits, offsets, batch sizes)             │ │
│ │ • Pattern Validation (identifiers: ^[a-z_][a-z0-9_]*$)      │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 5: Database Security                                       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • Parameterized Queries ($1, $2 placeholders)               │ │
│ │ • Foreign Key Constraints                                   │ │
│ │ • Least Privilege Principle                                 │ │
│ │ • Connection Pooling (PgBouncer)                            │ │
│ │ • SSL Connections Required                                  │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 6: Audit & Monitoring                                      │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • Comprehensive Audit Logging                               │ │
│ │ • Real-Time Alerting                                        │ │
│ │ • Anomaly Detection                                         │ │
│ │ • Security Event Tracking                                   │ │
│ │ • Immutable Audit Trail                                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### SQL Injection Prevention

```
User Input: "books'; DROP TABLE users--"
                    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Identifier Validation                                    │
│ ✗ REJECTED: Contains '; not matching pattern ^[a-z_][a-z0-9_]*$ │
└─────────────────────────────────────────────────────────────────┘

User Input: "books"
                    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: Whitelist Check                                          │
│ ✓ ALLOWED: "books" is in WHITELIST                              │
└─────────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: Query Building with Parameterization                     │
│ Query: SELECT * FROM books WHERE id = $1                         │
│ Params: [123]                                                    │
│ ✓ SAFE: Value is parameterized, not concatenated                │
└─────────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: Database Execution                                        │
│ PostgreSQL receives:                                             │
│   SQL: "SELECT * FROM books WHERE id = $1"                       │
│   Parameters: [123]                                              │
│ ✓ SECURE: No string interpolation vulnerability                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Query Operation Flow

```
┌──────────────┐
│ Client       │
│ (AI Agent)   │
└──────────────┘
       │
       │ MCP Tool Call: db_query_records
       │ { table: "books", where: { status: "published" } }
       ↓
┌──────────────────────────────────────────────────────────────────┐
│ DatabaseAdminMCPServer                                            │
│   ↓                                                               │
│ handleQueryRecords()                                              │
└──────────────────────────────────────────────────────────────────┘
       │
       │ 1. Validate input
       ↓
┌──────────────────────────────────────────────────────────────────┐
│ SecurityValidator                                                 │
│   • validateTable("books")          ✓                            │
│   • validateColumns(["*"])          ✓                            │
│   • validateWhereClause({...})      ✓                            │
│   • validatePagination(...)         ✓                            │
└──────────────────────────────────────────────────────────────────┘
       │
       │ 2. Build query
       ↓
┌──────────────────────────────────────────────────────────────────┐
│ QueryBuilder                                                      │
│   buildSelectQuery("books", ["*"], { status: "published" })      │
│                                                                   │
│   Returns:                                                        │
│   { sql: "SELECT * FROM books WHERE status = $1",                │
│     params: ["published"] }                                      │
└──────────────────────────────────────────────────────────────────┘
       │
       │ 3. Execute query
       ↓
┌──────────────────────────────────────────────────────────────────┐
│ DatabaseManager                                                   │
│   query(sql, params)                                             │
│   • Connection from pool                                         │
│   • Execute: SELECT * FROM books WHERE status = $1               │
│   • Params: ["published"]                                        │
└──────────────────────────────────────────────────────────────────┘
       │
       │ 4. Database execution
       ↓
┌──────────────────────────────────────────────────────────────────┐
│ PostgreSQL                                                        │
│   Query planner → Index scan → Return rows                       │
└──────────────────────────────────────────────────────────────────┘
       │
       │ 5. Log operation
       ↓
┌──────────────────────────────────────────────────────────────────┐
│ AuditLogger                                                       │
│   log({                                                          │
│     operation: "QUERY",                                          │
│     table: "books",                                              │
│     success: true,                                               │
│     executionTime: 12                                            │
│   })                                                             │
└──────────────────────────────────────────────────────────────────┘
       │
       │ 6. Format response
       ↓
┌──────────────────────────────────────────────────────────────────┐
│ Response Formatter                                                │
│   {                                                              │
│     total: 42,                                                   │
│     count: 20,                                                   │
│     records: [...]                                               │
│   }                                                              │
└──────────────────────────────────────────────────────────────────┘
       │
       │ MCP Response
       ↓
┌──────────────┐
│ Client       │
│ (AI Agent)   │
└──────────────┘
```

### Batch Insert Flow

```
┌──────────────┐
│ Client       │
└──────────────┘
       │
       │ db_batch_insert
       │ { table: "characters", records: [{...}, {...}, ...] }
       ↓
┌──────────────────────────────────────────────────────────────────┐
│ BatchHandlers.handleBatchInsert()                                 │
└──────────────────────────────────────────────────────────────────┘
       │
       │ Validate batch size (1-1000)
       ↓
┌──────────────────────────────────────────────────────────────────┐
│ ValidationUtils                                                   │
│   • Check batch size: 100 records  ✓                             │
│   • Validate each record structure ✓                             │
│   • Check foreign keys exist       ✓                             │
└──────────────────────────────────────────────────────────────────┘
       │
       │ Start transaction
       ↓
┌──────────────────────────────────────────────────────────────────┐
│ TransactionManager.executeInTransaction()                         │
│   BEGIN;                                                         │
└──────────────────────────────────────────────────────────────────┘
       │
       │ Insert records
       ↓
┌──────────────────────────────────────────────────────────────────┐
│ Loop: For each record                                             │
│   INSERT INTO characters (name, role) VALUES ($1, $2)            │
│   • Record 1  ✓                                                  │
│   • Record 2  ✓                                                  │
│   • ...                                                          │
│   • Record 100  ✓                                                │
└──────────────────────────────────────────────────────────────────┘
       │
       │ All successful
       ↓
┌──────────────────────────────────────────────────────────────────┐
│ TransactionManager                                                │
│   COMMIT;                                                        │
│   ✓ All 100 records committed atomically                         │
└──────────────────────────────────────────────────────────────────┘
       │
       │ Audit logging
       ↓
┌──────────────────────────────────────────────────────────────────┐
│ AuditLogger                                                       │
│   log({ operation: "BATCH_INSERT", recordCount: 100 })          │
└──────────────────────────────────────────────────────────────────┘
       │
       │ Success response
       ↓
┌──────────────┐
│ Client       │
└──────────────┘

Error Scenario:
┌──────────────────────────────────────────────────────────────────┐
│ Record 95 fails (FK violation)                                    │
│   ↓                                                               │
│ TransactionManager.rollback()                                     │
│   ROLLBACK;                                                      │
│   ✗ ALL 100 records discarded (atomic behavior)                  │
│   ✓ Database remains consistent                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────┐
│    authors      │
│─────────────────│
│ id (PK)         │◄────────┐
│ name            │         │
│ email           │         │
│ bio             │         │
│ created_at      │         │
│ updated_at      │         │
└─────────────────┘         │
                            │ 1:M
                            │
                     ┌──────────────┐
                     │    books     │
                     │──────────────│
                     │ id (PK)      │◄────────┐
                     │ author_id(FK)│         │
                     │ title        │         │
                     │ genre        │         │
                     │ status       │         │
                     │ word_count   │         │
                     │ published_at │         │
                     │ created_at   │         │
                     │ updated_at   │         │
                     │ deleted_at   │         │
                     └──────────────┘         │ 1:M
                                              │
                                       ┌──────────────┐
                                       │   chapters   │
                                       │──────────────│
                                       │ id (PK)      │
                                       │ book_id (FK) │
                                       │ chapter_num  │
                                       │ title        │
                                       │ content      │
                                       │ word_count   │
                                       │ created_at   │
                                       │ updated_at   │
                                       │ deleted_at   │
                                       └──────────────┘

┌─────────────────┐
│  characters     │
│─────────────────│
│ id (PK)         │
│ name            │
│ role            │
│ description     │
│ age             │
│ created_at      │
│ updated_at      │
│ deleted_at      │
└─────────────────┘
        │
        │ M:N
        │
┌───────────────────┐
│ character_scenes  │
│───────────────────│
│ character_id (FK) │
│ scene_id (FK)     │
│ created_at        │
└───────────────────┘

┌─────────────────┐
│  audit_logs     │
│─────────────────│
│ id (PK)         │
│ timestamp       │
│ operation       │
│ table_name      │
│ record_id       │
│ user_id         │
│ success         │
│ error_message   │
│ execution_time  │
│ changes         │
└─────────────────┘
```

### Table Categories

**Core Content Tables (Soft Delete Supported):**
- books, chapters, scenes
- characters, character_arcs
- locations, world_elements
- organizations, plot_threads

**Metadata Tables (Read-Only):**
- genres
- lookup_values

**Junction Tables:**
- series_genres
- book_genres
- book_tropes
- character_scenes

**System Tables:**
- audit_logs (Read-Only, Append-Only)
- writing_sessions
- exports

---

## Technology Stack

### Runtime Environment
```
Node.js 20+
├── ES Modules (type: "module")
├── PostgreSQL Native Driver (pg)
└── MCP SDK (@modelcontextprotocol/sdk)
```

### Core Dependencies
```json
{
  "express": "^5.1.0",
  "pg": "^8.13.1",
  "@modelcontextprotocol/sdk": "^1.17.5",
  "dotenv": "^16.4.7",
  "helmet": "^8.0.0"
}
```

### Database
```
PostgreSQL 16+
├── Connection Pooling (2-20 connections)
├── SSL/TLS Support
├── PgBouncer (recommended for production)
└── Foreign Key Constraints
```

### Development Tools
```
├── Custom Test Runner (tests/database-admin-server/run-tests.js)
├── Node.js Assert Module (strict mode)
└── GitHub Actions CI/CD
```

---

## Deployment Architecture

### Production Deployment

```
┌─────────────────────────────────────────────────────────────────┐
│                        Internet                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS (Port 443)
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Load Balancer                                 │
│                    (HAProxy/Nginx)                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
                ↓             ↓             ↓
        ┌──────────────┬──────────────┬──────────────┐
        │  App Server  │  App Server  │  App Server  │
        │  Instance 1  │  Instance 2  │  Instance 3  │
        │              │              │              │
        │ PM2 Cluster  │ PM2 Cluster  │ PM2 Cluster  │
        │ (2 workers)  │ (2 workers)  │ (2 workers)  │
        └──────────────┴──────────────┴──────────────┘
                              │
                              │ PgBouncer Pool
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    PgBouncer                                     │
│                    (Connection Pooler)                           │
│  • Pool Mode: Transaction                                       │
│  • Pool Size: 20                                                │
│  • Max Clients: 1000                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ PostgreSQL Protocol
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                PostgreSQL Primary                                │
│  • Version: 16                                                  │
│  • SSL: Required                                                │
│  • Max Connections: 100                                         │
│  • Shared Buffers: 256MB                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Streaming Replication
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│             PostgreSQL Standby (Read Replica)                    │
│  • Hot Standby Mode                                             │
│  • Used for Read-Heavy Operations                               │
│  • Failover Ready                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Backup Infrastructure

```
┌──────────────────┐
│  App Server      │
│                  │
│  Cron Jobs:      │
│  • 0 2 * * *     │──┐ Full Backup (Daily 2 AM)
│  • 0 */4 * * *   │──┼─┐ Incremental (Every 4 hours)
│  • */15 * * * *  │──┼─┼─┐ WAL Archive (Every 15 min)
└──────────────────┘  │ │ │
                      ↓ ↓ ↓
        ┌──────────────────────────────────┐
        │    Local Backup Storage          │
        │    /backups/                     │
        │  • backup_*.sql.gz               │
        │  • incremental_*.sql.gz          │
        │  • wal_archive/                  │
        └──────────────────────────────────┘
                      │
                      │ rsync/aws s3 sync
                      ↓
        ┌──────────────────────────────────┐
        │   Offsite Backup Storage         │
        │   (S3/Cloud Storage)             │
        │  • Encrypted (AES-256)           │
        │  • Versioned                     │
        │  • 90-day retention              │
        └──────────────────────────────────┘
```

### Monitoring Stack

```
┌──────────────────────────────────────────────────────────────────┐
│                      Application Servers                          │
│  • PM2 Metrics                                                   │
│  • Prometheus Client (metrics endpoint)                          │
│  • Application Logs → Filebeat                                   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                      Prometheus                                   │
│  • Scrapes /metrics every 15s                                    │
│  • Stores time series data                                       │
│  • Alert evaluation                                              │
└──────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
                ↓             ↓             ↓
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Grafana  │  │Alertmgr  │  │  Logs    │
        │Dashboard │  │  Slack   │  │  (ELK)   │
        └──────────┘  └──────────┘  └──────────┘
```

---

**For more information:**
- [API Reference](./API-REFERENCE.md)
- [Security Guide](./SECURITY-GUIDE.md)
- [Operations Guide](./OPERATIONS-GUIDE.md)
- [User Guides](./USER-GUIDES.md)
