// Tests for bead mws-e25: knowledge ids in check output, get_character(+_details) served on the
// character-planning server, delete_character_knowledge by key, delete_character with_dependents.
// DB is a fake; no live database is touched.
import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { CharacterHandlers } from '../../src/mcps/character-server/handlers/character-handlers.js';
import { CharacterKnowledgeHandlers } from '../../src/mcps/character-server/handlers/character-knowledge-handlers.js';
import { CharacterDetailHandlers } from '../../src/mcps/character-server/handlers/character-detail-handlers.js';
import { characterToolsSchema } from '../../src/mcps/character-server/schemas/character-tools-schema.js';
import { CharacterPlanningMCPServer } from '../../src/config-mcps/character-planning-server/index.js';

function fakeDb({ counts = {}, knowledge = [], details = [], character = { id: 5, name: 'Test', series_title: 'S', character_type: 'main', status: 'alive', aliases: [] } } = {}) {
    const calls = [];
    return {
        calls,
        async query(sql, params) {
            calls.push({ sql, params });
            if (sql.includes('DELETE FROM characters')) return { rows: [{ id: params[0], name: 'Test' }] };
            if (sql.includes('DELETE FROM')) return { rows: [] };
            if (sql.includes('COUNT(*)')) {
                const m = sql.match(/FROM (\w+) WHERE/);
                return { rows: [{ count: counts[m[1]] || 0 }] };
            }
            if (sql.includes('FROM characters c') && sql.includes('series s')) return { rows: [character] };
            if (sql.includes('FROM character_details')) return { rows: details };
            if (sql.includes('FROM character_knowledge')) {
                if (sql.includes('knowledge_category = $2')) {
                    return { rows: knowledge.filter(k => k.knowledge_category === params[1] && k.knowledge_item === params[2]) };
                }
                if (sql.includes('ck.id = $1')) return { rows: knowledge.filter(k => k.id === params[0]) };
                return { rows: knowledge };
            }
            return { rows: [] };
        }
    };
}
const deletes = db => db.calls.filter(c => c.sql.includes('DELETE'));
const K = (id, item = 'secret') => ({ id, character_id: 5, character_name: 'Test', knowledge_category: 'plot', knowledge_item: item, knowledge_level: 'knows' });

describe('check_character_knowledge prints row ids', () => {
    it('puts id: <row id> first in every entry', async () => {
        const db = fakeDb({ knowledge: [K(11, 'a'), K(12, 'b')] });
        const res = await new CharacterKnowledgeHandlers(db).handleCheckCharacterKnowledge({ character_id: 5 });
        const text = res.content[0].text;
        assert.match(text, /id: 11\nplot: a\n  Level: knows/);
        assert.match(text, /id: 12\nplot: b\n/);
    });
});

describe('get_character / get_character_details served by character-planning-server', () => {
    let server;
    after(async () => { if (server?.db?.pool) await server.db.pool.end(); });

    it('lists both tools and routes handlers', () => {
        server = new CharacterPlanningMCPServer();
        const names = server.tools.map(t => t.name);
        assert.ok(names.includes('get_character'));
        assert.ok(names.includes('get_character_details'));
        assert.strictEqual(typeof server.getToolHandler('get_character'), 'function');
        assert.strictEqual(typeof server.getToolHandler('get_character_details'), 'function');
    });
    it('get_character returns detail rows and knowledge rows with ids', async () => {
        const db = fakeDb({
            details: [{ id: 7, category: 'physical', attribute: 'hair', value: 'red' }],
            knowledge: [{ id: 11, knowledge_category: 'plot', knowledge_item: 'secret', knowledge_level: 'knows' }]
        });
        const res = await new CharacterHandlers(db).handleGetCharacter({ character_id: 5 });
        const text = res.content[0].text;
        assert.match(text, /id: 7 \| physical\/hair: red/);
        assert.match(text, /id: 11 \| plot: secret \(knows\)/);
    });
    it('get_character_details prints each row id', async () => {
        const db = fakeDb({ details: [{ id: 7, category: 'physical', attribute: 'hair', value: 'red', character_name: 'Test', confidence_level: 'established' }] });
        const res = await new CharacterDetailHandlers(db).handleGetCharacterDetails({ character_id: 5 });
        assert.match(res.content[0].text, /id: 7\nphysical\/hair: red/);
    });
});

describe('delete_character_knowledge by character_id + category + item', () => {
    it('deletes the single matching row', async () => {
        const db = fakeDb({ knowledge: [K(11)] });
        const res = await new CharacterKnowledgeHandlers(db).handleDeleteCharacterKnowledge({ character_id: 5, knowledge_category: 'plot', knowledge_item: 'secret' });
        assert.match(res.content[0].text, /deleted successfully/);
        assert.deepStrictEqual(deletes(db)[0].params, [11]);
    });
    it('refuses with a clear message when several rows match, deleting nothing', async () => {
        const db = fakeDb({ knowledge: [K(11), K(12)] });
        await assert.rejects(
            new CharacterKnowledgeHandlers(db).handleDeleteCharacterKnowledge({ character_id: 5, knowledge_category: 'plot', knowledge_item: 'secret' }),
            /2 knowledge entries match.*ids: 11, 12/
        );
        assert.strictEqual(deletes(db).length, 0);
    });
    it('reports no match when zero rows match, deleting nothing', async () => {
        const db = fakeDb();
        const res = await new CharacterKnowledgeHandlers(db).handleDeleteCharacterKnowledge({ character_id: 5, knowledge_category: 'plot', knowledge_item: 'nope' });
        assert.match(res.content[0].text, /No character knowledge entry found for character 5/);
        assert.strictEqual(deletes(db).length, 0);
    });
    it('still accepts id, and errors when no identifier is given', async () => {
        const db = fakeDb({ knowledge: [K(11)] });
        const h = new CharacterKnowledgeHandlers(db);
        await h.handleDeleteCharacterKnowledge({ id: 11 });
        assert.deepStrictEqual(deletes(db)[0].params, [11]);
        await assert.rejects(h.handleDeleteCharacterKnowledge({}), /identify the entry by id/);
    });
});

describe('delete_character with_dependents', () => {
    it('removes owned details + knowledge first, then the character, and reports counts', async () => {
        const db = fakeDb({ counts: { character_details: 1, character_knowledge: 1 } });
        const res = await new CharacterHandlers(db).handleDeleteCharacter({ character_id: 5, confirm: true, with_dependents: ['character_details', 'character_knowledge'] });
        assert.deepStrictEqual(res.removed_dependents, { character_details: 1, character_knowledge: 1 });
        assert.strictEqual(res.deleted.id, 5);
        const sqls = deletes(db).map(c => c.sql);
        assert.match(sqls[0], /DELETE FROM character_details/);
        assert.match(sqls[1], /DELETE FROM character_knowledge/);
        assert.match(sqls[2], /DELETE FROM characters/);
    });
    it('still refuses (deleting nothing) when a non-opted dependent exists', async () => {
        const db = fakeDb({ counts: { character_details: 1, character_arcs: 1, outline_scene_events: 2 } });
        const res = await new CharacterHandlers(db).handleDeleteCharacter({ character_id: 5, confirm: true, with_dependents: ['character_details'] });
        assert.strictEqual(res.error, 'has_dependents');
        assert.match(res.message, /character arcs \(1\)/);
        assert.doesNotMatch(res.message, /character details/);
        assert.strictEqual(deletes(db).length, 0);
    });
    it('rejects any with_dependents value other than the two owned tables', async () => {
        const db = fakeDb();
        await assert.rejects(
            new CharacterHandlers(db).handleDeleteCharacter({ character_id: 5, confirm: true, with_dependents: ['character_arcs'] }),
            /with_dependents may only contain/
        );
        assert.strictEqual(db.calls.length, 0);
    });
    it('without with_dependents behaves as before', async () => {
        const db = fakeDb({ counts: { character_details: 1 } });
        const res = await new CharacterHandlers(db).handleDeleteCharacter({ character_id: 5, confirm: true });
        assert.strictEqual(res.error, 'has_dependents');
        assert.strictEqual(deletes(db).length, 0);
    });
    it('schema exposes with_dependents restricted to the two tables', () => {
        const del = characterToolsSchema.find(t => t.name === 'delete_character');
        assert.deepStrictEqual(del.inputSchema.properties.with_dependents.items.enum, ['character_details', 'character_knowledge']);
        assert.deepStrictEqual(del.inputSchema.required, ['character_id', 'confirm']);
    });
});
