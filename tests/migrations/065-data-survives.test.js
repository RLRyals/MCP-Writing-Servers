// Migration 065 (mws-wm4) is additive (new table). Runs the real SQL against a
// throwaway Postgres (MWS_TEST_PG_URL): existing outline rows survive, the table
// accepts one note per scene, and re-running is a no-op.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { pgUrl, createThrowawayDb, migrationSql } from '../helpers/throwaway-db.js';

describe('065_scene_state_notes', { skip: !pgUrl && 'MWS_TEST_PG_URL not set (no throwaway Postgres)' }, () => {
    let db, sceneId;
    before(async () => {
        db = await createThrowawayDb(65);
        const c = db.client;
        const s = await c.query(`INSERT INTO outline_works (work_type, title) VALUES ('series', 'S') RETURNING id`);
        const w = await c.query(`INSERT INTO outline_works (parent_id, work_type, title) VALUES ($1, 'scene', 'Sc') RETURNING id`, [s.rows[0].id]);
        sceneId = w.rows[0].id;
        await c.query(migrationSql('065_scene_state_notes.sql'));
    });
    after(async () => { if (db) await db.dispose(); });

    it('existing works survive and a scene takes one note', async () => {
        const c = db.client;
        assert.strictEqual((await c.query(`SELECT count(*)::int n FROM outline_works`)).rows[0].n, 2);
        await c.query(`INSERT INTO outline_scene_state_notes (work_id, decisions) VALUES ($1, 'a')`, [sceneId]);
        await assert.rejects(c.query(`INSERT INTO outline_scene_state_notes (work_id) VALUES ($1)`, [sceneId]), /unique/);
    });

    it('note is removed with its scene; re-running the migration is a no-op', async () => {
        const c = db.client;
        await c.query(migrationSql('065_scene_state_notes.sql'));
        assert.strictEqual((await c.query(`SELECT count(*)::int n FROM outline_scene_state_notes`)).rows[0].n, 1);
        await c.query(`DELETE FROM outline_works WHERE id = $1`, [sceneId]);
        assert.strictEqual((await c.query(`SELECT count(*)::int n FROM outline_scene_state_notes`)).rows[0].n, 0);
    });
});
