// Tests for delete_character (bead mws-082). DB is a fake; no live database is touched.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CharacterHandlers } from '../../src/mcps/character-server/handlers/character-handlers.js';
import { characterToolsSchema } from '../../src/mcps/character-server/schemas/character-tools-schema.js';

// counts: { table: n } answers the dependency COUNT queries; deleted rows answer DELETE.
function fakeDb({ counts = {}, deleted = [], missingTables = [] } = {}) {
    const calls = [];
    return {
        calls,
        async query(sql, params) {
            calls.push({ sql, params });
            if (sql.includes('DELETE FROM characters')) return { rows: deleted };
            const m = sql.match(/FROM (\w+) WHERE/);
            if (m && missingTables.includes(m[1])) {
                const e = new Error(`relation "${m[1]}" does not exist`);
                e.code = '42P01';
                throw e;
            }
            return { rows: [{ count: m ? (counts[m[1]] || 0) : 0 }] };
        }
    };
}
const noDelete = db => !db.calls.some(c => c.sql.includes('DELETE'));

describe('delete_character', () => {
    it('refuses when dependents exist, lists them, and runs no DELETE', async () => {
        const db = fakeDb({ counts: { character_details: 2, character_arcs: 1 } });
        const res = await new CharacterHandlers(db).handleDeleteCharacter({ character_id: 5, confirm: true });
        assert.strictEqual(res.error, 'has_dependents');
        assert.match(res.message, /character details \(2\)/);
        assert.match(res.message, /character arcs \(1\)/);
        assert.deepStrictEqual(res.dependents.map(d => d.table).sort(), ['character_arcs', 'character_details']);
        assert.ok(noDelete(db));
    });
    it('deletes an unreferenced character and returns the removed row', async () => {
        const db = fakeDb({ deleted: [{ id: 5, name: 'Test Person' }] });
        const res = await new CharacterHandlers(db).handleDeleteCharacter({ character_id: 5, confirm: true });
        assert.deepStrictEqual(res.deleted, { id: 5, name: 'Test Person' });
        const del = db.calls.find(c => c.sql.includes('DELETE'));
        assert.deepStrictEqual(del.params, [5]);
    });
    it('skips optional tables that do not exist in this database', async () => {
        const db = fakeDb({ deleted: [{ id: 5 }], missingTables: ['tracker_changes', 'npe_scene_validation'] });
        const res = await new CharacterHandlers(db).handleDeleteCharacter({ character_id: 5, confirm: true });
        assert.deepStrictEqual(res.deleted, { id: 5 });
    });
    it('returns not_found for a missing id', async () => {
        const res = await new CharacterHandlers(fakeDb()).handleDeleteCharacter({ character_id: 99, confirm: true });
        assert.strictEqual(res.error, 'not_found');
    });
    it('errors when confirm is missing and touches nothing', async () => {
        const db = fakeDb();
        await assert.rejects(
            new CharacterHandlers(db).handleDeleteCharacter({ character_id: 5 }),
            /confirm must be true to delete/
        );
        assert.strictEqual(db.calls.length, 0);
    });
    it('schema requires character_id and confirm; list_characters keeps series_id filter', () => {
        const del = characterToolsSchema.find(t => t.name === 'delete_character');
        assert.deepStrictEqual(del.inputSchema.required, ['character_id', 'confirm']);
        assert.ok(characterToolsSchema.find(t => t.name === 'list_characters').inputSchema.properties.series_id);
    });
});
