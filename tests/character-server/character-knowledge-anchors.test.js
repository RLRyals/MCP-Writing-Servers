// tests/character-server/character-knowledge-anchors.test.js
// Bead mws-2gk: character_knowledge gains known-from anchors, fact/reveal links
// and a 'locked' level (Canon Over Time). Mocked db: asserts SQL/params and rules.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CharacterKnowledgeHandlers } from '../../src/mcps/character-server/handlers/character-knowledge-handlers.js';
import { characterKnowledgeToolsSchema } from '../../src/mcps/character-server/schemas/character-tools-schema.js';

const recordingDb = (rows) => {
    const calls = [];
    return { calls, async query(sql, params) { calls.push({ sql, params }); return { rows }; } };
};
const base = { character_id: 1, knowledge_category: 'secret', knowledge_item: 'item A is hidden in place B' };

describe('character_knowledge anchors (mws-2gk)', () => {
    it('schema exposes anchors and the locked level', () => {
        const byName = Object.fromEntries(characterKnowledgeToolsSchema.map(t => [t.name, t.inputSchema.properties]));
        for (const n of ['add_character_knowledge', 'update_character_knowledge']) {
            for (const f of ['known_from', 'known_scene_id', 'fact_id', 'reveal_id']) assert.ok(byName[n][f], `${n}.${f}`);
            assert.ok(byName[n].knowledge_level.enum.includes('locked'));
        }
    });

    it('add with a scene anchor, fact and locked level stores them', async () => {
        const db = recordingDb([{}]);
        const res = await new CharacterKnowledgeHandlers(db).handleAddCharacterKnowledge({
            ...base, knowledge_level: 'locked', known_from: 'scene', known_scene_id: 27, fact_id: 222, reveal_id: 4 });
        assert.deepStrictEqual(db.calls[0].params.slice(3), ['locked', null, null, 'scene', 27, 222, 4]);
        assert.match(res.content[0].text, /Known from: scene 27/);
    });

    it('add before_series / off_page', async () => {
        const db = recordingDb([{}]);
        const h = new CharacterKnowledgeHandlers(db);
        const a = await h.handleAddCharacterKnowledge({ ...base, known_from: 'before_series' });
        assert.match(a.content[0].text, /before the series/);
        const b = await h.handleAddCharacterKnowledge({ ...base, known_from: 'off_page', known_scene_id: 30 });
        assert.match(b.content[0].text, /off-page, known by scene 30/);
    });

    it('add rejects inconsistent anchors', async () => {
        const h = new CharacterKnowledgeHandlers(recordingDb([{}]));
        await assert.rejects(h.handleAddCharacterKnowledge({ ...base, known_from: 'scene' }), /requires known_scene_id/);
        await assert.rejects(h.handleAddCharacterKnowledge({ ...base, known_from: 'off_page' }), /requires known_scene_id/);
        await assert.rejects(h.handleAddCharacterKnowledge({ ...base, known_from: 'before_series', known_scene_id: 3 }), /must not have/);
        await assert.rejects(h.handleAddCharacterKnowledge({ ...base, known_from: 'nope' }), /known_from must be one of/);
        await assert.rejects(h.handleAddCharacterKnowledge({ ...base, known_scene_id: 3 }), /requires known_from/);
    });

    it('add without anchors stores NULLs (unchanged behaviour)', async () => {
        const db = recordingDb([{}]);
        await new CharacterKnowledgeHandlers(db).handleAddCharacterKnowledge(base);
        assert.deepStrictEqual(db.calls[0].params.slice(6), [null, null, null, null]);
    });

    it('update validates the merged anchor and sets the columns', async () => {
        const row = { id: 7, character_id: 1, knowledge_category: 'secret', knowledge_item: 'x',
            knowledge_level: 'knows', known_from: 'before_series', known_scene_id: null };
        const h = new CharacterKnowledgeHandlers(recordingDb([row]));
        // before_series -> scene without a scene id must fail
        await assert.rejects(h.handleUpdateCharacterKnowledge({ id: 7, known_from: 'scene' }), /requires known_scene_id/);
        const db = recordingDb([row]);
        await new CharacterKnowledgeHandlers(db).handleUpdateCharacterKnowledge({
            id: 7, known_from: 'scene', known_scene_id: 12, knowledge_level: 'locked' });
        const upd = db.calls.find(c => c.sql.startsWith('UPDATE character_knowledge'));
        assert.match(upd.sql, /known_from = \$\d+/);
        assert.match(upd.sql, /known_scene_id = \$\d+/);
        assert.ok(upd.params.includes('scene') && upd.params.includes(12) && upd.params.includes('locked'));
    });
});
