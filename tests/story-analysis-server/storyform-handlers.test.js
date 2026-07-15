// tests/story-analysis-server/storyform-handlers.test.js
// Tests for StoryformHandlers (bead mws-rev): create_storyform / update_storyform /
// get_storyform over the `storyforms` table (migration 046). Canon-DB flip 01 --
// FictIonLab-Downloads/specs/2026-07-10-canon-db-migration/01-storyform-storage.md
//
// Exercises the handler against a mocked db (no live database required),
// matching the pattern used in tests/plot-server/plot-thread-handlers.test.js.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { StoryformHandlers } from '../../src/mcps/story-analysis-server/handlers/storyform-handlers.js';

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

function seededDb({ seriesExists = true, bookExists = true, bookSeriesId = 1, existingStoryform = false } = {}) {
    const mockDb = new MockDatabase();
    mockDb.setQueryResult('FROM series WHERE id = $1', seriesExists ? [{ id: 1, title: 'Wuthering Dragons' }] : []);
    mockDb.setQueryResult('FROM books WHERE id = $1', bookExists ? [{ id: 5, series_id: bookSeriesId, title: 'Book One' }] : []);
    mockDb.setQueryResult('WHERE series_id = $1 AND book_id IS NULL', existingStoryform ? [{ id: 10 }] : []);
    mockDb.setQueryResult('WHERE series_id = $1 AND book_id = $2', existingStoryform ? [{ id: 11 }] : []);
    return mockDb;
}

describe('StoryformHandlers.handleCreateStoryform', () => {
    it('creates the series-master storyform (book_id omitted)', async () => {
        const mockDb = seededDb();
        mockDb.setQueryResult('INSERT INTO storyforms', [{
            id: 10, series_id: 1, book_id: null,
            os_domain: 'Universe', mc_domain: 'Psychology', ic_domain: 'Physics', rs_domain: 'Mind',
            story_driver: 'Action', story_limit: 'Optionlock',
            story_outcome_id: null, story_judgment_id: null, story_concern_id: null,
            mc_resolve: 'Change', mc_growth: 'Start', mc_approach: 'Do-er', mc_ps_style: 'Linear',
            rationale: 'Series-level rationale', appreciations: null
        }]);

        const handlers = new StoryformHandlers(mockDb);
        const result = await handlers.handleCreateStoryform({
            series_id: 1,
            os_domain: 'Universe',
            mc_domain: 'Psychology',
            ic_domain: 'Physics',
            rs_domain: 'Mind',
            story_driver: 'Action',
            story_limit: 'Optionlock',
            mc_resolve: 'Change',
            mc_growth: 'Start',
            mc_approach: 'Do-er',
            mc_ps_style: 'Linear',
            rationale: 'Series-level rationale'
        });

        assert.ok(result.content[0].text.includes('Storyform created!'));
        assert.ok(result.content[0].text.includes('series master'));
        assert.ok(result.content[0].text.includes('Wuthering Dragons'));

        const insertCall = mockDb.queries.find(q => q.text.includes('INSERT INTO storyforms'));
        assert.ok(insertCall, 'issued an INSERT into storyforms');
        assert.strictEqual(insertCall.params[0], 1, 'series_id bound correctly');
        assert.strictEqual(insertCall.params[1], null, 'book_id is NULL for the series master');
    });

    it('creates a per-book storyform (book_id set, belongs to series)', async () => {
        const mockDb = seededDb({ bookSeriesId: 1 });
        mockDb.setQueryResult('INSERT INTO storyforms', [{
            id: 20, series_id: 1, book_id: 5,
            os_domain: null, mc_domain: null, ic_domain: null, rs_domain: null,
            story_driver: null, story_limit: null,
            story_outcome_id: null, story_judgment_id: null, story_concern_id: null,
            mc_resolve: null, mc_growth: null, mc_approach: null, mc_ps_style: null,
            rationale: null, appreciations: null
        }]);

        const handlers = new StoryformHandlers(mockDb);
        const result = await handlers.handleCreateStoryform({ series_id: 1, book_id: 5 });

        assert.ok(result.content[0].text.includes('book 5'));
        const insertCall = mockDb.queries.find(q => q.text.includes('INSERT INTO storyforms'));
        assert.strictEqual(insertCall.params[1], 5, 'book_id bound correctly');
    });

    it('rejects when a storyform already exists at that scope', async () => {
        const mockDb = seededDb({ existingStoryform: true });
        const handlers = new StoryformHandlers(mockDb);

        await assert.rejects(
            handlers.handleCreateStoryform({ series_id: 1 }),
            /already exists.*use update_storyform/
        );
    });

    it('rejects when the series does not exist', async () => {
        const mockDb = seededDb({ seriesExists: false });
        const handlers = new StoryformHandlers(mockDb);

        await assert.rejects(
            handlers.handleCreateStoryform({ series_id: 999 }),
            /Series with ID 999 not found/
        );
    });

    it('rejects when the book does not exist', async () => {
        const mockDb = seededDb({ bookExists: false });
        const handlers = new StoryformHandlers(mockDb);

        await assert.rejects(
            handlers.handleCreateStoryform({ series_id: 1, book_id: 999 }),
            /Book with ID 999 not found/
        );
    });

    it('rejects when the book belongs to a different series', async () => {
        const mockDb = seededDb({ bookSeriesId: 2 });
        const handlers = new StoryformHandlers(mockDb);

        await assert.rejects(
            handlers.handleCreateStoryform({ series_id: 1, book_id: 5 }),
            /Book 5 does not belong to series 1/
        );
    });

    it('rejects a non-numeric series_id', async () => {
        const mockDb = seededDb();
        const handlers = new StoryformHandlers(mockDb);

        await assert.rejects(
            handlers.handleCreateStoryform({ series_id: 'nope' }),
            /series_id must be a positive number/
        );
    });
});

describe('StoryformHandlers.handleUpdateStoryform', () => {
    it('rejects when no storyform exists yet at that scope', async () => {
        const mockDb = seededDb({ existingStoryform: false });
        const handlers = new StoryformHandlers(mockDb);

        await assert.rejects(
            handlers.handleUpdateStoryform({ series_id: 1, rationale: 'new take' }),
            /No storyform exists.*use create_storyform/
        );
    });

    it('updates an existing storyform', async () => {
        const mockDb = seededDb({ existingStoryform: true });
        mockDb.setQueryResult('UPDATE storyforms', [{
            id: 10, series_id: 1, book_id: null,
            os_domain: 'Universe', mc_domain: null, ic_domain: null, rs_domain: null,
            story_driver: null, story_limit: null,
            story_outcome_id: null, story_judgment_id: null, story_concern_id: null,
            mc_resolve: null, mc_growth: null, mc_approach: null, mc_ps_style: null,
            rationale: 'updated rationale', appreciations: null
        }]);

        const handlers = new StoryformHandlers(mockDb);
        const result = await handlers.handleUpdateStoryform({ series_id: 1, rationale: 'updated rationale' });

        assert.ok(result.content[0].text.includes('Storyform updated!'));
        const updateCall = mockDb.queries.find(q => q.text.includes('UPDATE storyforms'));
        assert.ok(updateCall, 'issued an UPDATE against storyforms');
        assert.strictEqual(updateCall.params[updateCall.params.length - 1], 10, 'updates the row found for this scope');
    });
});

describe('StoryformHandlers.handleGetStoryform', () => {
    it('returns a not-found message when no storyform exists', async () => {
        const mockDb = seededDb();
        mockDb.setQueryResult('FROM storyforms sf', []);
        const handlers = new StoryformHandlers(mockDb);

        const result = await handlers.handleGetStoryform({ series_id: 1 });
        assert.ok(result.content[0].text.includes('No storyform found for series 1'));
    });

    it('round-trips a storyform with resolved lookup names', async () => {
        const mockDb = seededDb();
        mockDb.setQueryResult('FROM storyforms sf', [{
            id: 10, series_id: 1, book_id: null,
            os_domain: 'Universe', mc_domain: 'Psychology', ic_domain: 'Physics', rs_domain: 'Mind',
            story_driver: 'Action', story_limit: 'Optionlock',
            story_outcome_id: 1, story_judgment_id: 1, story_concern_id: 1,
            mc_resolve: 'Change', mc_growth: 'Start', mc_approach: 'Do-er', mc_ps_style: 'Linear',
            rationale: 'Series-level rationale', appreciations: { signpost_1: 'setup' },
            outcome_name: 'success', judgment_name: 'good', concern_name: 'becoming'
        }]);

        const handlers = new StoryformHandlers(mockDb);
        const result = await handlers.handleGetStoryform({ series_id: 1 });

        const text = result.content[0].text;
        assert.ok(text.includes('Wuthering Dragons'));
        assert.ok(text.includes('Story Outcome:** success'));
        assert.ok(text.includes('Story Judgment:** good'));
        assert.ok(text.includes('Story Concern:** becoming'));
        assert.ok(text.includes('signpost_1'));
    });
});
