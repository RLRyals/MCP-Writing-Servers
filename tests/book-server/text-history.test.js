// tests/book-server/text-history.test.js
// Trigger-backed text history for chapter_scenes / outline_works (migration 058).
// DB is mocked; the migration is checked as text. Synthetic fixtures only.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { SceneHandlers } from '../../src/mcps/book-server/handlers/scene-handlers.js';
import { WorksHandlers } from '../../src/mcps/outline-server/handlers/works-handlers.js';

function mockDb(responder = () => ({ rows: [] })) {
    return {
        queries: [],
        async query(text, params = []) {
            this.queries.push({ text, params });
            return responder(text, params);
        }
    };
}

describe('migration 058', () => {
    const sql = readFileSync(new URL('../../migrations/058_text_history_triggers.sql', import.meta.url), 'utf8');

    it('creates both history tables without FKs to the live rows', () => {
        assert.match(sql, /CREATE TABLE IF NOT EXISTS chapter_scenes_history/);
        assert.match(sql, /CREATE TABLE IF NOT EXISTS outline_works_history/);
        assert.doesNotMatch(sql, /REFERENCES/);
    });

    it('only records when text actually changes', () => {
        assert.match(sql, /NEW\.scene_content IS DISTINCT FROM OLD\.scene_content/);
        assert.match(sql, /NEW\.content IS DISTINCT FROM OLD\.content/);
    });

    it('installs BEFORE UPDATE OR DELETE triggers on both tables', () => {
        assert.match(sql, /BEFORE UPDATE OR DELETE ON chapter_scenes\b/);
        assert.match(sql, /BEFORE UPDATE OR DELETE ON outline_works\b/);
    });

    it('captures db user and application_name', () => {
        assert.match(sql, /changed_by TEXT NOT NULL DEFAULT current_user/);
        assert.match(sql, /current_setting\('application_name', true\)/);
    });
});

describe('scene version tools', () => {
    it('lists versions newest first', async () => {
        const db = mockDb(() => ({ rows: [{ version_id: 2 }, { version_id: 1 }] }));
        const res = await new SceneHandlers(db).handleListSceneVersions({ scene_id: 5 });
        assert.match(db.queries[0].text, /FROM chapter_scenes_history/);
        assert.match(db.queries[0].text, /ORDER BY id DESC/);
        assert.deepEqual(db.queries[0].params, [5, 50]);
        assert.strictEqual(res.count, 2);
    });

    it('get returns full text, not_found otherwise', async () => {
        const db = mockDb(() => ({ rows: [{ version_id: 3, scene_content: 'x'.repeat(3000) }] }));
        const res = await new SceneHandlers(db).handleGetSceneVersion({ version_id: 3 });
        assert.strictEqual(res.version.scene_content.length, 3000);
        const miss = await new SceneHandlers(mockDb()).handleGetSceneVersion({ version_id: 9 });
        assert.strictEqual(miss.error, 'not_found');
    });

    it('restore is an ordinary UPDATE of scene_content', async () => {
        const db = mockDb((t) => t.includes('FROM chapter_scenes_history')
            ? { rows: [{ scene_id: 5, old_content: 'old text' }] }
            : { rows: [{ id: 5, updated_at: 'now' }] });
        const res = await new SceneHandlers(db).handleRestoreSceneVersion({ version_id: 3 });
        const upd = db.queries[1];
        assert.match(upd.text, /^\s*UPDATE chapter_scenes SET scene_content = \$2/);
        assert.deepEqual(upd.params, [5, 'old text']);
        assert.strictEqual(res.restored, true);
    });

    it('restore of unknown version does not update', async () => {
        const db = mockDb();
        const res = await new SceneHandlers(db).handleRestoreSceneVersion({ version_id: 9 });
        assert.strictEqual(res.error, 'not_found');
        assert.strictEqual(db.queries.length, 1);
    });
});

describe('work version tools', () => {
    it('lists versions', async () => {
        const db = mockDb(() => ({ rows: [{ version_id: 4, changed_at: '2026-01-01T00:00:00Z',
            change_kind: 'update', content_length: 10, changed_by: 'u', application_name: 'app' }] }));
        const res = await new WorksHandlers(db).handleListWorkVersions({ work_id: 2 });
        assert.match(db.queries[0].text, /FROM outline_works_history/);
        assert.match(res.content[0].text, /v4 .*update.*10 chars/);
    });

    it('restore is an ordinary UPDATE of content', async () => {
        const db = mockDb((t) => t.includes('FROM outline_works_history')
            ? { rows: [{ work_id: 2, old_content: 'prior' }] }
            : { rows: [{ id: 2 }] });
        const res = await new WorksHandlers(db).handleRestoreWorkVersion({ version_id: 4 });
        assert.match(db.queries[1].text, /UPDATE outline_works SET content = \$2/);
        assert.deepEqual(db.queries[1].params, [2, 'prior']);
        assert.match(res.content[0].text, /Restored work 2/);
    });
});
