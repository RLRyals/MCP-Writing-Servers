// tests/character-server/character-planning-wrapper.test.js
// Covers bead mws-1783883496370-6-cf5bef5c acceptance criterion:
// "Tools visible through the character-planning phase wrapper."
//
// The character-planning-server config-mcp (port 3004) is a phase-scoped
// wrapper around the character-server handlers -- see
// src/config-mcps/character-planning-server/index.js. This checks that the
// new update_character_knowledge / delete_character_knowledge tools (and the
// already-registered arc tools) are exposed through that wrapper's
// buildTools()/getToolHandler(), not just on the raw character-server.

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { CharacterPlanningMCPServer } from '../../src/config-mcps/character-planning-server/index.js';

describe('character-planning-server wrapper tool visibility (mws-6)', () => {
    let server;

    after(async () => {
        if (server && server.db && server.db.pool) {
            await server.db.pool.end();
        }
    });

    it('exposes update_character_knowledge and delete_character_knowledge', () => {
        server = new CharacterPlanningMCPServer();
        const toolNames = server.tools.map(t => t.name);

        assert.ok(toolNames.includes('update_character_knowledge'), 'wrapper should expose update_character_knowledge');
        assert.ok(toolNames.includes('delete_character_knowledge'), 'wrapper should expose delete_character_knowledge');

        assert.strictEqual(typeof server.getToolHandler('update_character_knowledge'), 'function');
        assert.strictEqual(typeof server.getToolHandler('delete_character_knowledge'), 'function');
    });

    it('exposes the character-arc tools (create/update/delete/list)', () => {
        const toolNames = server.tools.map(t => t.name);

        assert.ok(toolNames.includes('create_character_arc'));
        assert.ok(toolNames.includes('update_character_arc'));
        assert.ok(toolNames.includes('delete_character_arc'));
        assert.ok(toolNames.includes('list_character_arcs'));

        assert.strictEqual(typeof server.getToolHandler('create_character_arc'), 'function');
        assert.strictEqual(typeof server.getToolHandler('update_character_arc'), 'function');
        assert.strictEqual(typeof server.getToolHandler('delete_character_arc'), 'function');
        assert.strictEqual(typeof server.getToolHandler('list_character_arcs'), 'function');
    });

    it('new schemas carry a usable inputSchema (id-based identification)', () => {
        const updateKnowledge = server.tools.find(t => t.name === 'update_character_knowledge');
        const deleteKnowledge = server.tools.find(t => t.name === 'delete_character_knowledge');

        assert.deepStrictEqual(updateKnowledge.inputSchema.required, ['id']);
        assert.deepStrictEqual(deleteKnowledge.inputSchema.required, ['id']);
        assert.ok('knowledge_level' in updateKnowledge.inputSchema.properties);
        assert.ok('knowledge_item' in updateKnowledge.inputSchema.properties);
        assert.ok('learned_context' in updateKnowledge.inputSchema.properties);
        assert.ok('learned_book_id' in updateKnowledge.inputSchema.properties);
    });
});
