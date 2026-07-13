// tests/plot-server/genre-extensions.test.js
// Tests for GenreExtensions.handleGetWorldSystems (bead mws-7 acceptance
// criteria #2): define_world_system was write-only with no way to read
// back what it wrote. These tests exercise the new read tool against a
// mocked db (no live database required).

import { fileURLToPath } from 'url';
import { GenreExtensions } from '../../src/mcps/plot-server/handlers/genre-extensions.js';

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
                return result;
            }
        }
        return { rows: [] };
    }
}

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
    console.log('\n=== GenreExtensions: get_world_systems Test Suite ===\n');

    await testGetWorldSystemsRoundTrip();
    await testGetWorldSystemsFilterByType();
    await testGetWorldSystemsEmpty();
    await testGetWorldSystemsMissingSeries();
    await testGetWorldSystemsValidation();

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

async function testGetWorldSystemsRoundTrip() {
    console.log('\n--- get_world_systems: round-trips what define_world_system wrote ---');
    const mockDb = new MockDatabase();

    mockDb.setQueryResult('SELECT id, title FROM series', [{ id: 5, title: 'Test Series' }]);
    mockDb.setQueryResult('FROM world_systems', [
        {
            id: 10,
            series_id: 5,
            system_name: 'Elemental Magic',
            system_type: 'magic',
            power_source: 'ambient elemental energy',
            access_method: 'ritual attunement',
            limitations: ['requires physical contact', 'exhausting'],
            system_rules: ['cannot create matter, only transform it'],
            power_scaling: { lowest_level: 'spark', highest_level: 'storm-caller', progression_method: 'training' },
            system_users: [1, 2],
            created_at: new Date(),
            updated_at: new Date()
        }
    ]);

    const genreExtensions = new GenreExtensions(mockDb);
    const result = await genreExtensions.handleGetWorldSystems({ series_id: 5 });

    const text = result.content[0].text;
    assert(text.includes('Elemental Magic'), 'includes the system name written by define_world_system');
    assert(text.includes('magic'), 'includes the system type');
    assert(text.includes('ambient elemental energy'), 'includes the power source');
    assert(text.includes('ritual attunement'), 'includes the access method');
    assert(text.includes('requires physical contact'), 'includes limitations');
    assert(text.includes('cannot create matter'), 'includes system rules');
    assert(text.includes('spark'), 'includes power scaling');

    const seriesQuery = mockDb.queries.find(q => q.text.includes('SELECT id, title FROM series'));
    assert(seriesQuery.params[0] === 5, 'series_id passed through to series existence check');
}

async function testGetWorldSystemsFilterByType() {
    console.log('\n--- get_world_systems: filters by system_type ---');
    const mockDb = new MockDatabase();
    mockDb.setQueryResult('SELECT id, title FROM series', [{ id: 5, title: 'Test Series' }]);
    mockDb.setQueryResult('FROM world_systems', [
        { id: 10, series_id: 5, system_name: 'Elemental Magic', system_type: 'magic', power_source: 'x', access_method: 'y', limitations: [], system_rules: [], power_scaling: null }
    ]);

    const genreExtensions = new GenreExtensions(mockDb);
    await genreExtensions.handleGetWorldSystems({ series_id: 5, system_type: 'magic' });

    const worldQuery = mockDb.queries.find(q => q.text.includes('FROM world_systems'));
    assert(worldQuery.text.includes('system_type = $2'), 'query includes system_type filter clause');
    assert(worldQuery.params[1] === 'magic', 'system_type filter value bound correctly');
}

async function testGetWorldSystemsEmpty() {
    console.log('\n--- get_world_systems: handles no systems defined yet ---');
    const mockDb = new MockDatabase();
    mockDb.setQueryResult('SELECT id, title FROM series', [{ id: 5, title: 'Test Series' }]);
    mockDb.setQueryResult('FROM world_systems', []);

    const genreExtensions = new GenreExtensions(mockDb);
    const result = await genreExtensions.handleGetWorldSystems({ series_id: 5 });

    assert(result.content[0].text.includes('No world systems found'), 'reports no world systems found');
}

async function testGetWorldSystemsMissingSeries() {
    console.log('\n--- get_world_systems: rejects unknown series ---');
    const mockDb = new MockDatabase();
    mockDb.setQueryResult('SELECT id, title FROM series', []); // series lookup miss

    const genreExtensions = new GenreExtensions(mockDb);

    await assertRejects(
        genreExtensions.handleGetWorldSystems({ series_id: 999 }),
        'not found',
        'rejects a series_id that does not exist'
    );
}

async function testGetWorldSystemsValidation() {
    console.log('\n--- get_world_systems: input validation ---');
    const mockDb = new MockDatabase();
    const genreExtensions = new GenreExtensions(mockDb);

    await assertRejects(
        genreExtensions.handleGetWorldSystems({}),
        'series_id must be a positive number',
        'rejects missing series_id'
    );

    await assertRejects(
        genreExtensions.handleGetWorldSystems({ series_id: -1 }),
        'series_id must be a positive number',
        'rejects a negative series_id'
    );
}

// Allow running this file standalone: `node tests/plot-server/genre-extensions.test.js`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    runTests().then(ok => {
        process.exitCode = ok ? 0 : 1;
    });
}
