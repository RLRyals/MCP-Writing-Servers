// tests/npe-analysis-server/npe-analysis-handlers.test.js
// Regression test for bead mws-1dw: chapter_id is a GLOBAL chapters.id, not a
// per-book chapter number. A caller that passes a bare chapter NUMBER (e.g. 4,
// meaning "chapter 4 of this book") as chapter_id can silently land on a
// different book's chapter. Callers should be able to pass book_id +
// chapter_number instead, and a chapter_id that doesn't belong to a supplied
// book_id must fail loudly rather than silently analyzing the wrong chapter.
// DB is fully mocked, matching the pattern used in
// tests/book-server/scene-handlers.test.js.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NPEAnalysisHandlers } from '../../src/mcps/npe-analysis-server/handlers/npe-analysis-handlers.js';

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

describe('NPEAnalysisHandlers.resolveChapterId', () => {
    it('resolves book_id + chapter_number to the global chapter_id', async () => {
        const mockDb = new MockDatabase();
        const handlers = new NPEAnalysisHandlers(mockDb);

        mockDb.setQueryResult(
            'FROM chapters WHERE book_id = $1 AND chapter_number = $2',
            [{ id: 34 }]
        );

        const chapterId = await handlers.resolveChapterId({ book_id: 1, chapter_number: 3 });
        assert.strictEqual(chapterId, 34);
    });

    it('throws when chapter_number is given without book_id', async () => {
        const mockDb = new MockDatabase();
        const handlers = new NPEAnalysisHandlers(mockDb);

        await assert.rejects(
            () => handlers.resolveChapterId({ chapter_number: 3 }),
            /book_id is required when chapter_number is provided/
        );
    });

    it('throws when book_id + chapter_number matches no chapter', async () => {
        const mockDb = new MockDatabase();
        const handlers = new NPEAnalysisHandlers(mockDb);
        // default MockDatabase.query returns { rows: [] } for unmatched patterns

        await assert.rejects(
            () => handlers.resolveChapterId({ book_id: 1, chapter_number: 99 }),
            /No chapter_number 99 found for book_id 1/
        );
    });

    it('passes through a bare chapter_id when no book_id is supplied', async () => {
        const mockDb = new MockDatabase();
        const handlers = new NPEAnalysisHandlers(mockDb);

        const chapterId = await handlers.resolveChapterId({ chapter_id: 4 });
        assert.strictEqual(chapterId, 4);
    });

    it('rejects a chapter_id that belongs to a different book than the supplied book_id', async () => {
        const mockDb = new MockDatabase();
        const handlers = new NPEAnalysisHandlers(mockDb);

        // chapter_id=4 actually belongs to book_id=3 (e.g. "The Mist"), but the
        // caller asked for book_id=1 ("Burn Directive") -- this is exactly the
        // 09-19 diagnosis bug: chapter_id=4 resolved to the wrong book's chapter.
        mockDb.setQueryResult('SELECT book_id FROM chapters WHERE id = $1', [{ book_id: 3 }]);

        await assert.rejects(
            () => handlers.resolveChapterId({ chapter_id: 4, book_id: 1 }),
            /chapter_id 4 belongs to book_id 3, not book_id 1/
        );
    });

    it('throws when neither chapter_id nor chapter_number is provided', async () => {
        const mockDb = new MockDatabase();
        const handlers = new NPEAnalysisHandlers(mockDb);

        await assert.rejects(
            () => handlers.resolveChapterId({}),
            /Either chapter_id, or book_id \+ chapter_number, must be provided/
        );
    });
});

describe('NPEAnalysisHandlers.handleAnalyzeChapterPacing with book_id + chapter_number', () => {
    it('analyzes the chapter resolved from book_id + chapter_number, not a raw id guess', async () => {
        const mockDb = new MockDatabase();
        const handlers = new NPEAnalysisHandlers(mockDb);

        mockDb.setQueryResult(
            'FROM chapters WHERE book_id = $1 AND chapter_number = $2',
            [{ id: 34 }]
        );
        mockDb.setQueryResult('FROM chapters c\n                JOIN books b', [{
            id: 34, title: 'Chapter 3', book_id: 1, book_title: 'Burn Directive'
        }]);
        mockDb.setQueryResult('FROM chapter_scenes cs', [
            { id: 101, scene_number: 1, word_count: 1200, energy_modulation: 'tension', time_treatment: null, scene_length_category: null },
            { id: 102, scene_number: 2, word_count: 1800, energy_modulation: 'release', time_treatment: null, scene_length_category: null }
        ]);

        const result = await handlers.handleAnalyzeChapterPacing({ book_id: 1, chapter_number: 3 });

        const insertedPacing = mockDb.queries.find(q => q.text.includes('INSERT INTO npe_pacing_analysis'));
        assert.ok(insertedPacing, 'expected a npe_pacing_analysis insert');
        // params: [analysisId, book_id, chapter_id, scene_count, ...]
        assert.strictEqual(insertedPacing.params[2], 34);

        assert.match(result.content[0].text, /Chapter Pacing Analysis/);
    });
});

describe('NPEAnalysisHandlers.resolveScene (mws-0md: scene writes must be book-scoped)', () => {
    const row = { id: 99, scene_number: 2, chapter_id: 4, chapter_title: 'Ch', book_id: 7, book_title: 'The Mist' };

    it('rejects a missing book_id', async () => {
        const handlers = new NPEAnalysisHandlers(new MockDatabase());
        await assert.rejects(() => handlers.resolveScene({ scene_id: 99 }), /book_id is required/);
    });

    it('rejects a scene_id that belongs to another book', async () => {
        const mockDb = new MockDatabase();
        mockDb.setQueryResult('WHERE cs.id = $1', [row]);
        const handlers = new NPEAnalysisHandlers(mockDb);
        await assert.rejects(
            () => handlers.resolveScene({ book_id: 1, scene_id: 99 }),
            /belongs to book_id 7, not book_id 1/
        );
    });

    it('accepts a scene_id that belongs to the book', async () => {
        const mockDb = new MockDatabase();
        mockDb.setQueryResult('WHERE cs.id = $1', [row]);
        const handlers = new NPEAnalysisHandlers(mockDb);
        const scene = await handlers.resolveScene({ book_id: 7, scene_id: 99 });
        assert.strictEqual(scene.id, 99);
    });

    it('resolves book_id + chapter_number + scene_number', async () => {
        const mockDb = new MockDatabase();
        mockDb.setQueryResult('c.chapter_number = $2', [row]);
        const handlers = new NPEAnalysisHandlers(mockDb);
        const scene = await handlers.resolveScene({ book_id: 7, chapter_number: 4, scene_number: 2 });
        assert.strictEqual(scene.id, 99);
        assert.deepStrictEqual(mockDb.queries[0].params, [7, 4, 2]);
    });

    it('rejects when scene_id disagrees with the chapter/scene numbers', async () => {
        const mockDb = new MockDatabase();
        mockDb.setQueryResult('c.chapter_number = $2', [row]);
        const handlers = new NPEAnalysisHandlers(mockDb);
        await assert.rejects(
            () => handlers.resolveScene({ book_id: 7, scene_id: 5, chapter_number: 4, scene_number: 2 }),
            /does not match/
        );
    });

    it('track_stakes_escalation refuses a call with no book_id and writes nothing', async () => {
        const mockDb = new MockDatabase();
        const handlers = new NPEAnalysisHandlers(mockDb);
        await assert.rejects(
            () => handlers.handleTrackStakesEscalation({ scene_id: 99, pressure_level: 50 }),
            /book_id must be a positive integer/
        );
        assert.strictEqual(mockDb.queries.length, 0);
    });

    it('log_information_reveal refuses a cross-book scene_id before inserting', async () => {
        const mockDb = new MockDatabase();
        mockDb.setQueryResult('WHERE cs.id = $1', [row]);
        const handlers = new NPEAnalysisHandlers(mockDb);
        await assert.rejects(
            () => handlers.handleLogInformationReveal({
                book_id: 1, scene_id: 99, information_content: 'x',
                alters_character_choice: false, reveal_method: 'dialogue'
            }),
            /belongs to book_id 7/
        );
        assert.ok(!mockDb.queries.some(q => q.text.includes('INSERT')));
    });
});
