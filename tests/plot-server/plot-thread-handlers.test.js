// tests/plot-server/plot-thread-handlers.test.js
// Tests for PlotThreadHandlers, focused on link_plot_threads (bead mws-7):
// the tool was fully defined but commented out with no live write path to
// plot_thread_relationships. These tests exercise the re-enabled handler
// against a mocked db (no live database required).

import { fileURLToPath } from 'url';
import { PlotThreadHandlers } from '../../src/mcps/plot-server/handlers/plot-thread-handlers.js';

// Mock database for testing - matches the pattern used in
// tests/database-admin-server/schema-introspection.test.js
class MockDatabase {
    constructor() {
        this.queryResults = new Map();
        this.queries = [];
    }

    setQueryResult(queryPattern, rows) {
        this.queryResults.set(queryPattern, { rows });
    }

    async query(text, params = []) {
        this.queries.push({ text, params });
        for (const [pattern, result] of this.queryResults.entries()) {
            if (text.includes(pattern)) {
                return typeof result === 'function' ? result(params) : result;
            }
        }
        return { rows: [] };
    }
}

// Test results tracking
const tests = { passed: 0, failed: 0, total: 0 };

function assert(condition, message) {
    tests.total++;
    if (condition) {
        tests.passed++;
        console.log(`  ✓ ${message}`);
    } else {
        tests.failed++;
        console.error(`  ✗ ${message}`);
        throw new Error(`Assertion failed: ${message}`);
    }
}

async function assertRejects(promise, messageIncludes, description) {
    tests.total++;
    try {
        await promise;
        tests.failed++;
        console.error(`  ✗ ${description} (expected rejection, got success)`);
    } catch (error) {
        if (error.message.includes(messageIncludes)) {
            tests.passed++;
            console.log(`  ✓ ${description}`);
        } else {
            tests.failed++;
            console.error(`  ✗ ${description} (wrong error: ${error.message})`);
        }
    }
}

export async function runTests() {
    console.log('\n=== PlotThreadHandlers: link_plot_threads Test Suite ===\n');

    await testLinkPlotThreadsRoundTrip();
    await testLinkPlotThreadsInvalidRelationshipType();
    await testLinkPlotThreadsMissingThread();
    await testLinkPlotThreadsDuplicateRelationship();
    await testLinkPlotThreadsValidation();

    console.log('\n=== Test Summary ===');
    console.log(`Total: ${tests.total}`);
    console.log(`Passed: ${tests.passed}`);
    console.log(`Failed: ${tests.failed}`);

    if (tests.failed > 0) {
        console.error('\n❌ Some tests failed!');
    } else {
        console.log('\n✅ All tests passed!');
    }

    return tests.failed === 0;
}

async function testLinkPlotThreadsRoundTrip() {
    console.log('\n--- link_plot_threads: create two threads, link parent/child ---');
    const mockDb = new MockDatabase();

    mockDb.setQueryResult('SELECT id, title FROM plot_threads WHERE id = ANY', [
        { id: 1, title: 'Thread A' },
        { id: 2, title: 'Thread B' }
    ]);
    mockDb.setQueryResult('FROM plot_thread_relationships', []); // no existing relationship
    mockDb.setQueryResult('FROM relationship_types', [
        { id: 42, type_name: 'depends_on' }
    ]);
    mockDb.setQueryResult('INSERT INTO plot_thread_relationships', [{ id: 100 }]);

    const handlers = new PlotThreadHandlers(mockDb);

    const result = await handlers.handleLinkPlotThreads({
        thread_a_id: 1,
        thread_b_id: 2,
        relationship_type: 'depends_on',
        relationship_description: 'B needs A resolved first',
        strength: 7,
        established_book: 2
    });

    assert(result.content[0].text.includes('Successfully linked plot threads'), 'returns success message');
    assert(result.content[0].text.includes('Thread A'), 'includes thread A title');
    assert(result.content[0].text.includes('Thread B'), 'includes thread B title');
    assert(result.content[0].text.includes('7/10'), 'includes strength');

    // Verify the INSERT wrote a real row using the resolved relationship_type_id (not undefined)
    const insertCall = mockDb.queries.find(q => q.text.includes('INSERT INTO plot_thread_relationships'));
    assert(insertCall !== undefined, 'issued an INSERT into plot_thread_relationships');
    assert(insertCall.params[0] === 1, 'thread_a_id bound correctly');
    assert(insertCall.params[1] === 2, 'thread_b_id bound correctly');
    assert(insertCall.params[2] === 42, 'relationship_type_id resolved from lookup (id, not undefined)');
    assert(insertCall.params[3] === 'B needs A resolved first', 'relationship_description bound correctly');
    assert(insertCall.params[4] === 7, 'strength bound correctly');
    assert(insertCall.params[5] === 2, 'established_book bound correctly');
}

async function testLinkPlotThreadsInvalidRelationshipType() {
    console.log('\n--- link_plot_threads: rejects unknown relationship_type ---');
    const mockDb = new MockDatabase();
    mockDb.setQueryResult('SELECT id, title FROM plot_threads WHERE id = ANY', [
        { id: 1, title: 'Thread A' },
        { id: 2, title: 'Thread B' }
    ]);
    mockDb.setQueryResult('FROM plot_thread_relationships', []);
    mockDb.setQueryResult('FROM relationship_types', []); // lookup miss

    const handlers = new PlotThreadHandlers(mockDb);

    await assertRejects(
        handlers.handleLinkPlotThreads({
            thread_a_id: 1,
            thread_b_id: 2,
            relationship_type: 'not_a_real_type'
        }),
        'Invalid relationship type',
        'rejects an unknown relationship_type'
    );
}

async function testLinkPlotThreadsMissingThread() {
    console.log('\n--- link_plot_threads: rejects when a thread does not exist ---');
    const mockDb = new MockDatabase();
    // Only one of the two threads exists
    mockDb.setQueryResult('SELECT id, title FROM plot_threads WHERE id = ANY', [
        { id: 1, title: 'Thread A' }
    ]);

    const handlers = new PlotThreadHandlers(mockDb);

    await assertRejects(
        handlers.handleLinkPlotThreads({
            thread_a_id: 1,
            thread_b_id: 999,
            relationship_type: 'enables'
        }),
        'One or both plot threads not found',
        'rejects when one thread is missing'
    );
}

async function testLinkPlotThreadsDuplicateRelationship() {
    console.log('\n--- link_plot_threads: rejects duplicate relationship (either direction) ---');
    const mockDb = new MockDatabase();
    mockDb.setQueryResult('SELECT id, title FROM plot_threads WHERE id = ANY', [
        { id: 1, title: 'Thread A' },
        { id: 2, title: 'Thread B' }
    ]);
    mockDb.setQueryResult('FROM plot_thread_relationships', [{ id: 55 }]); // already exists

    const handlers = new PlotThreadHandlers(mockDb);

    await assertRejects(
        handlers.handleLinkPlotThreads({
            thread_a_id: 1,
            thread_b_id: 2,
            relationship_type: 'enables'
        }),
        'already exists',
        'rejects a duplicate relationship'
    );
}

async function testLinkPlotThreadsValidation() {
    console.log('\n--- link_plot_threads: input validation ---');
    const mockDb = new MockDatabase();
    const handlers = new PlotThreadHandlers(mockDb);

    await assertRejects(
        handlers.handleLinkPlotThreads({
            thread_a_id: 1,
            thread_b_id: 1, // same thread
            relationship_type: 'enables'
        }),
        'must be different',
        'rejects linking a thread to itself'
    );

    await assertRejects(
        handlers.handleLinkPlotThreads({
            thread_a_id: 1,
            thread_b_id: 2
            // missing relationship_type
        }),
        'relationship_type must be a non-empty string',
        'rejects missing relationship_type'
    );
}

// Allow running this file standalone: `node tests/plot-server/plot-thread-handlers.test.js`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    runTests().then(ok => {
        process.exitCode = ok ? 0 : 1;
    });
}
