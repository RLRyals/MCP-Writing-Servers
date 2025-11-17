# Database Admin Server - Comprehensive Examples

A collection of 50+ real-world code examples for all 25 database admin server tools, organized by use case and featuring a writing/publishing database schema.

---

## Table of Contents

1. [Phase 1: CRUD Operations](#phase-1-crud-operations)
2. [Phase 2: Batch Operations](#phase-2-batch-operations)
3. [Phase 3: Schema Introspection](#phase-3-schema-introspection)
4. [Phase 4: Audit Operations](#phase-4-audit-operations)
5. [Phase 5: Backup & Restore Operations](#phase-5-backup--restore-operations)
6. [Advanced Use Cases](#advanced-use-cases)
7. [Error Handling Examples](#error-handling-examples)

---

## Phase 1: CRUD Operations

### Example 1: Simple Query - List All Published Books

**Use Case:** Retrieve all published books for display on a website

**Tool Call:**
```json
{
  "table": "books",
  "columns": ["id", "title", "author_id", "published_at"],
  "where": {
    "status": "published"
  },
  "orderBy": [
    { "column": "published_at", "direction": "DESC" }
  ],
  "limit": 20
}
```

**Expected Response:**
```json
{
  "total": 127,
  "count": 20,
  "offset": 0,
  "limit": 20,
  "records": [
    {
      "id": 45,
      "title": "The Dragon's Quest",
      "author_id": 12,
      "published_at": "2024-01-15T00:00:00Z"
    },
    {
      "id": 43,
      "title": "Space Odyssey 2084",
      "author_id": 8,
      "published_at": "2024-01-10T00:00:00Z"
    }
  ]
}
```

**Notes:**
- Use pagination for large result sets
- Specify only needed columns to improve performance
- DESC ordering shows newest books first

---

### Example 2: Advanced Query - Find Books by Genre with Word Count Range

**Use Case:** Search for fantasy books within a specific word count range

**Tool Call:**
```json
{
  "table": "books",
  "columns": ["id", "title", "word_count", "genre", "status"],
  "where": {
    "genre": { "$in": ["fantasy", "epic fantasy", "dark fantasy"] },
    "word_count": { "$gte": 80000, "$lte": 120000 },
    "status": "published"
  },
  "orderBy": [
    { "column": "word_count", "direction": "ASC" }
  ],
  "limit": 50
}
```

**Expected Response:**
```json
{
  "total": 23,
  "count": 23,
  "offset": 0,
  "limit": 50,
  "records": [
    {
      "id": 78,
      "title": "Shadows of the Kingdom",
      "word_count": 82500,
      "genre": "dark fantasy",
      "status": "published"
    }
  ]
}
```

**Notes:**
- `$in` operator allows searching across multiple genres
- Combining `$gte` and `$lte` creates a range filter
- Results sorted by word_count for easy comparison

---

### Example 3: Pattern Matching - Search Books by Title

**Use Case:** Search for books with "dragon" in the title (case-insensitive)

**Tool Call:**
```json
{
  "table": "books",
  "columns": ["id", "title", "author_id", "status"],
  "where": {
    "title": { "$ilike": "%dragon%" }
  },
  "limit": 10
}
```

**Expected Response:**
```json
{
  "total": 7,
  "count": 7,
  "offset": 0,
  "limit": 10,
  "records": [
    {
      "id": 45,
      "title": "The Dragon's Quest",
      "author_id": 12,
      "status": "published"
    },
    {
      "id": 89,
      "title": "Dragon Riders of Pern",
      "author_id": 23,
      "status": "draft"
    }
  ]
}
```

**Notes:**
- `$ilike` is case-insensitive (use `$like` for case-sensitive)
- `%` is a wildcard matching any characters
- Useful for search functionality in applications

---

### Example 4: NULL Checks - Find Books Without Published Dates

**Use Case:** Identify draft books that haven't been published yet

**Tool Call:**
```json
{
  "table": "books",
  "columns": ["id", "title", "status", "published_at"],
  "where": {
    "published_at": { "$null": true },
    "status": "draft"
  },
  "orderBy": [
    { "column": "created_at", "direction": "DESC" }
  ],
  "limit": 25
}
```

**Expected Response:**
```json
{
  "total": 34,
  "count": 25,
  "offset": 0,
  "limit": 25,
  "records": [
    {
      "id": 102,
      "title": "Untitled Fantasy Project",
      "status": "draft",
      "published_at": null
    }
  ]
}
```

**Notes:**
- `$null: true` finds NULL values
- `$null: false` finds non-NULL values
- Useful for finding incomplete records

---

### Example 5: Pagination - Navigate Through Large Result Sets

**Use Case:** Implement pagination for browsing all authors

**Tool Call (Page 1):**
```json
{
  "table": "authors",
  "columns": ["id", "name", "email", "book_count"],
  "orderBy": [
    { "column": "name", "direction": "ASC" }
  ],
  "limit": 20,
  "offset": 0
}
```

**Tool Call (Page 2):**
```json
{
  "table": "authors",
  "columns": ["id", "name", "email", "book_count"],
  "orderBy": [
    { "column": "name", "direction": "ASC" }
  ],
  "limit": 20,
  "offset": 20
}
```

**Expected Response:**
```json
{
  "total": 142,
  "count": 20,
  "offset": 20,
  "limit": 20,
  "records": [...]
}
```

**Notes:**
- offset = (page - 1) * limit
- Keep orderBy consistent across pages
- total tells you how many pages exist: Math.ceil(total / limit)

---

### Example 6: Insert Record - Create a New Author

**Use Case:** Add a new author to the database

**Tool Call:**
```json
{
  "table": "authors",
  "data": {
    "name": "Jane Smith",
    "email": "jane.smith@example.com",
    "bio": "Award-winning science fiction author with 15 years of experience",
    "nationality": "USA",
    "birth_year": 1985
  }
}
```

**Expected Response:**
```json
{
  "id": 143,
  "name": "Jane Smith",
  "email": "jane.smith@example.com",
  "bio": "Award-winning science fiction author with 15 years of experience",
  "nationality": "USA",
  "birth_year": 1985,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

**Notes:**
- ID is auto-generated
- Timestamps are automatically set
- Returns the complete inserted record
- Email validation happens at database level

---

### Example 7: Insert Record - Create a New Book with Foreign Key

**Use Case:** Create a new book associated with an author

**Tool Call:**
```json
{
  "table": "books",
  "data": {
    "author_id": 143,
    "title": "Journey to the Stars",
    "genre": "science fiction",
    "status": "draft",
    "word_count": 0,
    "target_word_count": 90000,
    "description": "An epic space adventure spanning multiple galaxies"
  }
}
```

**Expected Response:**
```json
{
  "id": 568,
  "author_id": 143,
  "title": "Journey to the Stars",
  "genre": "science fiction",
  "status": "draft",
  "word_count": 0,
  "target_word_count": 90000,
  "description": "An epic space adventure spanning multiple galaxies",
  "created_at": "2024-01-15T10:35:00Z",
  "updated_at": "2024-01-15T10:35:00Z",
  "published_at": null,
  "deleted_at": null
}
```

**Notes:**
- author_id must exist in authors table (foreign key constraint)
- If author_id is invalid, you'll get a FOREIGN_KEY_VIOLATION error
- status defaults may vary by database schema

---

### Example 8: Update Record - Publish a Book

**Use Case:** Change a book's status from draft to published

**Tool Call:**
```json
{
  "table": "books",
  "data": {
    "status": "published",
    "published_at": "2024-01-20T00:00:00Z"
  },
  "where": {
    "id": 568
  }
}
```

**Expected Response:**
```json
{
  "updated": 1,
  "records": [
    {
      "id": 568,
      "author_id": 143,
      "title": "Journey to the Stars",
      "status": "published",
      "published_at": "2024-01-20T00:00:00Z",
      "updated_at": "2024-01-20T09:00:00Z"
    }
  ]
}
```

**Notes:**
- updated_at is automatically set
- WHERE clause is mandatory to prevent accidental updates
- Returns the updated record(s)

---

### Example 9: Update Multiple Records - Bulk Status Change

**Use Case:** Archive all books from a specific year

**Tool Call:**
```json
{
  "table": "books",
  "data": {
    "status": "archived"
  },
  "where": {
    "published_at": { "$gte": "2020-01-01T00:00:00Z", "$lt": "2021-01-01T00:00:00Z" }
  }
}
```

**Expected Response:**
```json
{
  "updated": 23,
  "records": [
    {
      "id": 301,
      "title": "Book from 2020",
      "status": "archived",
      "updated_at": "2024-01-15T10:40:00Z"
    }
  ]
}
```

**Notes:**
- Can update multiple records at once
- All matched records are updated in a single transaction
- Use with caution - verify WHERE clause first with a query

---

### Example 10: Update with Complex Conditions

**Use Case:** Update all draft books older than 6 months to "abandoned" status

**Tool Call:**
```json
{
  "table": "books",
  "data": {
    "status": "abandoned"
  },
  "where": {
    "status": "draft",
    "updated_at": { "$lt": "2023-07-15T00:00:00Z" }
  }
}
```

**Expected Response:**
```json
{
  "updated": 12,
  "records": [...]
}
```

**Notes:**
- Combines multiple WHERE conditions (AND logic)
- Date comparison using `$lt` operator
- Useful for cleanup and maintenance tasks

---

### Example 11: Soft Delete - Remove a Character

**Use Case:** Soft delete a character (can be restored later)

**Tool Call:**
```json
{
  "table": "characters",
  "where": {
    "id": 456
  },
  "hard": false
}
```

**Expected Response:**
```json
{
  "deleted": 1,
  "type": "soft",
  "records": [
    {
      "id": 456,
      "name": "John Doe",
      "deleted_at": "2024-01-15T10:45:00Z"
    }
  ]
}
```

**Notes:**
- Soft delete sets deleted_at timestamp
- Record remains in database
- Can be restored by setting deleted_at to NULL
- Queries by default exclude soft-deleted records

---

### Example 12: Hard Delete - Permanently Remove a Record

**Use Case:** Permanently delete test data

**Tool Call:**
```json
{
  "table": "characters",
  "where": {
    "name": { "$like": "TEST%" }
  },
  "hard": true
}
```

**Expected Response:**
```json
{
  "deleted": 5,
  "type": "hard",
  "records": [
    {
      "id": 999,
      "name": "TEST Character 1"
    }
  ]
}
```

**Notes:**
- Hard delete is permanent and cannot be undone
- May fail if foreign key constraints exist
- Use with extreme caution in production
- Consider soft delete for most use cases

---

### Example 13: Delete with Safety Check

**Use Case:** Delete a specific book only if it's in draft status

**Tool Call:**
```json
{
  "table": "books",
  "where": {
    "id": 999,
    "status": "draft"
  },
  "hard": false
}
```

**Expected Response:**
```json
{
  "deleted": 1,
  "type": "soft",
  "records": [
    {
      "id": 999,
      "title": "Abandoned Project",
      "status": "draft",
      "deleted_at": "2024-01-15T10:50:00Z"
    }
  ]
}
```

**Notes:**
- Multiple WHERE conditions act as safety checks
- If book is not draft, no records will be deleted
- Returns deleted: 0 if conditions don't match
- Good practice for conditional deletions

---

### Example 14: Query with Multiple Ordering

**Use Case:** List books ordered by status, then by word count

**Tool Call:**
```json
{
  "table": "books",
  "columns": ["id", "title", "status", "word_count"],
  "orderBy": [
    { "column": "status", "direction": "ASC" },
    { "column": "word_count", "direction": "DESC" }
  ],
  "limit": 30
}
```

**Expected Response:**
```json
{
  "total": 567,
  "count": 30,
  "offset": 0,
  "limit": 30,
  "records": [
    {
      "id": 23,
      "title": "Long Abandoned Book",
      "status": "abandoned",
      "word_count": 125000
    },
    {
      "id": 87,
      "title": "Another Abandoned",
      "status": "abandoned",
      "word_count": 98000
    }
  ]
}
```

**Notes:**
- First orderBy takes precedence
- Within each status group, books are sorted by word count
- Useful for hierarchical sorting

---

### Example 15: Insert with Minimal Data

**Use Case:** Quick chapter creation with only required fields

**Tool Call:**
```json
{
  "table": "chapters",
  "data": {
    "book_id": 568,
    "title": "Chapter 1: The Beginning",
    "chapter_number": 1
  }
}
```

**Expected Response:**
```json
{
  "id": 1234,
  "book_id": 568,
  "title": "Chapter 1: The Beginning",
  "chapter_number": 1,
  "content": null,
  "word_count": 0,
  "status": "draft",
  "created_at": "2024-01-15T11:00:00Z",
  "updated_at": "2024-01-15T11:00:00Z"
}
```

**Notes:**
- Only required fields need to be provided
- Optional fields use database defaults
- NULL values are acceptable for nullable columns

---

## Phase 2: Batch Operations

### Example 16: Batch Insert - Import Multiple Characters

**Use Case:** Bulk import character list for a new book

**Tool Call:**
```json
{
  "table": "characters",
  "records": [
    {
      "name": "Alice Wonderland",
      "role": "protagonist",
      "age": 28,
      "description": "Brave and curious explorer"
    },
    {
      "name": "Bob the Builder",
      "role": "supporting",
      "age": 35,
      "description": "Skilled craftsman and mentor"
    },
    {
      "name": "Charlie the Villain",
      "role": "antagonist",
      "age": 45,
      "description": "Ruthless and cunning adversary"
    }
  ],
  "returnRecords": true
}
```

**Expected Response:**
```json
{
  "inserted": 3,
  "records": [
    {
      "id": 501,
      "name": "Alice Wonderland",
      "role": "protagonist",
      "age": 28,
      "description": "Brave and curious explorer",
      "created_at": "2024-01-15T11:05:00Z",
      "updated_at": "2024-01-15T11:05:00Z"
    },
    {
      "id": 502,
      "name": "Bob the Builder",
      "role": "supporting",
      "age": 35,
      "description": "Skilled craftsman and mentor",
      "created_at": "2024-01-15T11:05:00Z",
      "updated_at": "2024-01-15T11:05:00Z"
    },
    {
      "id": 503,
      "name": "Charlie the Villain",
      "role": "antagonist",
      "age": 45,
      "description": "Ruthless and cunning adversary",
      "created_at": "2024-01-15T11:05:00Z",
      "updated_at": "2024-01-15T11:05:00Z"
    }
  ]
}
```

**Notes:**
- All records inserted in single transaction (atomic)
- If one record fails validation, entire batch rolls back
- returnRecords: true returns all inserted records with IDs
- Maximum 1000 records per batch

---

### Example 17: Batch Insert - Create Multiple Chapters

**Use Case:** Initialize chapter structure for a new book

**Tool Call:**
```json
{
  "table": "chapters",
  "records": [
    {
      "book_id": 568,
      "chapter_number": 1,
      "title": "Chapter 1: The Journey Begins"
    },
    {
      "book_id": 568,
      "chapter_number": 2,
      "title": "Chapter 2: First Encounter"
    },
    {
      "book_id": 568,
      "chapter_number": 3,
      "title": "Chapter 3: The Discovery"
    },
    {
      "book_id": 568,
      "chapter_number": 4,
      "title": "Chapter 4: Rising Tension"
    },
    {
      "book_id": 568,
      "chapter_number": 5,
      "title": "Chapter 5: The Confrontation"
    }
  ],
  "returnRecords": false
}
```

**Expected Response:**
```json
{
  "inserted": 5,
  "records": []
}
```

**Notes:**
- returnRecords: false improves performance for large batches
- All chapters share same book_id
- Useful for scaffolding new book structure
- Chapter numbers help maintain order

---

### Example 18: Batch Insert - Large Data Import

**Use Case:** Import 500 location records from world-building spreadsheet

**Tool Call:**
```json
{
  "table": "locations",
  "records": [
    {
      "name": "The Capital City",
      "type": "city",
      "description": "Bustling metropolis and center of trade",
      "population": 500000
    },
    {
      "name": "Dark Forest",
      "type": "wilderness",
      "description": "Ancient and mysterious forest",
      "population": 0
    }
    // ... 498 more records
  ],
  "returnRecords": false
}
```

**Expected Response:**
```json
{
  "inserted": 500
}
```

**Notes:**
- For 500+ records, consider splitting into multiple batches
- returnRecords: false reduces memory usage
- Monitor execution time (target: < 5 seconds for 1000 records)
- Validate data before batch insertion

---

### Example 19: Batch Update - Update Multiple Books' Status

**Use Case:** Publish multiple books that completed review

**Tool Call:**
```json
{
  "table": "books",
  "updates": [
    {
      "data": {
        "status": "published",
        "published_at": "2024-01-20T00:00:00Z"
      },
      "where": { "id": 101 }
    },
    {
      "data": {
        "status": "published",
        "published_at": "2024-01-20T00:00:00Z"
      },
      "where": { "id": 102 }
    },
    {
      "data": {
        "status": "published",
        "published_at": "2024-01-20T00:00:00Z"
      },
      "where": { "id": 103 }
    }
  ]
}
```

**Expected Response:**
```json
{
  "totalUpdated": 3,
  "results": [
    { "updated": 1 },
    { "updated": 1 },
    { "updated": 1 }
  ]
}
```

**Notes:**
- Each update has independent WHERE clause
- All updates happen in single transaction
- If any update fails, all are rolled back
- Maximum 100 update operations per batch

---

### Example 20: Batch Update - Different Updates per Record

**Use Case:** Update multiple characters with different attributes

**Tool Call:**
```json
{
  "table": "characters",
  "updates": [
    {
      "data": { "age": 29, "status": "active" },
      "where": { "id": 501 }
    },
    {
      "data": { "role": "mentor", "age": 36 },
      "where": { "id": 502 }
    },
    {
      "data": { "description": "Former villain seeking redemption" },
      "where": { "id": 503 }
    }
  ]
}
```

**Expected Response:**
```json
{
  "totalUpdated": 3,
  "results": [
    { "updated": 1 },
    { "updated": 1 },
    { "updated": 1 }
  ]
}
```

**Notes:**
- Each update can modify different fields
- Flexible for complex update scenarios
- More efficient than individual update calls
- Maintains data consistency with transactions

---

### Example 21: Batch Update - Conditional Updates

**Use Case:** Increment word counts for multiple chapters

**Tool Call:**
```json
{
  "table": "chapters",
  "updates": [
    {
      "data": { "word_count": 2500, "status": "complete" },
      "where": { "id": 1001, "status": "draft" }
    },
    {
      "data": { "word_count": 3200, "status": "complete" },
      "where": { "id": 1002, "status": "draft" }
    },
    {
      "data": { "word_count": 2800, "status": "complete" },
      "where": { "id": 1003, "status": "draft" }
    }
  ]
}
```

**Expected Response:**
```json
{
  "totalUpdated": 3,
  "results": [
    { "updated": 1 },
    { "updated": 1 },
    { "updated": 1 }
  ]
}
```

**Notes:**
- WHERE clause includes status check for safety
- Only updates if chapter is still in draft
- If chapter already complete, that update returns 0
- Good practice for conditional batch updates

---

### Example 22: Batch Delete - Remove Multiple Test Records

**Use Case:** Clean up test data after development

**Tool Call:**
```json
{
  "table": "scenes",
  "deletes": [
    { "where": { "id": 5001 } },
    { "where": { "id": 5002 } },
    { "where": { "id": 5003 } },
    { "where": { "id": 5004 } },
    { "where": { "id": 5005 } }
  ],
  "hard": true
}
```

**Expected Response:**
```json
{
  "totalDeleted": 5,
  "type": "hard",
  "results": [
    { "deleted": 1 },
    { "deleted": 1 },
    { "deleted": 1 },
    { "deleted": 1 },
    { "deleted": 1 }
  ]
}
```

**Notes:**
- hard: true permanently removes records
- All deletes in single transaction
- Use for test data cleanup
- Be cautious with hard deletes in production

---

### Example 23: Batch Delete - Soft Delete Multiple Characters

**Use Case:** Archive characters no longer needed in story

**Tool Call:**
```json
{
  "table": "characters",
  "deletes": [
    { "where": { "id": 601 } },
    { "where": { "id": 602 } },
    { "where": { "id": 603 } }
  ],
  "hard": false
}
```

**Expected Response:**
```json
{
  "totalDeleted": 3,
  "type": "soft",
  "results": [
    { "deleted": 1 },
    { "deleted": 1 },
    { "deleted": 1 }
  ]
}
```

**Notes:**
- Soft delete preserves data for potential restoration
- Sets deleted_at timestamp
- Can be undone with UPDATE query
- Recommended for most deletion scenarios

---

### Example 24: Batch Operations - Error Handling

**Use Case:** Attempt batch insert with some invalid records

**Tool Call:**
```json
{
  "table": "books",
  "records": [
    {
      "author_id": 143,
      "title": "Valid Book",
      "status": "draft"
    },
    {
      "author_id": 99999,
      "title": "Invalid Book - Bad Author ID",
      "status": "draft"
    }
  ],
  "returnRecords": false
}
```

**Expected Response:**
```json
{
  "error": true,
  "message": "Foreign key constraint violation",
  "code": "FOREIGN_KEY_VIOLATION",
  "details": {
    "constraint": "fk_book_author",
    "column": "author_id",
    "value": 99999
  }
}
```

**Notes:**
- Entire batch fails if one record is invalid
- Transaction rolled back automatically
- No partial inserts
- Validate data before batch operations when possible

---

## Phase 3: Schema Introspection

### Example 25: Get Schema - Inspect Books Table Structure

**Use Case:** Understand the structure of the books table

**Tool Call:**
```json
{
  "table": "books"
}
```

**Expected Response:**
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
      "default": null,
      "isPrimaryKey": false,
      "isForeignKey": false
    },
    {
      "name": "genre",
      "type": "character varying(100)",
      "nullable": true,
      "default": null,
      "isPrimaryKey": false,
      "isForeignKey": false
    },
    {
      "name": "status",
      "type": "character varying(50)",
      "nullable": false,
      "default": "'draft'",
      "isPrimaryKey": false,
      "isForeignKey": false
    },
    {
      "name": "word_count",
      "type": "integer",
      "nullable": true,
      "default": "0",
      "isPrimaryKey": false,
      "isForeignKey": false
    }
  ],
  "primaryKey": ["id"],
  "foreignKeys": [
    {
      "column": "author_id",
      "references": {
        "table": "authors",
        "column": "id"
      }
    }
  ],
  "indexes": [
    {
      "name": "idx_books_author_id",
      "columns": ["author_id"],
      "unique": false
    },
    {
      "name": "idx_books_status",
      "columns": ["status"],
      "unique": false
    }
  ],
  "constraints": [
    {
      "name": "books_pkey",
      "type": "PRIMARY KEY",
      "definition": "PRIMARY KEY (id)"
    },
    {
      "name": "fk_book_author",
      "type": "FOREIGN KEY",
      "definition": "FOREIGN KEY (author_id) REFERENCES authors(id)"
    }
  ]
}
```

**Notes:**
- Complete schema information for table
- Shows all columns with types and constraints
- Identifies primary and foreign keys
- Lists indexes for performance optimization
- Useful for understanding data structure

---

### Example 26: Get Schema - Check for Soft Delete Support

**Use Case:** Verify if a table supports soft deletes

**Tool Call:**
```json
{
  "table": "characters"
}
```

**Expected Response (abbreviated):**
```json
{
  "table": "characters",
  "columns": [
    {
      "name": "id",
      "type": "integer",
      "nullable": false,
      "isPrimaryKey": true
    },
    {
      "name": "deleted_at",
      "type": "timestamp with time zone",
      "nullable": true,
      "default": null
    }
  ]
}
```

**Notes:**
- Look for "deleted_at" column to confirm soft delete support
- If present, table supports soft deletes
- deleted_at should be nullable timestamp
- Used to filter out deleted records in queries

---

### Example 27: List Tables - Discover All Available Tables

**Use Case:** Get overview of entire database structure

**Tool Call:**
```json
{}
```

**Expected Response:**
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
    },
    {
      "name": "chapters",
      "type": "BASE TABLE",
      "rowCount": 3421,
      "size": "512 kB",
      "description": "Individual book chapters"
    },
    {
      "name": "characters",
      "type": "BASE TABLE",
      "rowCount": 1234,
      "size": "256 kB",
      "description": "Character profiles and attributes"
    },
    {
      "name": "scenes",
      "type": "BASE TABLE",
      "rowCount": 8765,
      "size": "1024 kB",
      "description": "Scene-level content and structure"
    }
  ],
  "total": 29
}
```

**Notes:**
- Shows all accessible tables
- Includes row counts and sizes
- Useful for database overview
- Helps identify largest tables for optimization

---

### Example 28: List Tables - Check Database Size

**Use Case:** Monitor database growth

**Tool Call:**
```json
{}
```

**Expected Response (focusing on size):**
```json
{
  "tables": [
    {
      "name": "audit_logs",
      "rowCount": 54321,
      "size": "12 MB"
    },
    {
      "name": "chapters",
      "rowCount": 3421,
      "size": "512 kB"
    }
  ],
  "total": 29
}
```

**Notes:**
- Identifies tables consuming most space
- Helps plan backup strategies
- Useful for capacity planning
- Can identify tables needing archival

---

### Example 29: Get Relationships - Map Book Connections

**Use Case:** Understand how books relate to other tables

**Tool Call:**
```json
{
  "table": "books",
  "depth": 2
}
```

**Expected Response:**
```json
{
  "table": "books",
  "outgoing": [
    {
      "column": "author_id",
      "referencesTable": "authors",
      "referencesColumn": "id",
      "relationship": "many-to-one"
    },
    {
      "column": "series_id",
      "referencesTable": "series",
      "referencesColumn": "id",
      "relationship": "many-to-one"
    }
  ],
  "incoming": [
    {
      "fromTable": "chapters",
      "fromColumn": "book_id",
      "toColumn": "id",
      "relationship": "one-to-many"
    },
    {
      "fromTable": "book_characters",
      "fromColumn": "book_id",
      "toColumn": "id",
      "relationship": "one-to-many"
    },
    {
      "fromTable": "reviews",
      "fromColumn": "book_id",
      "toColumn": "id",
      "relationship": "one-to-many"
    }
  ]
}
```

**Notes:**
- Outgoing: Foreign keys in this table pointing elsewhere
- Incoming: Foreign keys in other tables pointing here
- depth parameter controls relationship traversal depth
- Essential for understanding data model

---

### Example 30: Get Relationships - Character Network

**Use Case:** Map character relationship connections

**Tool Call:**
```json
{
  "table": "characters",
  "depth": 1
}
```

**Expected Response:**
```json
{
  "table": "characters",
  "outgoing": [],
  "incoming": [
    {
      "fromTable": "character_arcs",
      "fromColumn": "character_id",
      "toColumn": "id",
      "relationship": "one-to-many"
    },
    {
      "fromTable": "character_relationships",
      "fromColumn": "character_a_id",
      "toColumn": "id",
      "relationship": "one-to-many"
    },
    {
      "fromTable": "character_relationships",
      "fromColumn": "character_b_id",
      "toColumn": "id",
      "relationship": "one-to-many"
    }
  ]
}
```

**Notes:**
- depth: 1 shows direct relationships only
- depth: 2 or 3 shows nested relationships
- Max depth is 3 to prevent performance issues
- Useful for planning join queries

---

### Example 31: List Table Columns - Quick Column Reference

**Use Case:** Get just column information without full schema

**Tool Call:**
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
      "maxLength": null,
      "default": "nextval('authors_id_seq')"
    },
    {
      "name": "name",
      "type": "character varying",
      "nullable": false,
      "maxLength": 200,
      "default": null
    },
    {
      "name": "email",
      "type": "character varying",
      "nullable": false,
      "maxLength": 255,
      "default": null
    },
    {
      "name": "bio",
      "type": "text",
      "nullable": true,
      "maxLength": null,
      "default": null
    },
    {
      "name": "nationality",
      "type": "character varying",
      "nullable": true,
      "maxLength": 100,
      "default": null
    }
  ],
  "total": 15
}
```

**Notes:**
- Lighter than full schema query
- Shows column types and constraints
- maxLength useful for validation
- Faster response time than get_schema

---

### Example 32: List Table Columns - Validate Input Data

**Use Case:** Check column constraints before insertion

**Tool Call:**
```json
{
  "table": "books"
}
```

**Expected Response (focused on validation):**
```json
{
  "table": "books",
  "columns": [
    {
      "name": "title",
      "type": "character varying",
      "nullable": false,
      "maxLength": 500
    },
    {
      "name": "word_count",
      "type": "integer",
      "nullable": true,
      "maxLength": null
    }
  ]
}
```

**Notes:**
- Check nullable to identify required fields
- Use maxLength for client-side validation
- Verify data types before insert/update
- Prevents validation errors

---

## Phase 4: Audit Operations

### Example 33: Query Audit Logs - Recent Activity

**Use Case:** Review all database operations from the last 24 hours

**Tool Call:**
```json
{
  "start_date": "2024-01-14T10:00:00Z",
  "end_date": "2024-01-15T10:00:00Z",
  "limit": 100
}
```

**Expected Response:**
```json
{
  "count": 87,
  "limit": 100,
  "offset": 0,
  "logs": [
    {
      "id": 12450,
      "timestamp": "2024-01-15T09:45:23Z",
      "operation": "UPDATE",
      "table": "books",
      "recordId": "568",
      "userId": "user-143",
      "success": true,
      "executionTime": 12,
      "changes": {
        "word_count": { "old": 45000, "new": 48500 }
      }
    },
    {
      "id": 12449,
      "timestamp": "2024-01-15T09:30:15Z",
      "operation": "INSERT",
      "table": "chapters",
      "recordId": "1234",
      "userId": "user-143",
      "success": true,
      "executionTime": 8,
      "changes": null
    }
  ]
}
```

**Notes:**
- All operations are logged automatically
- Includes execution time for performance monitoring
- changes field shows old vs new values for updates
- Useful for debugging and compliance

---

### Example 34: Query Audit Logs - Track Changes to Specific Book

**Use Case:** See all modifications to a specific book record

**Tool Call:**
```json
{
  "table": "books",
  "operation": "UPDATE",
  "start_date": "2024-01-01T00:00:00Z",
  "limit": 50
}
```

**Expected Response:**
```json
{
  "count": 23,
  "limit": 50,
  "offset": 0,
  "logs": [
    {
      "id": 12450,
      "timestamp": "2024-01-15T09:45:23Z",
      "operation": "UPDATE",
      "table": "books",
      "recordId": "568",
      "userId": "user-143",
      "success": true,
      "executionTime": 12,
      "changes": {
        "word_count": { "old": 45000, "new": 48500 }
      }
    }
  ]
}
```

**Notes:**
- Filter by table to see table-specific activity
- Filter by operation type (INSERT, UPDATE, DELETE)
- Chronological order for change tracking
- Essential for audit trails

---

### Example 35: Query Audit Logs - Failed Operations

**Use Case:** Identify and troubleshoot failed database operations

**Tool Call:**
```json
{
  "success": false,
  "start_date": "2024-01-01T00:00:00Z",
  "end_date": "2024-01-31T23:59:59Z",
  "limit": 100
}
```

**Expected Response:**
```json
{
  "count": 15,
  "limit": 100,
  "offset": 0,
  "logs": [
    {
      "id": 12301,
      "timestamp": "2024-01-10T14:23:45Z",
      "operation": "INSERT",
      "table": "books",
      "recordId": null,
      "userId": "user-89",
      "success": false,
      "executionTime": 5,
      "error": {
        "code": "FOREIGN_KEY_VIOLATION",
        "message": "Author ID 9999 does not exist",
        "constraint": "fk_book_author"
      }
    },
    {
      "id": 12145,
      "timestamp": "2024-01-08T10:15:30Z",
      "operation": "DELETE",
      "table": "authors",
      "recordId": "12",
      "userId": "user-55",
      "success": false,
      "executionTime": 3,
      "error": {
        "code": "FOREIGN_KEY_VIOLATION",
        "message": "Cannot delete author with existing books",
        "constraint": "fk_book_author"
      }
    }
  ]
}
```

**Notes:**
- success: false filters for failures only
- error field contains detailed failure information
- Helps identify common issues
- Useful for debugging and training

---

### Example 36: Query Audit Logs - User Activity

**Use Case:** Track all operations by a specific user

**Tool Call:**
```json
{
  "user_id": "user-143",
  "start_date": "2024-01-01T00:00:00Z",
  "end_date": "2024-01-31T23:59:59Z",
  "limit": 200
}
```

**Expected Response:**
```json
{
  "count": 156,
  "limit": 200,
  "offset": 0,
  "logs": [
    {
      "id": 12450,
      "timestamp": "2024-01-15T09:45:23Z",
      "operation": "UPDATE",
      "table": "books",
      "recordId": "568",
      "userId": "user-143",
      "success": true,
      "executionTime": 12
    }
  ]
}
```

**Notes:**
- Filter by user_id for user-specific activity
- Useful for accountability
- Can identify user behavior patterns
- Important for security audits

---

### Example 37: Query Audit Logs - Pagination for Large Results

**Use Case:** Browse through thousands of audit log entries

**Tool Call (Page 1):**
```json
{
  "start_date": "2024-01-01T00:00:00Z",
  "end_date": "2024-01-31T23:59:59Z",
  "limit": 100,
  "offset": 0
}
```

**Tool Call (Page 2):**
```json
{
  "start_date": "2024-01-01T00:00:00Z",
  "end_date": "2024-01-31T23:59:59Z",
  "limit": 100,
  "offset": 100
}
```

**Expected Response:**
```json
{
  "count": 100,
  "limit": 100,
  "offset": 100,
  "logs": [...]
}
```

**Notes:**
- Max limit is 1000 records per query
- Use offset for pagination
- Keep date ranges reasonable for performance
- Consider exporting for very large ranges

---

### Example 38: Get Audit Summary - Monthly Statistics

**Use Case:** Generate monthly database activity report

**Tool Call:**
```json
{
  "start_date": "2024-01-01T00:00:00Z",
  "end_date": "2024-01-31T23:59:59Z"
}
```

**Expected Response:**
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
      "failed": 20,
      "avgExecutionTime": "8.5ms"
    },
    {
      "operation": "INSERT",
      "count": 850,
      "successful": 840,
      "failed": 10,
      "avgExecutionTime": "12.3ms"
    },
    {
      "operation": "UPDATE",
      "count": 1200,
      "successful": 1100,
      "failed": 100,
      "avgExecutionTime": "18.7ms"
    },
    {
      "operation": "DELETE",
      "count": 182,
      "successful": 181,
      "failed": 1,
      "avgExecutionTime": "9.2ms"
    }
  ],
  "byTable": [
    {
      "table_name": "books",
      "count": 1250,
      "successful": 1240,
      "failed": 10
    },
    {
      "table_name": "chapters",
      "count": 2100,
      "successful": 2090,
      "failed": 10
    },
    {
      "table_name": "characters",
      "count": 890,
      "successful": 875,
      "failed": 15
    }
  ]
}
```

**Notes:**
- Comprehensive statistical overview
- Success rate indicates system health
- Operation breakdown shows usage patterns
- Table statistics identify hotspots
- Useful for monthly reports and trend analysis

---

### Example 39: Get Audit Summary - Performance Analysis

**Use Case:** Identify slow operations for optimization

**Tool Call:**
```json
{
  "start_date": "2024-01-14T00:00:00Z",
  "end_date": "2024-01-15T00:00:00Z"
}
```

**Expected Response (focused on performance):**
```json
{
  "summary": {
    "avgExecutionTime": "15.3ms",
    "maxExecutionTime": "1250ms"
  },
  "byOperation": [
    {
      "operation": "QUERY",
      "avgExecutionTime": "8.5ms"
    },
    {
      "operation": "BATCH_INSERT",
      "avgExecutionTime": "145.2ms"
    }
  ]
}
```

**Notes:**
- avgExecutionTime shows typical performance
- maxExecutionTime identifies outliers
- Compare against performance targets
- Helps prioritize optimization efforts

---

### Example 40: Get Audit Summary - Table-Specific Activity

**Use Case:** Analyze activity on the books table

**Tool Call:**
```json
{
  "start_date": "2024-01-01T00:00:00Z",
  "end_date": "2024-01-31T23:59:59Z",
  "table": "books"
}
```

**Expected Response:**
```json
{
  "summary": {
    "totalOperations": 1250,
    "successfulOperations": 1240,
    "failedOperations": 10,
    "successRate": "99.2%"
  },
  "byOperation": [
    {
      "operation": "QUERY",
      "count": 800,
      "successful": 800,
      "failed": 0
    },
    {
      "operation": "UPDATE",
      "count": 350,
      "successful": 340,
      "failed": 10
    },
    {
      "operation": "INSERT",
      "count": 100,
      "successful": 100,
      "failed": 0
    }
  ]
}
```

**Notes:**
- Filter by table for focused analysis
- Helps understand table usage patterns
- Can guide caching strategies
- Useful for table-specific optimization

---

## Phase 5: Backup & Restore Operations

### Example 41: Full Backup - Complete Database Backup

**Use Case:** Create nightly full database backup

**Tool Call:**
```json
{
  "compress": true,
  "includeSchema": true
}
```

**Expected Response:**
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

**Notes:**
- compress: true reduces backup size (recommended)
- includeSchema: true includes table structures
- Backup stored in configured backup directory
- checksum allows integrity verification
- Schedule during off-peak hours for large databases

---

### Example 42: Full Backup - Uncompressed for Quick Restore

**Use Case:** Create backup optimized for fast restoration

**Tool Call:**
```json
{
  "compress": false,
  "includeSchema": true
}
```

**Expected Response:**
```json
{
  "backupFile": "backup_2024-01-15_110000.sql",
  "size": 8920000,
  "tables": 29,
  "recordCount": 12450,
  "duration": 2800,
  "compressed": false,
  "checksum": "b8e4d3f0a9c5b2g7f6d4e3c2b1a0f9e8"
}
```

**Notes:**
- Uncompressed backups are larger but restore faster
- Useful for staging/development environments
- Takes less time to create (no compression overhead)
- Requires more storage space

---

### Example 43: Table Backup - Backup Specific Table

**Use Case:** Backup just the books table before major changes

**Tool Call:**
```json
{
  "table": "books",
  "dataOnly": false,
  "schemaOnly": false,
  "compress": true
}
```

**Expected Response:**
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

**Notes:**
- Faster than full backup for single table
- Useful before risky operations
- Can restore just this table without affecting others
- dataOnly: false includes both schema and data

---

### Example 44: Table Backup - Schema Only

**Use Case:** Document table structure without data

**Tool Call:**
```json
{
  "table": "characters",
  "dataOnly": false,
  "schemaOnly": true,
  "compress": false
}
```

**Expected Response:**
```json
{
  "backupFile": "table_backup_characters_2024-01-15_schema.sql",
  "table": "characters",
  "recordCount": 0,
  "size": 2400,
  "duration": 50,
  "compressed": false
}
```

**Notes:**
- schemaOnly: true backs up structure without data
- Useful for schema version control
- Small file size
- Quick operation

---

### Example 45: Table Backup - Data Only

**Use Case:** Export data without schema for migration

**Tool Call:**
```json
{
  "table": "authors",
  "dataOnly": true,
  "schemaOnly": false,
  "compress": true
}
```

**Expected Response:**
```json
{
  "backupFile": "table_backup_authors_2024-01-15_data.sql.gz",
  "table": "authors",
  "recordCount": 142,
  "size": 28600,
  "duration": 200,
  "compressed": true
}
```

**Notes:**
- dataOnly: true backs up only records, not structure
- Useful for data migration between similar schemas
- Assumes target table already exists
- Good for populating test environments

---

### Example 46: Incremental Backup - Changes Since Yesterday

**Use Case:** Daily incremental backup of changed records

**Tool Call:**
```json
{
  "since": "2024-01-14T00:00:00Z",
  "compress": true
}
```

**Expected Response:**
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

**Notes:**
- Only backs up records modified since timestamp
- Much faster than full backup
- Smaller file size
- Requires full backup as base
- Tables must have updated_at or created_at columns

---

### Example 47: Incremental Backup - Specific Tables

**Use Case:** Incremental backup of frequently changing tables

**Tool Call:**
```json
{
  "since": "2024-01-14T00:00:00Z",
  "tables": ["chapters", "scenes", "audit_logs"],
  "compress": true
}
```

**Expected Response:**
```json
{
  "backupFile": "incremental_2024-01-15_110000.sql.gz",
  "since": "2024-01-14T00:00:00Z",
  "recordCount": 156,
  "tables": 3,
  "size": 32800,
  "duration": 420
}
```

**Notes:**
- tables parameter limits scope
- Faster than all-tables incremental
- Useful for high-activity tables
- Combine with full backup strategy

---

### Example 48: Export JSON - Export Authors Data

**Use Case:** Export author data for external processing

**Tool Call:**
```json
{
  "table": "authors",
  "pretty": true
}
```

**Expected Response:**
```json
{
  "exportFile": "export_authors_2024-01-15.json",
  "table": "authors",
  "recordCount": 142,
  "size": 45600,
  "format": "json"
}
```

**File Content Example:**
```json
[
  {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "bio": "Fantasy author",
    "created_at": "2023-01-10T00:00:00Z"
  },
  {
    "id": 2,
    "name": "Jane Smith",
    "email": "jane@example.com",
    "bio": "Science fiction author",
    "created_at": "2023-02-15T00:00:00Z"
  }
]
```

**Notes:**
- pretty: true formats JSON for readability
- pretty: false creates compact JSON (smaller file)
- JSON format ideal for APIs and JavaScript
- Easy to import into other systems

---

### Example 49: Export JSON - Filtered Export

**Use Case:** Export only active characters

**Tool Call:**
```json
{
  "table": "characters",
  "where": {
    "status": "active",
    "deleted_at": { "$null": true }
  },
  "pretty": false
}
```

**Expected Response:**
```json
{
  "exportFile": "export_characters_2024-01-15.json",
  "table": "characters",
  "recordCount": 89,
  "size": 28400,
  "format": "json"
}
```

**Notes:**
- where clause filters export data
- Only specified records are exported
- Smaller file size than full export
- Useful for partial data exports

---

### Example 50: Export CSV - Export Books for Analysis

**Use Case:** Export book data for spreadsheet analysis

**Tool Call:**
```json
{
  "table": "books",
  "columns": ["id", "title", "author_id", "word_count", "status"],
  "includeHeaders": true
}
```

**Expected Response:**
```json
{
  "exportFile": "export_books_2024-01-15.csv",
  "table": "books",
  "recordCount": 567,
  "size": 89000,
  "format": "csv"
}
```

**File Content Example:**
```csv
id,title,author_id,word_count,status
1,"The Great Novel",12,95000,"published"
2,"Another Book",8,67000,"draft"
3,"Third Book",12,120000,"published"
```

**Notes:**
- CSV ideal for Excel and data analysis
- includeHeaders: true adds column names in first row
- columns parameter selects specific fields
- Delimiter defaults to comma (customizable)

---

### Example 51: Export CSV - Custom Delimiter

**Use Case:** Export data with tab delimiter for specific tool

**Tool Call:**
```json
{
  "table": "locations",
  "delimiter": "\t",
  "includeHeaders": true
}
```

**Expected Response:**
```json
{
  "exportFile": "export_locations_2024-01-15.csv",
  "table": "locations",
  "recordCount": 234,
  "size": 45200,
  "format": "csv"
}
```

**Notes:**
- delimiter: "\t" uses tab character
- Other options: "|", ";", etc.
- Match delimiter to target system requirements
- Headers use same delimiter

---

### Example 52: Import JSON - Load Character Data

**Use Case:** Import character data from external source

**Tool Call:**
```json
{
  "table": "characters",
  "data": [
    {
      "name": "New Character 1",
      "role": "protagonist",
      "age": 25
    },
    {
      "name": "New Character 2",
      "role": "antagonist",
      "age": 40
    }
  ],
  "mode": "insert"
}
```

**Expected Response:**
```json
{
  "imported": 2,
  "table": "characters",
  "mode": "insert",
  "errors": []
}
```

**Notes:**
- mode: "insert" adds new records only
- Fails if record with same primary key exists
- data can be array of objects
- All records imported in single transaction

---

### Example 53: Import JSON - Upsert Mode

**Use Case:** Import/update data with conflict resolution

**Tool Call:**
```json
{
  "table": "authors",
  "data": [
    {
      "id": 1,
      "name": "John Doe Updated",
      "email": "john.new@example.com"
    },
    {
      "name": "Brand New Author",
      "email": "new@example.com"
    }
  ],
  "mode": "upsert"
}
```

**Expected Response:**
```json
{
  "imported": 2,
  "table": "authors",
  "mode": "upsert",
  "errors": [],
  "inserted": 1,
  "updated": 1
}
```

**Notes:**
- mode: "upsert" updates if exists, inserts if new
- Based on primary key or unique constraint
- Useful for synchronizing data
- Safer than replace mode

---

### Example 54: Import CSV - Bulk Location Import

**Use Case:** Import location data from CSV file

**Tool Call:**
```json
{
  "table": "locations",
  "data": "name,type,description,population\nMetropolis,city,Large bustling city,500000\nDark Woods,forest,Mysterious forest,0\n",
  "hasHeaders": true,
  "mode": "insert"
}
```

**Expected Response:**
```json
{
  "imported": 2,
  "table": "locations",
  "mode": "insert",
  "errors": []
}
```

**Notes:**
- hasHeaders: true uses first row for column mapping
- Data must match table structure
- CSV columns map to table columns by name
- Invalid rows cause entire import to fail

---

### Example 55: Import CSV - Custom Delimiter

**Use Case:** Import tab-delimited data

**Tool Call:**
```json
{
  "table": "world_elements",
  "data": "name\ttype\tdescription\nMagic System\tmagic\tComplex magic system\n",
  "delimiter": "\t",
  "hasHeaders": true,
  "mode": "insert"
}
```

**Expected Response:**
```json
{
  "imported": 1,
  "table": "world_elements",
  "mode": "insert",
  "errors": []
}
```

**Notes:**
- delimiter: "\t" for tab-separated values
- Must match source file delimiter
- Works with any delimiter character
- Headers use same delimiter

---

### Example 56: List Backups - View All Available Backups

**Use Case:** See all backups for restore planning

**Tool Call:**
```json
{}
```

**Expected Response:**
```json
{
  "backups": [
    {
      "file": "backup_2024-01-15_103045.sql.gz",
      "type": "full",
      "size": 2457600,
      "created": "2024-01-15T10:30:45Z",
      "compressed": true,
      "checksum": "a7f3c2e9d8b4a1f6e5c3d2b1a0f9e8d7"
    },
    {
      "file": "incremental_2024-01-15_103045.sql.gz",
      "type": "incremental",
      "size": 45600,
      "created": "2024-01-15T10:30:45Z",
      "compressed": true,
      "checksum": "b8f4d3e0c9d5b2a7f6e5d4c3b2a1f0e9"
    },
    {
      "file": "table_backup_books_2024-01-15.sql.gz",
      "type": "table",
      "size": 128000,
      "created": "2024-01-15T09:00:00Z",
      "compressed": true,
      "checksum": "c9g5e4f1d0e6c3b8g7f6e5d4c3b2a1f0"
    }
  ],
  "total": 15
}
```

**Notes:**
- Lists all backups in backup directory
- Shows backup type, size, and creation date
- Checksum for integrity verification
- Sorted by creation date (newest first)

---

### Example 57: List Backups - Filter by Type

**Use Case:** Find only full backups

**Tool Call:**
```json
{
  "type": "full"
}
```

**Expected Response:**
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
      "size": 2398400,
      "created": "2024-01-14T02:00:00Z",
      "compressed": true
    }
  ],
  "total": 5
}
```

**Notes:**
- type parameter filters results
- Options: "full", "table", "incremental"
- Helps find appropriate backup for restoration
- Useful for backup management

---

### Example 58: Validate Backup - Check Backup Integrity

**Use Case:** Verify backup before critical restore operation

**Tool Call:**
```json
{
  "backupFile": "backup_2024-01-15_103045.sql.gz"
}
```

**Expected Response:**
```json
{
  "valid": true,
  "file": "backup_2024-01-15_103045.sql.gz",
  "size": 2457600,
  "compressed": true,
  "checksum": "a7f3c2e9d8b4a1f6e5c3d2b1a0f9e8d7",
  "verified": true,
  "tables": 29,
  "estimatedRecords": 12450
}
```

**Notes:**
- Verifies file exists and is readable
- Checks checksum against stored value
- Validates compression if applicable
- Tests file can be decompressed
- Always validate before restoring

---

### Example 59: Validate Backup - Detect Corruption

**Use Case:** Verify suspect backup file

**Tool Call:**
```json
{
  "backupFile": "backup_2024-01-10_000000.sql.gz"
}
```

**Expected Response:**
```json
{
  "valid": false,
  "file": "backup_2024-01-10_000000.sql.gz",
  "size": 2400000,
  "compressed": true,
  "checksum": "corrupted",
  "verified": false,
  "error": "Checksum mismatch - file may be corrupted"
}
```

**Notes:**
- valid: false indicates problem
- Checksum mismatch suggests corruption
- Don't use corrupted backups for restore
- Keep multiple backup generations

---

### Example 60: Restore Full - Restore Complete Database

**Use Case:** Restore database from full backup after disaster

**Tool Call:**
```json
{
  "backupFile": "backup_2024-01-15_103045.sql.gz",
  "dropExisting": false,
  "skipErrors": false
}
```

**Expected Response:**
```json
{
  "restored": true,
  "tables": 29,
  "recordCount": 12450,
  "duration": 4200,
  "errors": []
}
```

**Notes:**
- dropExisting: false preserves existing tables
- dropExisting: true deletes tables first (dangerous!)
- skipErrors: false stops on first error
- Use with extreme caution in production
- Test restore process in non-production first

---

### Example 61: Restore Table - Restore Single Table

**Use Case:** Restore books table after accidental deletion

**Tool Call:**
```json
{
  "backupFile": "table_backup_books_2024-01-15.sql.gz",
  "table": "books",
  "dropExisting": true
}
```

**Expected Response:**
```json
{
  "restored": true,
  "table": "books",
  "recordCount": 567,
  "duration": 920
}
```

**Notes:**
- Restores only specified table
- dropExisting recommended for table restore
- Other tables unaffected
- Foreign key constraints must be satisfied

---

### Example 62: Delete Backup - Remove Old Backup

**Use Case:** Clean up old backups to save space

**Tool Call:**
```json
{
  "backupFile": "backup_2024-01-01_020000.sql.gz"
}
```

**Expected Response:**
```json
{
  "deleted": true,
  "file": "backup_2024-01-01_020000.sql.gz"
}
```

**Notes:**
- Permanently deletes backup file
- Cannot be undone
- Verify you have other backups first
- Implement backup retention policy

---

## Advanced Use Cases

### Example 63: Complex Query - Nested Conditions

**Use Case:** Find books by multiple authors in specific genres with word count criteria

**Tool Call:**
```json
{
  "table": "books",
  "columns": ["id", "title", "author_id", "genre", "word_count"],
  "where": {
    "author_id": { "$in": [12, 15, 23] },
    "genre": { "$in": ["fantasy", "science fiction"] },
    "word_count": { "$gte": 80000, "$lte": 120000 },
    "status": "published",
    "published_at": { "$gte": "2023-01-01T00:00:00Z" }
  },
  "orderBy": [
    { "column": "published_at", "direction": "DESC" }
  ],
  "limit": 25
}
```

**Notes:**
- Combines multiple filter conditions
- All conditions use AND logic
- Efficient with proper indexes
- Useful for complex reporting queries

---

### Example 64: Data Migration - Author Consolidation

**Use Case:** Merge two duplicate author records

**Step 1 - Update books to new author:**
```json
{
  "table": "books",
  "data": {
    "author_id": 100
  },
  "where": {
    "author_id": 101
  }
}
```

**Step 2 - Delete old author:**
```json
{
  "table": "authors",
  "where": {
    "id": 101
  },
  "hard": true
}
```

**Notes:**
- Always update foreign key references first
- Then delete the duplicate record
- Use transactions if available
- Verify with query before deleting

---

### Example 65: Performance Optimization - Selective Columns

**Use Case:** Optimize query by requesting only needed columns

**Bad Example (retrieves all columns):**
```json
{
  "table": "books",
  "where": {
    "status": "published"
  }
}
```

**Good Example (selective columns):**
```json
{
  "table": "books",
  "columns": ["id", "title"],
  "where": {
    "status": "published"
  }
}
```

**Notes:**
- Specify only columns you need
- Reduces network transfer
- Improves query performance
- Especially important for tables with many columns

---

## Error Handling Examples

### Example 66: Foreign Key Violation

**Use Case:** Attempt to insert book with non-existent author

**Tool Call:**
```json
{
  "table": "books",
  "data": {
    "author_id": 99999,
    "title": "Orphan Book",
    "status": "draft"
  }
}
```

**Expected Error Response:**
```json
{
  "error": true,
  "message": "Foreign key constraint violation: author_id 99999 does not exist in authors table",
  "code": "FOREIGN_KEY_VIOLATION",
  "details": {
    "table": "books",
    "column": "author_id",
    "constraint": "fk_book_author",
    "value": 99999
  }
}
```

**Solution:**
- Verify author exists before inserting book
- Create author first if needed
- Use proper author_id value

---

### Example 67: Validation Error - Missing Required Field

**Use Case:** Attempt to insert record without required fields

**Tool Call:**
```json
{
  "table": "books",
  "data": {
    "author_id": 12
  }
}
```

**Expected Error Response:**
```json
{
  "error": true,
  "message": "Missing required field: title",
  "code": "VALIDATION_ERROR",
  "details": {
    "table": "books",
    "field": "title",
    "required": true
  }
}
```

**Solution:**
- Include all required fields
- Check schema with db_list_table_columns
- Review nullable constraints

---

### Example 68: Not Found Error - Table Doesn't Exist

**Use Case:** Query non-existent table

**Tool Call:**
```json
{
  "table": "nonexistent_table",
  "limit": 10
}
```

**Expected Error Response:**
```json
{
  "error": true,
  "message": "Table 'nonexistent_table' not found or not accessible",
  "code": "NOT_FOUND",
  "details": {
    "table": "nonexistent_table"
  }
}
```

**Solution:**
- Use db_list_tables to see available tables
- Check table name spelling
- Verify table access permissions

---

### Example 69: Permission Denied Error

**Use Case:** Attempt to access restricted table

**Tool Call:**
```json
{
  "table": "system_config",
  "limit": 10
}
```

**Expected Error Response:**
```json
{
  "error": true,
  "message": "Access denied to table 'system_config'",
  "code": "PERMISSION_DENIED",
  "details": {
    "table": "system_config",
    "reason": "Table not in whitelist"
  }
}
```

**Solution:**
- Only 29 approved tables are accessible
- Use db_list_tables to see allowed tables
- Contact admin to add table to whitelist if needed

---

### Example 70: Validation Error - Invalid Operator

**Use Case:** Use unsupported WHERE operator

**Tool Call:**
```json
{
  "table": "books",
  "where": {
    "word_count": { "$invalid": 50000 }
  }
}
```

**Expected Error Response:**
```json
{
  "error": true,
  "message": "Invalid operator: $invalid",
  "code": "VALIDATION_ERROR",
  "details": {
    "field": "word_count",
    "operator": "$invalid",
    "validOperators": ["$gt", "$gte", "$lt", "$lte", "$ne", "$like", "$ilike", "$in", "$null"]
  }
}
```

**Solution:**
- Use only supported operators
- Refer to API reference for valid operators
- Check operator syntax

---

## Best Practices Summary

### Query Best Practices
1. Always specify required columns, not all columns
2. Use appropriate indexes for WHERE clauses
3. Use pagination for large result sets
4. Keep WHERE conditions simple and indexed
5. Use $in for multiple values instead of multiple queries

### Insert Best Practices
1. Validate data before insertion
2. Use batch_insert for multiple records
3. Verify foreign key references exist
4. Include all required fields
5. Let database handle ID generation

### Update Best Practices
1. Always include WHERE clause
2. Test WHERE with query first
3. Use batch_update for multiple updates
4. Update only changed fields
5. Verify update results

### Delete Best Practices
1. Use soft delete by default
2. Always include specific WHERE clause
3. Query first to verify what will be deleted
4. Hard delete only when necessary
5. Be extra cautious in production

### Backup Best Practices
1. Schedule regular full backups
2. Use incremental backups between full backups
3. Always compress large backups
4. Validate backups regularly
5. Keep multiple generations
6. Store backups off-site
7. Test restore procedures
8. Document backup/restore processes

### Security Best Practices
1. Never disable audit logging
2. Review audit logs regularly
3. Use specific permissions per table
4. Validate all input data
5. Monitor failed operations
6. Use parameterized queries (handled automatically)
7. Keep sensitive data encrypted at rest

### Performance Best Practices
1. Use indexes on frequently queried columns
2. Limit result sets appropriately
3. Use batch operations for bulk changes
4. Monitor query execution times in audit logs
5. Optimize slow queries identified in audit summary
6. Schedule heavy operations during off-peak hours

---

**For More Information:**
- [API Reference](./API-REFERENCE.md) - Complete tool documentation
- [User Guides](./USER-GUIDES.md) - Role-specific guides
- [Security Guide](./SECURITY-GUIDE.md) - Security best practices
- [Tutorials](./TUTORIALS.md) - Step-by-step tutorials
