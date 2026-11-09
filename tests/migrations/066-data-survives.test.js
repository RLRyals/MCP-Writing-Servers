// Migration 066 (mws-1ut) widens world_elements.rarity and organizations.status.
// Runs the real SQL against a throwaway Postgres (MWS_TEST_PG_URL): existing rows
// survive unchanged, 100-character values now fit, re-running is a no-op.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { pgUrl, createThrowawayDb, migrationSql } from '../helpers/throwaway-db.js';

describe('066_widen_world_text_columns', { skip: !pgUrl && 'MWS_TEST_PG_URL not set (no throwaway Postgres)' }, () => {
    let db;
    before(async () => {
        db = await createThrowawayDb(66);
        const c = db.client;
        const a = await c.query(`INSERT INTO authors (name) VALUES ('A') RETURNING id`);
        const s = await c.query(`INSERT INTO series (title, author_id) VALUES ('S', $1) RETURNING id`, [a.rows[0].id]);
        await c.query(`INSERT INTO world_elements (series_id, name, element_type, rarity) VALUES ($1, 'E', 'magic_system', 'rare')`, [s.rows[0].id]);
        await c.query(`INSERT INTO organizations (series_id, name, organization_type, status) VALUES ($1, 'O', 'guild', 'secret')`, [s.rows[0].id]);
        await c.query(migrationSql('066_widen_world_text_columns.sql'));
    });
    after(async () => { if (db) await db.dispose(); });

    it('existing rows survive and 100-character values now fit', async () => {
        const c = db.client;
        assert.strictEqual((await c.query(`SELECT rarity FROM world_elements`)).rows[0].rarity, 'rare');
        assert.strictEqual((await c.query(`SELECT status FROM organizations`)).rows[0].status, 'secret');
        await c.query(`UPDATE world_elements SET rarity = $1`, ['r'.repeat(100)]);
        await c.query(`UPDATE organizations SET status = $1`, ['s'.repeat(100)]);
        await assert.rejects(c.query(`UPDATE world_elements SET rarity = $1`, ['r'.repeat(101)]), /too long/);
    });

    it('re-running the migration is a no-op', async () => {
        await db.client.query(migrationSql('066_widen_world_text_columns.sql'));
        assert.strictEqual((await db.client.query(`SELECT count(*)::int n FROM world_elements`)).rows[0].n, 1);
    });
});
