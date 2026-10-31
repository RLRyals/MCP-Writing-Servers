// Migration 062 (mws-7oa) must keep existing chapter-number data in the legacy
// columns. Runs the real SQL against a throwaway Postgres (MWS_TEST_PG_URL).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { pgUrl, createThrowawayDb, migrationSql } from '../helpers/throwaway-db.js';

describe('062_reveal_scene_refs keeps existing rows', { skip: !pgUrl && 'MWS_TEST_PG_URL not set (no throwaway Postgres)' }, () => {
    let db;
    before(async () => {
        db = await createThrowawayDb(62);
        const c = db.client;
        await c.query(`INSERT INTO information_reveals (id, information_content, revealed_in_chapter, foreshadowing_chapters)
                       VALUES (1, 'fixture reveal', 7, '{3,5}')`);
        await c.query(`INSERT INTO reveal_evidence (id, reveal_id, evidence_description, discovery_chapter)
                       VALUES (1, 1, 'fixture evidence', 4)`);
        await c.query(`INSERT INTO information_flow (id, reveal_id, learned_by_character_id, learned_in_chapter)
                       VALUES (1, 1, 99, 6)`);
        await c.query(migrationSql('062_reveal_scene_refs.sql'));
    });
    after(async () => { if (db) await db.dispose(); });

    it('old columns still exist with their values', async () => {
        const r = await db.client.query(`SELECT revealed_in_chapter, foreshadowing_chapters FROM information_reveals WHERE id = 1`);
        assert.strictEqual(r.rows[0].revealed_in_chapter, 7);
        assert.deepStrictEqual(r.rows[0].foreshadowing_chapters, [3, 5]);
        const e = await db.client.query(`SELECT discovery_chapter FROM reveal_evidence WHERE id = 1`);
        assert.strictEqual(e.rows[0].discovery_chapter, 4);
        const f = await db.client.query(`SELECT learned_in_chapter, learned_by_reader, learned_in_scene_id FROM information_flow WHERE id = 1`);
        assert.strictEqual(f.rows[0].learned_in_chapter, 6);
        assert.strictEqual(f.rows[0].learned_by_reader, false);
        assert.strictEqual(f.rows[0].learned_in_scene_id, null);
    });

    it('new scene columns exist and legacy columns are marked DEPRECATED', async () => {
        const cols = await db.client.query(`SELECT column_name FROM information_schema.columns
            WHERE column_name IN ('revealed_in_scene_id','foreshadowing_scene_ids','discovery_scene_id','learned_in_scene_id')`);
        assert.strictEqual(cols.rows.length, 4);
        const c = await db.client.query(`SELECT col_description('information_reveals'::regclass,
            (SELECT attnum FROM pg_attribute WHERE attrelid='information_reveals'::regclass AND attname='revealed_in_chapter')) AS d`);
        assert.match(c.rows[0].d, /^DEPRECATED 2026-10-27 \(mws-7oa\)/);
    });

    it('re-running the migration is a no-op that keeps the data', async () => {
        await db.client.query(migrationSql('062_reveal_scene_refs.sql'));
        const r = await db.client.query(`SELECT revealed_in_chapter FROM information_reveals WHERE id = 1`);
        assert.strictEqual(r.rows[0].revealed_in_chapter, 7);
    });
});
