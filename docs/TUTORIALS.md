# Database Admin Server - Tutorial Series

Comprehensive step-by-step tutorials for mastering the database admin server

---

## Table of Contents

1. [Tutorial 1: Getting Started - Your First Database Operations](#tutorial-1-getting-started)
2. [Tutorial 2: Building a Book Management System](#tutorial-2-book-management-system)
3. [Tutorial 3: Advanced Querying and Data Analysis](#tutorial-3-advanced-querying)
4. [Tutorial 4: Batch Operations and Performance](#tutorial-4-batch-operations)
5. [Tutorial 5: Backup, Restore, and Data Migration](#tutorial-5-backup-and-migration)

---

## Tutorial 1: Getting Started

### Objectives
- Set up the database admin server
- Understand basic CRUD operations
- Learn to query and filter data
- Create your first records

### Prerequisites
- Node.js 18+ installed
- PostgreSQL 16+ running
- Basic SQL knowledge

### Steps

#### Step 1: Installation and Setup

```bash
# Clone repository
git clone https://github.com/RLRyals/MCP-Writing-Servers.git
cd MCP-Writing-Servers

# Install dependencies
npm install

# Configure database
cp .env.example .env
# Edit .env and set your DATABASE_URL
```

#### Step 2: Initialize Database

```bash
# Run database initialization
psql -U your_user -d your_database -f init.sql

# Verify tables were created
psql -U your_user -d your_database -c "\dt"
```

#### Step 3: Start the Server

```bash
# Start in development mode
npm run dev

# Or directly
node server.js
```

#### Step 4: List Available Tables

**Tool:** `db_list_tables`

```json
{}
```

**Expected Response:**
```json
{
  "tables": [
    {"name": "authors", "type": "BASE TABLE", "rowCount": 0},
    {"name": "books", "type": "BASE TABLE", "rowCount": 0},
    {"name": "characters", "type": "BASE TABLE", "rowCount": 0}
  ],
  "total": 29
}
```

#### Step 5: Inspect a Table Schema

**Tool:** `db_get_schema`

```json
{
  "table": "authors"
}
```

**Expected Response:**
```json
{
  "table": "authors",
  "columns": [
    {
      "name": "id",
      "type": "integer",
      "nullable": false,
      "isPrimaryKey": true
    },
    {
      "name": "name",
      "type": "character varying(200)",
      "nullable": false
    },
    {
      "name": "email",
      "type": "character varying(255)",
      "nullable": true
    }
  ]
}
```

#### Step 6: Insert Your First Record

**Tool:** `db_insert_record`

```json
{
  "table": "authors",
  "data": {
    "name": "Jane Austen",
    "email": "jane@example.com",
    "bio": "English novelist known for her six major novels"
  }
}
```

**Expected Response:**
```json
{
  "id": 1,
  "name": "Jane Austen",
  "email": "jane@example.com",
  "bio": "English novelist known for her six major novels",
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-01-15T10:00:00Z"
}
```

#### Step 7: Query Records

**Tool:** `db_query_records`

```json
{
  "table": "authors",
  "columns": ["id", "name", "email"],
  "limit": 10
}
```

**Expected Response:**
```json
{
  "total": 1,
  "count": 1,
  "records": [
    {
      "id": 1,
      "name": "Jane Austen",
      "email": "jane@example.com"
    }
  ]
}
```

#### Step 8: Update a Record

**Tool:** `db_update_records`

```json
{
  "table": "authors",
  "data": {
    "bio": "English novelist, 1775-1817, known for Pride and Prejudice"
  },
  "where": {
    "id": 1
  }
}
```

**Expected Response:**
```json
{
  "updated": 1,
  "records": [
    {
      "id": 1,
      "name": "Jane Austen",
      "bio": "English novelist, 1775-1817, known for Pride and Prejudice",
      "updated_at": "2024-01-15T10:05:00Z"
    }
  ]
}
```

### Exercise

1. Create 3 more authors
2. Query all authors
3. Update one author's email
4. Delete one author (soft delete)

### Key Takeaways

✓ The server provides 25 tools for database operations
✓ All operations are audited automatically
✓ Primary keys are auto-generated
✓ Timestamps are auto-maintained
✓ Always specify a `where` clause for updates/deletes

---

## Tutorial 2: Book Management System

### Objectives
- Model complex relationships
- Work with foreign keys
- Create related records
- Query across relationships

### Steps

#### Step 1: Understand the Data Model

```
Authors (1) ─── (M) Books (1) ─── (M) Chapters
                  │
                  └─── (M) Characters
```

#### Step 2: Create an Author

```json
{
  "table": "authors",
  "data": {
    "name": "Brandon Sanderson",
    "email": "brandon@example.com",
    "bio": "Fantasy and science fiction author"
  }
}
```

**Response:**
```json
{
  "id": 2,
  "name": "Brandon Sanderson",
  ...
}
```

Remember this `id` (2) - we'll use it for the book!

#### Step 3: Create a Book with Foreign Key

```json
{
  "table": "books",
  "data": {
    "title": "The Way of Kings",
    "author_id": 2,
    "genre": "fantasy",
    "status": "published",
    "word_count": 386000,
    "published_at": "2010-08-31T00:00:00Z"
  }
}
```

**Response:**
```json
{
  "id": 1,
  "title": "The Way of Kings",
  "author_id": 2,
  "status": "published",
  ...
}
```

#### Step 4: Verify the Relationship

**Tool:** `db_get_relationships`

```json
{
  "table": "books",
  "depth": 1
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

#### Step 5: Create Chapters Using Batch Insert

**Tool:** `db_batch_insert`

```json
{
  "table": "chapters",
  "records": [
    {
      "book_id": 1,
      "chapter_number": 1,
      "title": "Prelude to the Stormlight Archive",
      "word_count": 3500
    },
    {
      "book_id": 1,
      "chapter_number": 2,
      "title": "Szeth-son-son-Vallano",
      "word_count": 4200
    },
    {
      "book_id": 1,
      "chapter_number": 3,
      "title": "Cenn's Story",
      "word_count": 5100
    }
  ],
  "returnRecords": true
}
```

**Response:**
```json
{
  "inserted": 3,
  "records": [...]
}
```

#### Step 6: Query Book with Chapter Count

```json
{
  "table": "books",
  "where": {
    "id": 1
  }
}
```

Then query chapters:

```json
{
  "table": "chapters",
  "where": {
    "book_id": 1
  },
  "orderBy": [
    {
      "column": "chapter_number",
      "direction": "ASC"
    }
  ]
}
```

#### Step 7: Create Characters for the Book

```json
{
  "table": "characters",
  "records": [
    {
      "name": "Kaladin Stormblessed",
      "role": "protagonist",
      "description": "Former soldier, now a slave",
      "age": 20
    },
    {
      "name": "Shallan Davar",
      "role": "protagonist",
      "description": "Young scholar from a fallen house",
      "age": 17
    },
    {
      "name": "Dalinar Kholin",
      "role": "protagonist",
      "description": "Highprince and Blackthorn",
      "age": 52
    }
  ]
}
```

#### Step 8: Find All Books by an Author

```json
{
  "table": "books",
  "where": {
    "author_id": 2
  },
  "columns": ["id", "title", "status", "word_count"],
  "orderBy": [
    {
      "column": "published_at",
      "direction": "DESC"
    }
  ]
}
```

### Exercise

1. Create a new series
2. Add the book to the series
3. Create 5 more chapters
4. Query all books in the series
5. Update the book status to "editing"

### Key Takeaways

✓ Always create parent records before child records
✓ Foreign keys are validated automatically
✓ Use `db_get_relationships` to understand connections
✓ Batch operations are more efficient for multiple records
✓ Use ORDER BY for consistent results

---

## Tutorial 3: Advanced Querying

### Objectives
- Master complex WHERE clauses
- Use comparison operators
- Implement pagination
- Optimize query performance

### Steps

#### Step 1: Using Comparison Operators

**Find books with word count over 100,000:**

```json
{
  "table": "books",
  "where": {
    "word_count": {
      "$gte": 100000
    }
  },
  "columns": ["id", "title", "word_count"]
}
```

#### Step 2: Pattern Matching

**Find authors whose name contains "Smith":**

```json
{
  "table": "authors",
  "where": {
    "name": {
      "$ilike": "%Smith%"
    }
  }
}
```

#### Step 3: IN Operator for Multiple Values

**Find books in specific genres:**

```json
{
  "table": "books",
  "where": {
    "genre": {
      "$in": ["fantasy", "science fiction", "mystery"]
    }
  }
}
```

#### Step 4: Combining Multiple Conditions

**Find published fantasy books over 50,000 words:**

```json
{
  "table": "books",
  "where": {
    "status": "published",
    "genre": "fantasy",
    "word_count": {
      "$gte": 50000
    }
  },
  "orderBy": [
    {
      "column": "published_at",
      "direction": "DESC"
    }
  ]
}
```

#### Step 5: Handling NULL Values

**Find characters without assigned age:**

```json
{
  "table": "characters",
  "where": {
    "age": {
      "$null": true
    }
  }
}
```

**Find characters with age:**

```json
{
  "table": "characters",
  "where": {
    "age": {
      "$null": false
    }
  }
}
```

#### Step 6: Implementing Pagination

**Page 1 (first 20 books):**

```json
{
  "table": "books",
  "limit": 20,
  "offset": 0,
  "orderBy": [{"column": "created_at", "direction": "DESC"}]
}
```

**Page 2 (next 20 books):**

```json
{
  "table": "books",
  "limit": 20,
  "offset": 20,
  "orderBy": [{"column": "created_at", "direction": "DESC"}]
}
```

#### Step 7: Selecting Specific Columns

**Get only IDs and titles:**

```json
{
  "table": "books",
  "columns": ["id", "title"],
  "limit": 100
}
```

#### Step 8: Date Range Queries

**Find books created this month:**

```json
{
  "table": "books",
  "where": {
    "created_at": {
      "$gte": "2024-01-01T00:00:00Z",
      "$lte": "2024-01-31T23:59:59Z"
    }
  }
}
```

### Exercise

1. Find all draft books
2. Find books published in the last year
3. Find characters aged between 20 and 40
4. Implement a paginated book list (10 per page)
5. Find books with titles starting with "The"

### Key Takeaways

✓ Use comparison operators ($gte, $lt, etc.) for ranges
✓ $ilike is case-insensitive, $like is case-sensitive
✓ Always use ORDER BY with pagination
✓ Select only needed columns for better performance
✓ Combine multiple conditions for precise filtering

---

## Tutorial 4: Batch Operations

### Objectives
- Understand atomic transactions
- Optimize bulk operations
- Handle batch errors
- Implement data migrations

### Steps

#### Step 1: Batch Insert Characters

**Import 10 characters at once:**

```json
{
  "table": "characters",
  "records": [
    {"name": "Character 1", "role": "supporting"},
    {"name": "Character 2", "role": "supporting"},
    {"name": "Character 3", "role": "supporting"},
    {"name": "Character 4", "role": "antagonist"},
    {"name": "Character 5", "role": "supporting"},
    {"name": "Character 6", "role": "supporting"},
    {"name": "Character 7", "role": "supporting"},
    {"name": "Character 8", "role": "supporting"},
    {"name": "Character 9", "role": "supporting"},
    {"name": "Character 10", "role": "supporting"}
  ]
}
```

**Response:**
```json
{
  "inserted": 10
}
```

**Performance:** 10 individual inserts might take 100ms, batch insert takes ~15ms!

#### Step 2: Batch Update Book Statuses

**Publish multiple books at once:**

```json
{
  "table": "books",
  "updates": [
    {
      "data": {"status": "published", "published_at": "2024-01-15T00:00:00Z"},
      "where": {"id": 1}
    },
    {
      "data": {"status": "published", "published_at": "2024-01-15T00:00:00Z"},
      "where": {"id": 2}
    },
    {
      "data": {"status": "published", "published_at": "2024-01-15T00:00:00Z"},
      "where": {"id": 3}
    }
  ]
}
```

**Response:**
```json
{
  "totalUpdated": 3,
  "results": [
    {"updated": 1},
    {"updated": 1},
    {"updated": 1}
  ]
}
```

#### Step 3: Understanding Atomicity

**All-or-nothing behavior:**

If any record in the batch fails, the entire operation rolls back.

```json
{
  "table": "books",
  "records": [
    {"title": "Valid Book", "author_id": 1, "genre": "fantasy"},
    {"title": "Invalid Book", "author_id": 999, "genre": "fantasy"}
  ]
}
```

**This will fail** because author_id 999 doesn't exist. **Zero records** will be inserted.

#### Step 4: Batch Delete Test Data

**Clean up test records:**

```json
{
  "table": "characters",
  "deletes": [
    {"where": {"name": {"$like": "Test%"}}},
    {"where": {"role": "test"}}
  ],
  "hard": true
}
```

#### Step 5: Performance Comparison

**Single inserts (slow):**
```
INSERT 1: 10ms
INSERT 2: 12ms
INSERT 3: 11ms
...
INSERT 100: 10ms
Total: ~1100ms
```

**Batch insert (fast):**
```
BATCH INSERT 100 records: 85ms
Total: 85ms
```

**13x faster!**

#### Step 6: Handling Large Datasets

For datasets > 1000 records, split into batches:

```javascript
const allRecords = [...]; // 5000 records
const batchSize = 1000;

for (let i = 0; i < allRecords.length; i += batchSize) {
  const batch = allRecords.slice(i, i + batchSize);

  await db.batchInsert({
    table: "characters",
    records: batch
  });

  console.log(`Inserted batch ${i / batchSize + 1}`);
}
```

### Exercise

1. Create 20 characters using batch insert
2. Update 5 books to "published" status using batch update
3. Delete test data using batch delete
4. Measure performance difference between single and batch operations
5. Implement a data migration script using batch operations

### Key Takeaways

✓ Batch operations are 10-20x faster than individual operations
✓ Transactions are atomic (all-or-nothing)
✓ Maximum batch size is 1000 records
✓ Split large datasets into multiple batches
✓ Use batch operations for data migrations

---

## Tutorial 5: Backup and Migration

### Objectives
- Create regular backups
- Restore from backups
- Export and import data
- Implement disaster recovery

### Steps

#### Step 1: Create a Full Backup

**Tool:** `db_backup_full`

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

**Save this filename!** You'll need it for restoration.

#### Step 2: Create Table-Specific Backup

**Backup just the books table:**

```json
{
  "table": "books",
  "compress": true
}
```

**Response:**
```json
{
  "backupFile": "table_backup_books_2024-01-15.sql.gz",
  "table": "books",
  "recordCount": 567,
  "size": 128000
}
```

#### Step 3: Create Incremental Backup

**Backup changes since yesterday:**

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
  "size": 45600
}
```

#### Step 4: Export Data as JSON

**Export all authors:**

```json
{
  "table": "authors",
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

The file contains:
```json
[
  {
    "id": 1,
    "name": "Jane Austen",
    "email": "jane@example.com",
    ...
  },
  {
    "id": 2,
    "name": "Brandon Sanderson",
    ...
  }
]
```

#### Step 5: Export Data as CSV

**Export books for analysis:**

```json
{
  "table": "books",
  "columns": ["id", "title", "author_id", "word_count", "status"],
  "includeHeaders": true
}
```

**Response:**
```json
{
  "exportFile": "export_books_2024-01-15.csv",
  "table": "books",
  "recordCount": 567,
  "format": "csv"
}
```

#### Step 6: Import Data from JSON

```json
{
  "table": "characters",
  "data": [
    {
      "name": "Imported Character",
      "role": "protagonist",
      "description": "Migrated from old system"
    }
  ],
  "mode": "insert"
}
```

#### Step 7: List Available Backups

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
      "compressed": true
    },
    {
      "file": "backup_2024-01-14_020000.sql.gz",
      "type": "full",
      "size": 2401200,
      "created": "2024-01-14T02:00:00Z",
      "compressed": true
    }
  ],
  "total": 2
}
```

#### Step 8: Validate Backup Integrity

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
  "checksum": "a7f3c2e9d8b4a1f6e5c3d2b1a0f9e8d7",
  "verified": true,
  "tables": 29
}
```

#### Step 9: Restore from Backup (CAUTION!)

**⚠️ WARNING: This will modify your database!**

```json
{
  "backupFile": "backup_2024-01-15_103045.sql.gz",
  "dropExisting": false,
  "skipErrors": false
}
```

Only use in test environments or for disaster recovery!

#### Step 10: Delete Old Backups

**Clean up backups older than 30 days:**

```json
{
  "backupFile": "backup_2024-01-01_020000.sql.gz"
}
```

### Exercise

1. Create a full backup of your database
2. Export authors as JSON
3. Export books as CSV
4. Validate the backup
5. Create an incremental backup
6. List all backups
7. Set up a backup schedule (cron job)

### Backup Schedule Recommendation

```bash
# Daily full backup at 2 AM
0 2 * * * node scripts/backup-full.js

# Hourly incremental backup
0 * * * * node scripts/backup-incremental.js

# Weekly backup validation on Sunday at 3 AM
0 3 * * 0 node scripts/validate-backups.js

# Monthly cleanup of backups older than 90 days
0 4 1 * * node scripts/cleanup-old-backups.js
```

### Key Takeaways

✓ Always maintain recent backups
✓ Validate backups regularly
✓ Use incremental backups for frequent changes
✓ Export data before major operations
✓ Test restoration procedures
✓ Automate backup schedule
✓ Store backups in secure location

---

## Next Steps

Now that you've completed all tutorials, you should:

1. ✓ Understand all 25 database tools
2. ✓ Be able to perform CRUD operations
3. ✓ Know how to use batch operations
4. ✓ Understand backup and restore procedures
5. ✓ Be comfortable with complex queries

**Continue learning:**
- [API Reference](./API-REFERENCE.md) - Detailed documentation for all tools
- [Examples](./EXAMPLES.md) - 70+ code examples
- [User Guides](./USER-GUIDES.md) - Role-specific guides
- [Security Guide](./SECURITY-GUIDE.md) - Security best practices

**Practice projects:**
- Build a complete book management system
- Implement an automated backup system
- Create a data migration pipeline
- Build an audit dashboard
- Develop an AI-powered writing assistant

Happy coding! 🚀
