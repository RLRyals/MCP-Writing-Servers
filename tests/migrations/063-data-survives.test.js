// Migration 063 (mws-2gk) is additive; existing character_knowledge rows must
// survive untouched and satisfy the new constraints. Runs the real SQL against a
// throwaway Postgres (MWS_TEST_PG_URL).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { pgUrl, createThrowawayDb, migrationSql, seedBasics } from '../helpers/throwaway-db.js';

describe('063_character_knowledge_anchors keeps existing rows', { skip: !pgUrl && 'MWS_TEST_PG_URL not set (no throwaway Postgres)' }, () => {
    let db;
    before(async () => {
        db = await createThrowawayDb(63);
        const c = db.client;
        const { characterId: id } = await seedBasics(c);
        await c.query(`INSERT INTO character_knowledge (character_id, knowledge_category, knowledge_item, knowledge_level, learned_context)
                       VALUES ($1, 'secret', 'item A is hidden in place B', 'suspects', 'old context'),
                              ($1, 'skill', 'item C', 'knows', NULL)`, [id]);
        await c.query(migrationSql('063_character_knowledge_anchors.sql'));
    });
    after(async () => { if (db) await db.dispose(); });

    it('existing rows and values are unchanged, new anchor columns are NULL', async () => {
        const r = await db.client.query(`SELECT knowledge_item, knowledge_level, learned_context, known_from, known_scene_id, fact_id, reveal_id
                                         FROM character_knowledge ORDER BY id`);
        assert.strictEqual(r.rows.length, 2);
        assert.deepStrictEqual(r.rows[0], { knowledge_item: 'item A is hidden in place B', knowledge_level: 'suspects',
            learned_context: 'old context', known_from: null, known_scene_id: null, fact_id: null, reveal_id: null });
        assert.strictEqual(r.rows[1].knowledge_item, 'item C');
    });

    it('re-running the migration is a no-op that keeps the data', async () => {
        await db.client.query(migrationSql('063_character_knowledge_anchors.sql'));
        const r = await db.client.query(`SELECT count(*)::int AS n FROM character_knowledge`);
        assert.strictEqual(r.rows[0].n, 2);
    });
});
