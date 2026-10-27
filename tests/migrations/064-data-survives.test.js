// Migration 064 (mws-ntf) must keep character_chapter_presence.{learns,reveals,suspects}_this_chapter
// and COPY learns/suspects into character_knowledge exactly once. Runs the real SQL against a
// throwaway Postgres (MWS_TEST_PG_URL).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { pgUrl, createThrowawayDb, migrationSql, seedBasics } from '../helpers/throwaway-db.js';

const FILE = '064_canon_scene_pointers.sql';

describe('064_canon_scene_pointers keeps and mirrors presence knowledge', { skip: !pgUrl && 'MWS_TEST_PG_URL not set (no throwaway Postgres)' }, () => {
    let db, ids, chapterId;
    const long = 'x'.repeat(300);
    before(async () => {
        db = await createThrowawayDb(64);
        const c = db.client;
        ids = await seedBasics(c);
        const ch = await c.query(`INSERT INTO chapters (book_id, chapter_number, title) VALUES ($1, 1, 'Fixture Chapter') RETURNING id`, [ids.bookId]);
        chapterId = ch.rows[0].id;
        await c.query(`INSERT INTO character_chapter_presence
            (character_id, chapter_id, presence_type, learns_this_chapter, reveals_this_chapter, suspects_this_chapter)
            VALUES ($1, $2, 'present', $3, $4, $5)`,
            [ids.characterId, chapterId, ['item A', 'item B', '', long], ['secret R'], ['hunch S']]);
        // 'item B' is already mirrored in character_knowledge (e.g. by add_character_knowledge_with_chapter)
        await c.query(`INSERT INTO character_knowledge (character_id, knowledge_category, knowledge_item, knowledge_level, learned_context)
            VALUES ($1, 'secret', 'item B', 'knows', 'hand entered')`, [ids.characterId]);
        await c.query(migrationSql(FILE));
    });
    after(async () => { if (db) await db.dispose(); });

    it('the three legacy columns still exist with their exact values', async () => {
        const r = await db.client.query(`SELECT learns_this_chapter, reveals_this_chapter, suspects_this_chapter FROM character_chapter_presence`);
        assert.deepStrictEqual(r.rows[0].learns_this_chapter, ['item A', 'item B', '', long]);
        assert.deepStrictEqual(r.rows[0].reveals_this_chapter, ['secret R']);
        assert.deepStrictEqual(r.rows[0].suspects_this_chapter, ['hunch S']);
    });

    it('copies learns/suspects into character_knowledge without duplicating existing items', async () => {
        const r = await db.client.query(`SELECT knowledge_item, knowledge_level, knowledge_category, learned_book_id, learned_context
                                         FROM character_knowledge ORDER BY knowledge_item`);
        const by = Object.fromEntries(r.rows.map(x => [x.knowledge_item, x]));
        assert.strictEqual(r.rows.length, 3, 'item A, item B (pre-existing, not duplicated), hunch S');
        assert.strictEqual(by['item A'].knowledge_level, 'knows');
        assert.strictEqual(by['item A'].learned_book_id, ids.bookId);
        assert.strictEqual(by['item A'].learned_context, `migrated from character_chapter_presence.learns_this_chapter (chapter ${chapterId})`);
        assert.strictEqual(by['hunch S'].knowledge_level, 'suspects');
        assert.match(by['hunch S'].learned_context, /suspects_this_chapter \(chapter /);
        assert.strictEqual(by['item B'].learned_context, 'hand entered', 'pre-existing row untouched');
        assert.ok(!by['secret R'], 'reveals_this_chapter is not copied');
    });

    it('a second run adds nothing', async () => {
        await db.client.query(`DELETE FROM migrations WHERE filename = $1`, [FILE]); // force the body to execute again
        await db.client.query(migrationSql(FILE));
        const r = await db.client.query(`SELECT count(*)::int AS n FROM character_knowledge`);
        assert.strictEqual(r.rows[0].n, 3);
    });
});
