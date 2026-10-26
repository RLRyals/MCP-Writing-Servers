// tests/character-server/character-detail-span.test.js
// Bead mws-4g8: character_details gain start/end outline-scene refs (Canon Over Time).
// Mocked db: asserts the SQL/params carry the span and the tool schema exposes it.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CharacterDetailHandlers } from '../../src/mcps/character-server/handlers/character-detail-handlers.js';
import { characterDetailToolsSchema } from '../../src/mcps/character-server/schemas/character-tools-schema.js';

const recordingDb = (rows) => {
    const calls = [];
    return { calls, async query(sql, params) { calls.push({ sql, params }); return { rows }; } };
};

describe('character_details scene span (mws-4g8)', () => {
    it('schema exposes span fields on add/update/delete', () => {
        const byName = Object.fromEntries(characterDetailToolsSchema.map(t => [t.name, t.inputSchema.properties]));
        assert.ok(byName.add_character_detail.start_scene_id && byName.add_character_detail.end_scene_id);
        assert.ok(byName.update_character_detail.start_scene_id);
        assert.ok(byName.update_character_detail.new_start_scene_id);
        assert.ok(byName.update_character_detail.end_scene_id);
        assert.ok(byName.delete_character_detail.start_scene_id);
    });

    it('add with no points stores NULLs (always true)', async () => {
        const db = recordingDb([{}]);
        const res = await new CharacterDetailHandlers(db).handleAddCharacterDetail({
            character_id: 1, category: 'background', attribute: 'rank', value: 'rookie' });
        assert.deepStrictEqual(db.calls[0].params.slice(6), [null, null]);
        assert.match(res.content[0].text, /True: always/);
    });

    it('add with start/end stores them and upserts on the span key', async () => {
        const db = recordingDb([{}]);
        const res = await new CharacterDetailHandlers(db).handleAddCharacterDetail({
            character_id: 1, category: 'background', attribute: 'rank', value: 'rookie',
            start_scene_id: 27, end_scene_id: 37 });
        assert.deepStrictEqual(db.calls[0].params.slice(6), [27, 37]);
        assert.match(db.calls[0].sql, /ON CONFLICT \(character_id, category, attribute, \(COALESCE\(start_scene_id, 0\)\)\)/);
        assert.match(res.content[0].text, /from scene 27 until scene 37/);
    });

    it('get shows the span with scene titles', async () => {
        const db = recordingDb([{ category: 'background', attribute: 'rank', value: 'rookie', character_name: 'Mal',
            confidence_level: 'established', start_scene_id: 27, end_scene_id: null,
            start_scene_title: 'The First Call', end_scene_title: null }]);
        const res = await new CharacterDetailHandlers(db).handleGetCharacterDetails({ character_id: 1 });
        assert.match(res.content[0].text, /True: from scene 27 \(The First Call\) onward/);
    });

    it('update can end a span and targets the row by start scene', async () => {
        const db = recordingDb([{ start_scene_id: 27, end_scene_id: 37, value: 'rookie', confidence_level: 'established' }]);
        await new CharacterDetailHandlers(db).handleUpdateCharacterDetail({
            character_id: 1, category: 'background', attribute: 'rank', value: 'rookie',
            start_scene_id: 27, end_scene_id: 37 });
        const upd = db.calls[1];
        assert.match(upd.sql, /end_scene_id = \$/);
        assert.strictEqual(upd.params[3], 27);
        assert.ok(upd.params.includes(37));
    });

    it('delete targets the row by start scene', async () => {
        const db = recordingDb([{ character_name: 'Mal', value: 'rookie' }]);
        await new CharacterDetailHandlers(db).handleDeleteCharacterDetail({
            character_id: 1, category: 'background', attribute: 'rank', start_scene_id: 27 });
        assert.strictEqual(db.calls[0].params[3], 27);
        assert.strictEqual(db.calls[1].params[3], 27);
    });
});
