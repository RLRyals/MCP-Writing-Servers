// tests/outline-server/works-handlers.test.js
// Tests for WorksHandlers (bead mws-e14): outline_works cross-link FK
// validation in create_work/update_work ("MAKE IT REAL" ruling on the
// outline_works phantom-bridge finding, dev-backlog card a169f982) and the
// new get_works_for_book read path. Exercises the handler against a mocked
// db (no live database required), matching the pattern used in
// tests/plot-server/plot-thread-handlers.test.js.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WorksHandlers } from '../../src/mcps/outline-server/handlers/works-handlers.js';

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

function seededDb() {
    const mockDb = new MockDatabase();
    mockDb.setQueryResult('FROM series WHERE id = $1', [{ id: 1 }]);
    mockDb.setQueryResult('FROM books WHERE id = $1', [{ id: 2, title: 'Book One' }]);
    mockDb.setQueryResult('FROM chapters WHERE id = $1', [{ id: 3 }]);
    mockDb.setQueryResult('FROM chapter_scenes WHERE id = $1', [{ id: 4 }]);
    mockDb.setQueryResult('INSERT INTO outline_works', [{
        id: 10, parent_id: null, work_type: 'series', sequence: 0, title: 'Series', status: 'planned'
    }]);
    return mockDb;
}

describe('WorksHandlers.handleCreateWork cross-link validation', () => {
    it('creates a work when all provided cross-links exist', async () => {
        const mockDb = seededDb();
        const handlers = new WorksHandlers(mockDb);

        const result = await handlers.handleCreateWork({
            work_type: 'series', sequence: 0, title: 'Series',
            series_id: 1, book_id: 2, chapter_id: 3, scene_id: 4
        });

        assert.ok(result.content[0].text.includes('Created outline work'));
        const insertCall = mockDb.queries.find(q => q.text.includes('INSERT INTO outline_works'));
        assert.ok(insertCall, 'issued an INSERT into outline_works');
    });

    it('creates a work when no cross-links are provided (still optional)', async () => {
        const mockDb = seededDb();
        const handlers = new WorksHandlers(mockDb);

        const result = await handlers.handleCreateWork({ work_type: 'series', sequence: 0, title: 'Series' });
        assert.ok(result.content[0].text.includes('Created outline work'));

        const fkChecks = mockDb.queries.filter(q => /FROM (series|books|chapters|chapter_scenes) WHERE id/.test(q.text));
        assert.strictEqual(fkChecks.length, 0, 'no FK existence checks issued when no cross-links are provided');
    });

    it('rejects an unknown series_id', async () => {
        const mockDb = seededDb();
        mockDb.setQueryResult('FROM series WHERE id = $1', []);
        const handlers = new WorksHandlers(mockDb);

        await assert.rejects(
            handlers.handleCreateWork({ work_type: 'series', sequence: 0, series_id: 999 }),
            /series_id 999 not found in series/
        );
    });

    it('rejects an unknown book_id', async () => {
        const mockDb = seededDb();
        mockDb.setQueryResult('FROM books WHERE id = $1', []);
        const handlers = new WorksHandlers(mockDb);

        await assert.rejects(
            handlers.handleCreateWork({ work_type: 'book', sequence: 0, parent_id: 1, book_id: 999 }),
            /book_id 999 not found in books/
        );
    });

    it('rejects an unknown chapter_id', async () => {
        const mockDb = seededDb();
        mockDb.setQueryResult('FROM chapters WHERE id = $1', []);
        const handlers = new WorksHandlers(mockDb);

        await assert.rejects(
            handlers.handleCreateWork({ work_type: 'chapter', sequence: 0, parent_id: 1, chapter_id: 999 }),
            /chapter_id 999 not found in chapters/
        );
    });

    it('rejects an unknown scene_id', async () => {
        const mockDb = seededDb();
        mockDb.setQueryResult('FROM chapter_scenes WHERE id = $1', []);
        const handlers = new WorksHandlers(mockDb);

        await assert.rejects(
            handlers.handleCreateWork({ work_type: 'scene', sequence: 0, parent_id: 1, scene_id: 999 }),
            /scene_id 999 not found in chapter_scenes/
        );
    });
});

describe('WorksHandlers.handleUpdateWork cross-link validation', () => {
    it('validates and applies a provided book_id', async () => {
        const mockDb = seededDb();
        mockDb.setQueryResult('UPDATE outline_works SET', [{ id: 5, work_type: 'book', title: 'Book One', status: 'planned' }]);
        const handlers = new WorksHandlers(mockDb);

        const result = await handlers.handleUpdateWork({ work_id: 5, book_id: 2 });
        assert.ok(result.content[0].text.includes('Updated work'));

        const updateCall = mockDb.queries.find(q => q.text.includes('UPDATE outline_works SET'));
        assert.ok(updateCall.text.includes('book_id = $'), 'update statement includes book_id');
        assert.ok(updateCall.params.includes(2), 'book_id value bound');
    });

    it('rejects an unknown book_id on update', async () => {
        const mockDb = seededDb();
        mockDb.setQueryResult('FROM books WHERE id = $1', []);
        const handlers = new WorksHandlers(mockDb);

        await assert.rejects(
            handlers.handleUpdateWork({ work_id: 5, book_id: 999 }),
            /book_id 999 not found in books/
        );
    });

    it('clears book_id with 0 without requiring it to exist', async () => {
        const mockDb = seededDb();
        mockDb.setQueryResult('FROM books WHERE id = $1', []); // would fail existence if checked
        mockDb.setQueryResult('UPDATE outline_works SET', [{ id: 5, work_type: 'book', title: 'Book One', status: 'planned' }]);
        const handlers = new WorksHandlers(mockDb);

        const result = await handlers.handleUpdateWork({ work_id: 5, book_id: 0 });
        assert.ok(result.content[0].text.includes('Updated work'));

        const updateCall = mockDb.queries.find(q => q.text.includes('UPDATE outline_works SET'));
        const bookIdParamIndex = updateCall.text.match(/book_id = \$(\d+)/)[1] - 1;
        assert.strictEqual(updateCall.params[bookIdParamIndex], null, 'book_id cleared to NULL');
    });

    it('leaves cross-links untouched when not provided', async () => {
        const mockDb = seededDb();
        mockDb.setQueryResult('UPDATE outline_works SET', [{ id: 5, work_type: 'book', title: 'Book One', status: 'planned' }]);
        const handlers = new WorksHandlers(mockDb);

        await handlers.handleUpdateWork({ work_id: 5, title: 'New Title' });
        const updateCall = mockDb.queries.find(q => q.text.includes('UPDATE outline_works SET'));
        assert.ok(!updateCall.text.includes('book_id'), 'book_id not touched when omitted');
    });
});

describe('WorksHandlers.handleGetWorksForBook', () => {
    it('rejects a non-numeric book_id', async () => {
        const mockDb = seededDb();
        const handlers = new WorksHandlers(mockDb);
        await assert.rejects(
            handlers.handleGetWorksForBook({ book_id: 'nope' }),
            /book_id must be a positive number/
        );
    });

    it('rejects an unknown book_id', async () => {
        const mockDb = seededDb();
        mockDb.setQueryResult('FROM books WHERE id = $1', []);
        const handlers = new WorksHandlers(mockDb);
        await assert.rejects(
            handlers.handleGetWorksForBook({ book_id: 999 }),
            /Book with ID 999 not found/
        );
    });

    it('reports when no outline nodes are cross-linked to the book yet', async () => {
        const mockDb = seededDb();
        mockDb.setQueryResult('FROM outline_works WHERE book_id = $1', []);
        const handlers = new WorksHandlers(mockDb);

        const result = await handlers.handleGetWorksForBook({ book_id: 2 });
        assert.ok(result.content[0].text.includes('No outline nodes are cross-linked to book_id 2'));
    });

    it('renders the tree for each matching outline root', async () => {
        const mockDb = seededDb();
        mockDb.setQueryResult('FROM outline_works WHERE book_id = $1', [{ id: 10, work_type: 'book', title: 'Book One' }]);
        mockDb.setQueryResult('WITH RECURSIVE tree AS', [
            { id: 10, parent_id: null, work_type: 'book', sequence: 0, title: 'Book One', summary: null, content: null, status: 'planned', rel_depth: 0 },
            { id: 11, parent_id: 10, work_type: 'chapter', sequence: 1, title: 'Chapter 1', summary: null, content: null, status: 'planned', rel_depth: 1 }
        ]);
        const handlers = new WorksHandlers(mockDb);

        const result = await handlers.handleGetWorksForBook({ book_id: 2 });
        const text = result.content[0].text;
        assert.ok(text.includes('1 outline node(s) cross-linked to book_id 2'));
        assert.ok(text.includes('[book#10] Book One'));
        assert.ok(text.includes('[chapter#11] Chapter 1'));
    });
});
