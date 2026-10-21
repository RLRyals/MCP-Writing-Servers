// tests/story-analysis-server/storyweave-handlers.test.js
// Tests for StoryweaveHandlers (bead mws-ci9) against a mocked db.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { StoryweaveHandlers } from '../../src/mcps/story-analysis-server/handlers/storyweave-handlers.js';

class MockDatabase {
    constructor() {
        this.queryResults = new Map();
        this.queries = [];
    }
    setQueryResult(pattern, rows) {
        this.queryResults.set(pattern, { rows });
    }
    async query(text, params = []) {
        this.queries.push({ text, params });
        for (const [pattern, result] of this.queryResults.entries()) {
            if (text.includes(pattern)) return result;
        }
        return { rows: [] };
    }
}

function seededDb({ storyform = true } = {}) {
    const db = new MockDatabase();
    db.setQueryResult('FROM series WHERE id = $1', [{ id: 1, title: 'S' }]);
    db.setQueryResult('WHERE series_id = $1 AND book_id IS NULL', storyform ? [{ id: 10 }] : []);
    return db;
}

describe('StoryweaveHandlers tracks', () => {
    it('upserts tracks against the resolved storyform', async () => {
        const db = seededDb();
        const h = new StoryweaveHandlers(db);
        const res = await h.handleSetStoryweaveTracks({
            series_id: 1,
            tracks: [{ throughline: 'OS', progression: 1, hidden_text: 'secret', text: 'x' }]
        });
        assert.match(res.content[0].text, /1 track/);
        const ins = db.queries.find(q => q.text.includes('INSERT INTO storyweave_tracks'));
        assert.deepStrictEqual(ins.params.slice(0, 3), [10, 'OS', 1]);
        assert.strictEqual(ins.params[6], 'secret');
        assert.ok(!db.queries.some(q => q.text.includes('DELETE')));
    });

    it('replace=true deletes first', async () => {
        const db = seededDb();
        await new StoryweaveHandlers(db).handleSetStoryweaveTracks({
            series_id: 1, replace: true, tracks: [{ throughline: 'MC', progression: 16 }]
        });
        assert.ok(db.queries.some(q => q.text.includes('DELETE FROM storyweave_tracks')));
    });

    it('rejects bad throughline / progression', async () => {
        const h = new StoryweaveHandlers(seededDb());
        await assert.rejects(h.handleSetStoryweaveTracks({ series_id: 1, tracks: [{ throughline: 'XX', progression: 1 }] }), /throughline/);
        await assert.rejects(h.handleSetStoryweaveTracks({ series_id: 1, tracks: [{ throughline: 'OS', progression: 17 }] }), /progression/);
    });

    it('fails when no storyform exists', async () => {
        const h = new StoryweaveHandlers(seededDb({ storyform: false }));
        await assert.rejects(h.handleSetStoryweaveTracks({ series_id: 1, tracks: [{ throughline: 'OS', progression: 1 }] }), /create_storyform first/);
    });

    it('get returns tracks as JSON and applies throughline filter', async () => {
        const db = seededDb();
        db.setQueryResult('FROM storyweave_tracks', [{ throughline: 'IC', progression: 2 }]);
        const res = await new StoryweaveHandlers(db).handleGetStoryweaveTracks({ series_id: 1, throughline: 'IC' });
        const payload = JSON.parse(res.content[0].text);
        assert.strictEqual(payload.count, 1);
        const q = db.queries.find(x => x.text.includes('FROM storyweave_tracks'));
        assert.deepStrictEqual(q.params, [10, 'IC']);
    });
});

describe('StoryweaveHandlers interleave', () => {
    it('replaces beats, defaulting seq to position', async () => {
        const db = seededDb();
        await new StoryweaveHandlers(db).handleSetStoryweaveInterleave({
            series_id: 1, beats: [{ beat: 'a' }, { beat: 'b', throughline: 'RS', progression: 3 }]
        });
        assert.ok(db.queries.some(q => q.text.includes('DELETE FROM storyweave_interleave')));
        const ins = db.queries.filter(q => q.text.includes('INSERT INTO storyweave_interleave'));
        assert.deepStrictEqual(ins.map(q => q.params[1]), [1, 2]);
        assert.strictEqual(ins[1].params[2], 'RS');
    });

    it('rejects duplicate seq and empty beat', async () => {
        const h = new StoryweaveHandlers(seededDb());
        await assert.rejects(h.handleSetStoryweaveInterleave({ series_id: 1, beats: [{ seq: 1, beat: 'a' }, { seq: 1, beat: 'b' }] }), /duplicate/);
        await assert.rejects(h.handleSetStoryweaveInterleave({ series_id: 1, beats: [{ beat: ' ' }] }), /beat/);
    });

    it('get returns ordered beats', async () => {
        const db = seededDb();
        db.setQueryResult('FROM storyweave_interleave', [{ seq: 1, beat: 'a' }]);
        const res = await new StoryweaveHandlers(db).handleGetStoryweaveInterleave({ series_id: 1 });
        assert.strictEqual(JSON.parse(res.content[0].text).beats[0].beat, 'a');
    });
});
