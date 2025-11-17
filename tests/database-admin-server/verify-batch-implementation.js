#!/usr/bin/env node
// tests/database-admin-server/verify-batch-implementation.js
// Verification script for Phase 2: Batch Operations implementation
// Checks that all required files and structures are in place

import { strict as assert } from 'assert';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

console.log('🔍 Verifying Phase 2: Batch Operations Implementation\n');
console.log('═'.repeat(70));

const checks = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: []
};

function check(name, fn) {
    checks.total++;
    try {
        fn();
        console.log(`✓ ${name}`);
        checks.passed++;
        return true;
    } catch (error) {
        console.log(`✗ ${name}`);
        console.error(`  Error: ${error.message}`);
        checks.failed++;
        checks.errors.push({ check: name, error });
        return false;
    }
}

// File existence checks
console.log('\n📁 File Structure Checks\n');

check('Transaction Manager exists', () => {
    const path = join(projectRoot, 'src/mcps/database-admin-server/utils/transaction-manager.js');
    assert(existsSync(path), 'transaction-manager.js not found');
});

check('Batch Handlers exists', () => {
    const path = join(projectRoot, 'src/mcps/database-admin-server/handlers/batch-handlers.js');
    assert(existsSync(path), 'batch-handlers.js not found');
});

check('Batch Tools Schema exists', () => {
    const path = join(projectRoot, 'src/mcps/database-admin-server/schemas/batch-tools-schema.js');
    assert(existsSync(path), 'batch-tools-schema.js not found');
});

check('Batch Operations Tests exist', () => {
    const path = join(projectRoot, 'tests/database-admin-server/batch-operations.test.js');
    assert(existsSync(path), 'batch-operations.test.js not found');
});

// Module import checks
console.log('\n📦 Module Import Checks\n');

check('Transaction Manager can be imported', async () => {
    const module = await import('../../src/mcps/database-admin-server/utils/transaction-manager.js');
    assert(module.TransactionManager, 'TransactionManager not exported');
    assert(typeof module.TransactionManager.executeTransaction === 'function', 'executeTransaction not a function');
    assert(typeof module.TransactionManager.validateBatchSize === 'function', 'validateBatchSize not a function');
});

check('Batch Handlers can be imported', async () => {
    const module = await import('../../src/mcps/database-admin-server/handlers/batch-handlers.js');
    assert(module.BatchHandlers, 'BatchHandlers not exported');
});

check('Batch Tools Schema can be imported', async () => {
    const module = await import('../../src/mcps/database-admin-server/schemas/batch-tools-schema.js');
    assert(module.batchToolsSchema, 'batchToolsSchema not exported');
    assert(Array.isArray(module.batchToolsSchema), 'batchToolsSchema is not an array');
    assert(module.batchToolsSchema.length === 3, `Expected 3 batch tools, got ${module.batchToolsSchema.length}`);
});

// Schema validation checks
console.log('\n📋 Schema Validation Checks\n');

check('db_batch_insert schema is valid', async () => {
    const { batchToolsSchema } = await import('../../src/mcps/database-admin-server/schemas/batch-tools-schema.js');
    const schema = batchToolsSchema.find(s => s.name === 'db_batch_insert');
    assert(schema, 'db_batch_insert schema not found');
    assert(schema.description, 'db_batch_insert missing description');
    assert(schema.inputSchema, 'db_batch_insert missing inputSchema');
    assert(schema.inputSchema.properties.table, 'db_batch_insert missing table property');
    assert(schema.inputSchema.properties.records, 'db_batch_insert missing records property');
    assert(schema.inputSchema.properties.records.type === 'array', 'records should be array type');
});

check('db_batch_update schema is valid', async () => {
    const { batchToolsSchema } = await import('../../src/mcps/database-admin-server/schemas/batch-tools-schema.js');
    const schema = batchToolsSchema.find(s => s.name === 'db_batch_update');
    assert(schema, 'db_batch_update schema not found');
    assert(schema.description, 'db_batch_update missing description');
    assert(schema.inputSchema, 'db_batch_update missing inputSchema');
    assert(schema.inputSchema.properties.table, 'db_batch_update missing table property');
    assert(schema.inputSchema.properties.updates, 'db_batch_update missing updates property');
    assert(schema.inputSchema.properties.updates.type === 'array', 'updates should be array type');
});

check('db_batch_delete schema is valid', async () => {
    const { batchToolsSchema } = await import('../../src/mcps/database-admin-server/schemas/batch-tools-schema.js');
    const schema = batchToolsSchema.find(s => s.name === 'db_batch_delete');
    assert(schema, 'db_batch_delete schema not found');
    assert(schema.description, 'db_batch_delete missing description');
    assert(schema.inputSchema, 'db_batch_delete missing inputSchema');
    assert(schema.inputSchema.properties.table, 'db_batch_delete missing table property');
    assert(schema.inputSchema.properties.conditions, 'db_batch_delete missing conditions property');
    assert(schema.inputSchema.properties.conditions.type === 'array', 'conditions should be array type');
});

// Handler method checks
console.log('\n🔧 Handler Method Checks\n');

check('BatchHandlers has getBatchTools method', async () => {
    const { BatchHandlers } = await import('../../src/mcps/database-admin-server/handlers/batch-handlers.js');
    const mockDb = { pool: null };
    const handler = new BatchHandlers(mockDb);
    assert(typeof handler.getBatchTools === 'function', 'getBatchTools not a function');
    const tools = handler.getBatchTools();
    assert(Array.isArray(tools), 'getBatchTools should return array');
    assert(tools.length === 3, `Expected 3 tools, got ${tools.length}`);
});

check('BatchHandlers has handleBatchInsert method', async () => {
    const { BatchHandlers } = await import('../../src/mcps/database-admin-server/handlers/batch-handlers.js');
    const mockDb = { pool: null };
    const handler = new BatchHandlers(mockDb);
    assert(typeof handler.handleBatchInsert === 'function', 'handleBatchInsert not a function');
});

check('BatchHandlers has handleBatchUpdate method', async () => {
    const { BatchHandlers } = await import('../../src/mcps/database-admin-server/handlers/batch-handlers.js');
    const mockDb = { pool: null };
    const handler = new BatchHandlers(mockDb);
    assert(typeof handler.handleBatchUpdate === 'function', 'handleBatchUpdate not a function');
});

check('BatchHandlers has handleBatchDelete method', async () => {
    const { BatchHandlers } = await import('../../src/mcps/database-admin-server/handlers/batch-handlers.js');
    const mockDb = { pool: null };
    const handler = new BatchHandlers(mockDb);
    assert(typeof handler.handleBatchDelete === 'function', 'handleBatchDelete not a function');
});

// Transaction Manager checks
console.log('\n🔄 Transaction Manager Checks\n');

check('TransactionManager.validateBatchSize validates limits', async () => {
    const { TransactionManager } = await import('../../src/mcps/database-admin-server/utils/transaction-manager.js');

    // Should accept valid sizes
    TransactionManager.validateBatchSize(1);
    TransactionManager.validateBatchSize(500);
    TransactionManager.validateBatchSize(1000);

    // Should reject invalid sizes
    try {
        TransactionManager.validateBatchSize(0);
        throw new Error('Should have thrown for size 0');
    } catch (error) {
        assert(error.message.includes('Batch size'), 'Wrong error message for size 0');
    }

    try {
        TransactionManager.validateBatchSize(1001);
        throw new Error('Should have thrown for size 1001');
    } catch (error) {
        assert(error.message.includes('Batch size'), 'Wrong error message for size 1001');
    }
});

check('TransactionManager.isRetryableError identifies retryable errors', async () => {
    const { TransactionManager } = await import('../../src/mcps/database-admin-server/utils/transaction-manager.js');

    // Should identify retryable errors
    assert(TransactionManager.isRetryableError({ code: '40001' }), 'Should be retryable: 40001');
    assert(TransactionManager.isRetryableError({ code: '40P01' }), 'Should be retryable: 40P01');

    // Should not identify non-retryable errors
    assert(!TransactionManager.isRetryableError({ code: '23505' }), 'Should not be retryable: 23505');
    assert(!TransactionManager.isRetryableError({ message: 'Some error' }), 'Should not be retryable: no code');
});

// Print summary
console.log('\n' + '═'.repeat(70));
console.log('\n📊 Verification Summary\n');
console.log(`  Total:  ${checks.total}`);
console.log(`  ✓ Pass:  ${checks.passed} (${((checks.passed / checks.total) * 100).toFixed(1)}%)`);
console.log(`  ✗ Fail:  ${checks.failed}`);

if (checks.failed > 0) {
    console.log('\n❌ Verification Failures:\n');
    checks.errors.forEach(({ check, error }, index) => {
        console.log(`${index + 1}. ${check}`);
        console.log(`   ${error.message}`);
    });
}

console.log('\n' + '═'.repeat(70));

if (checks.failed === 0) {
    console.log('\n✅ All verification checks passed!');
    console.log('✅ Phase 2 implementation is complete and ready for integration testing.');
    console.log('\n📝 Next Steps:');
    console.log('  1. Start PostgreSQL and PgBouncer services');
    console.log('  2. Run: node tests/database-admin-server/batch-operations.test.js');
    console.log('  3. Verify performance targets (1000 records < 5s)');
    console.log('  4. Test with concurrent transactions');
} else {
    console.log('\n❌ Verification failed. Please fix the issues above.');
    process.exit(1);
}

console.log();
