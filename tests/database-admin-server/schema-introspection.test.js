// tests/database-admin-server/schema-introspection.test.js
// Comprehensive test suite for schema introspection tools

import { SchemaCache } from '../../src/mcps/database-admin-server/utils/schema-cache.js';
import { RelationshipMapper } from '../../src/mcps/database-admin-server/utils/relationship-mapper.js';
import { SchemaHandlers } from '../../src/mcps/database-admin-server/handlers/schema-handlers.js';

// Mock database for testing
class MockDatabase {
    constructor() {
        this.queryResults = new Map();
    }

    setQueryResult(queryPattern, rows) {
        this.queryResults.set(queryPattern, { rows });
    }

    async query(text, params = []) {
        // Match query patterns for testing
        for (const [pattern, result] of this.queryResults.entries()) {
            if (text.includes(pattern)) {
                return result;
            }
        }

        // Default empty result
        return { rows: [] };
    }
}

// Test results tracking
const tests = {
    passed: 0,
    failed: 0,
    total: 0
};

function assert(condition, message) {
    tests.total++;
    if (condition) {
        tests.passed++;
        console.log(`✓ ${message}`);
    } else {
        tests.failed++;
        console.error(`✗ ${message}`);
        throw new Error(`Assertion failed: ${message}`);
    }
}

async function runTests() {
    console.log('\n=== Schema Introspection Test Suite ===\n');

    // Test 1: SchemaCache
    console.log('\n--- Testing SchemaCache ---');
    await testSchemaCache();

    // Test 2: RelationshipMapper
    console.log('\n--- Testing RelationshipMapper ---');
    await testRelationshipMapper();

    // Test 3: SchemaHandlers
    console.log('\n--- Testing SchemaHandlers ---');
    await testSchemaHandlers();

    // Print summary
    console.log('\n=== Test Summary ===');
    console.log(`Total: ${tests.total}`);
    console.log(`Passed: ${tests.passed}`);
    console.log(`Failed: ${tests.failed}`);
    console.log(`Success Rate: ${((tests.passed / tests.total) * 100).toFixed(2)}%`);

    if (tests.failed > 0) {
        console.error('\n❌ Some tests failed!');
        process.exit(1);
    } else {
        console.log('\n✅ All tests passed!');
    }
}

async function testSchemaCache() {
    // Test basic cache operations
    const cache = new SchemaCache(1); // 1 minute TTL for testing

    // Test set and get
    cache.set('test:table', { data: 'value' });
    const result = cache.get('test:table');
    assert(result?.data === 'value', 'Cache should return stored value');

    // Test cache miss
    const missing = cache.get('nonexistent');
    assert(missing === null, 'Cache should return null for missing key');

    // Test has
    assert(cache.has('test:table'), 'Cache should confirm existing key');
    assert(!cache.has('nonexistent'), 'Cache should deny nonexistent key');

    // Test invalidate
    cache.invalidate('test:table');
    assert(!cache.has('test:table'), 'Cache should remove invalidated key');

    // Test pattern invalidation
    cache.set('schema:authors', { data: 1 });
    cache.set('schema:books', { data: 2 });
    cache.set('relationships:authors', { data: 3 });
    const invalidated = cache.invalidatePattern(/^schema:/);
    assert(invalidated === 2, 'Cache should invalidate matching patterns');
    assert(!cache.has('schema:authors'), 'Schema:authors should be invalidated');
    assert(cache.has('relationships:authors'), 'Relationships:authors should remain');

    // Test clear
    cache.clear();
    assert(cache.cache.size === 0, 'Cache should be empty after clear');

    // Test stats with a fresh cache to avoid contamination
    const statsCache = new SchemaCache(5);
    statsCache.set('key1', 'value1');
    statsCache.get('key1'); // hit
    statsCache.get('key2'); // miss
    const stats = statsCache.getStats();
    assert(stats.hits === 1, 'Stats should track cache hits');
    assert(stats.misses === 1, 'Stats should track cache misses');
    assert(stats.hitRate === '50.00%', 'Stats should calculate hit rate');

    // Test cache key generation
    const key1 = SchemaCache.generateKey('authors', 'schema');
    const key2 = SchemaCache.generateKey('authors', 'schema', { depth: 2 });
    assert(key1 === 'schema:authors', 'Should generate simple cache key');
    assert(key2.includes('schema:authors:'), 'Should generate parameterized cache key');

    // Test TTL expiration (this would require waiting, so we'll test the logic)
    const testCache = new SchemaCache(0.0001); // Very short TTL
    testCache.set('expire:test', 'value');
    await new Promise(resolve => setTimeout(resolve, 10)); // Wait for expiration
    const expired = testCache.get('expire:test');
    assert(expired === null, 'Cache should expire entries after TTL');

    console.log('SchemaCache: All tests passed');
}

async function testRelationshipMapper() {
    const mockDb = new MockDatabase();

    // Mock foreign key relationships
    mockDb.setQueryResult('information_schema.table_constraints', [
        {
            constraint_name: 'books_series_id_fkey',
            column_name: 'series_id',
            foreign_table_name: 'series',
            foreign_column_name: 'id'
        }
    ]);

    mockDb.setQueryResult('ccu.table_name =', [
        {
            child_table: 'chapters',
            constraint_name: 'chapters_book_id_fkey',
            child_column: 'book_id',
            parent_column: 'id'
        }
    ]);

    const mapper = new RelationshipMapper(mockDb);

    // Test direct relationships
    const relationships = await mapper.getRelationships('books', 1);
    assert(relationships.table === 'books', 'Should return correct table name');
    assert(relationships.depth === 1, 'Should return correct depth');
    assert(Array.isArray(relationships.parents), 'Should return parents array');
    assert(Array.isArray(relationships.children), 'Should return children array');

    console.log('RelationshipMapper: All tests passed');
}

async function testSchemaHandlers() {
    const mockDb = new MockDatabase();

    // Mock schema query results
    mockDb.setQueryResult('information_schema.columns', [
        {
            column_name: 'id',
            data_type: 'integer',
            is_nullable: 'NO',
            column_default: "nextval('authors_id_seq'::regclass)",
            udt_name: 'int4',
            character_maximum_length: null,
            numeric_precision: 32,
            numeric_scale: 0,
            column_comment: null
        },
        {
            column_name: 'name',
            data_type: 'character varying',
            is_nullable: 'NO',
            column_default: null,
            udt_name: 'varchar',
            character_maximum_length: 255,
            numeric_precision: null,
            numeric_scale: null,
            column_comment: 'Author full name'
        }
    ]);

    mockDb.setQueryResult('information_schema.table_constraints', [
        {
            constraint_name: 'authors_pkey',
            constraint_type: 'PRIMARY KEY',
            column_name: 'id',
            is_deferrable: 'NO',
            initially_deferred: 'NO'
        }
    ]);

    mockDb.setQueryResult('pg_class', [
        {
            index_name: 'authors_pkey',
            column_name: 'id',
            is_unique: true,
            is_primary: true,
            index_type: 'btree'
        }
    ]);

    const handlers = new SchemaHandlers(mockDb);

    // Test handleGetSchema
    console.log('\nTesting handleGetSchema...');
    const schemaResult = await handlers.handleGetSchema({ table: 'authors' });
    assert(schemaResult.success === true, 'handleGetSchema should succeed');
    assert(schemaResult.table === 'authors', 'Should return correct table name');
    assert(Array.isArray(schemaResult.columns), 'Should return columns array');
    assert(schemaResult.columns.length === 2, 'Should return correct number of columns');
    assert(schemaResult.columns[0].name === 'id', 'Should return column details');

    // Test caching
    const cachedResult = await handlers.handleGetSchema({ table: 'authors' });
    assert(cachedResult.cached === true, 'Second call should return cached result');

    // Test cache refresh
    const refreshedResult = await handlers.handleGetSchema({
        table: 'authors',
        refresh_cache: true
    });
    assert(refreshedResult.cached === false, 'Refresh should bypass cache');

    // Test handleListTables
    console.log('\nTesting handleListTables...');
    mockDb.setQueryResult('information_schema.tables', [
        {
            table_name: 'authors',
            table_type: 'BASE TABLE',
            table_comment: 'Authors table',
            column_count: '2',
            table_size_bytes: '8192'
        },
        {
            table_name: 'books',
            table_type: 'BASE TABLE',
            table_comment: 'Books table',
            column_count: '5',
            table_size_bytes: '16384'
        }
    ]);

    const tablesResult = await handlers.handleListTables({});
    assert(tablesResult.success === true, 'handleListTables should succeed');
    assert(Array.isArray(tablesResult.tables), 'Should return tables array');

    // Test handleListTableColumns
    console.log('\nTesting handleListTableColumns...');
    mockDb.setQueryResult('SELECT\n                    column_name', [
        {
            column_name: 'id',
            data_type: 'integer',
            is_nullable: 'NO',
            column_default: null,
            udt_name: 'int4'
        },
        {
            column_name: 'name',
            data_type: 'character varying',
            is_nullable: 'NO',
            column_default: null,
            udt_name: 'varchar'
        }
    ]);

    const columnsResult = await handlers.handleListTableColumns({ table: 'authors' });
    assert(columnsResult.success === true, 'handleListTableColumns should succeed');
    assert(columnsResult.table === 'authors', 'Should return correct table name');
    assert(columnsResult.count === 2, 'Should return correct column count');
    assert(Array.isArray(columnsResult.columns), 'Should return columns array');

    // Test with metadata
    const columnsWithMetadata = await handlers.handleListTableColumns({
        table: 'authors',
        include_metadata: true
    });
    assert(columnsWithMetadata.columns[0].nullable !== undefined, 'Should include metadata');

    console.log('SchemaHandlers: All tests passed');
}

// Run all tests
runTests().catch(error => {
    console.error('\n❌ Test suite failed:', error.message);
    console.error(error.stack);
    process.exit(1);
});
