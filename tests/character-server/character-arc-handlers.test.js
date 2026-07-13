// tests/character-server/character-arc-handlers.test.js
// Covers bead mws-1783883496370-6-cf5bef5c acceptance criterion:
// "Character-arc round-trip: create arc for a character/book, retrieve it,
//  update ending_state."
//
// The audit for this bead found create_character_arc / update_character_arc /
// list_character_arcs (the "get_character_arcs" retrieval tool) already wired
// into src/mcps/character-server/index.js's getTools()/getToolHandler() (see
// commit 0be5523, "feat(character-planning): add update/delete/list tools for
// character arcs"). This test verifies that wiring end to end against a real
// database rather than re-deriving the diagnosis.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { CharacterMCPServer } from '../../src/mcps/character-server/index.js';

describe('Character Arc Handlers round-trip (mws-6)', () => {
    let server;
    let authorId;
    let seriesId;
    let bookId;
    let characterId;

    before(async () => {
        server = new CharacterMCPServer();

        const authorResult = await server.db.query(
            `INSERT INTO authors (name) VALUES ($1) RETURNING id`,
            ['Test Author (mws-6 arc)']
        );
        authorId = authorResult.rows[0].id;

        const seriesResult = await server.db.query(
            `INSERT INTO series (author_id, title) VALUES ($1, $2) RETURNING id`,
            [authorId, 'Test Series (mws-6 arc)']
        );
        seriesId = seriesResult.rows[0].id;

        const bookResult = await server.db.query(
            `INSERT INTO books (series_id, title) VALUES ($1, $2) RETURNING id`,
            [seriesId, 'Test Book (mws-6 arc)']
        );
        bookId = bookResult.rows[0].id;

        const characterResult = await server.db.query(
            `INSERT INTO characters (series_id, name) VALUES ($1, $2) RETURNING id`,
            [seriesId, 'Test Character (mws-6 arc)']
        );
        characterId = characterResult.rows[0].id;
    });

    after(async () => {
        if (seriesId) {
            await server.db.query('DELETE FROM series WHERE id = $1', [seriesId]);
        }
        if (authorId) {
            await server.db.query('DELETE FROM authors WHERE id = $1', [authorId]);
        }
        if (server.db && server.db.pool) {
            await server.db.pool.end();
        }
    });

    it('registers create_character_arc, update_character_arc, and list_character_arcs (arc retrieval)', () => {
        const toolNames = server.tools.map(t => t.name);
        assert.ok(toolNames.includes('create_character_arc'));
        assert.ok(toolNames.includes('update_character_arc'));
        assert.ok(toolNames.includes('list_character_arcs'));
        assert.ok(toolNames.includes('delete_character_arc'));

        assert.strictEqual(typeof server.getToolHandler('create_character_arc'), 'function');
        assert.strictEqual(typeof server.getToolHandler('update_character_arc'), 'function');
        assert.strictEqual(typeof server.getToolHandler('list_character_arcs'), 'function');
        assert.strictEqual(typeof server.getToolHandler('delete_character_arc'), 'function');
    });

    it('full round-trip: create arc -> retrieve it -> update ending_state', async () => {
        // 1. Create
        const createResult = await server.getToolHandler('create_character_arc')({
            character_id: characterId,
            book_id: bookId,
            arc_name: 'From cynic to believer',
            arc_description: 'Starts distrustful of everyone, learns to rely on the team.',
            start_state: 'Isolated and suspicious',
            end_state: 'Still guarded, but trusts the team'
        });
        assert.ok(createResult.content[0].text.includes('Created character arc'));

        // 2. Retrieve via list_character_arcs (the arc-retrieval tool)
        const listResult = await server.getToolHandler('list_character_arcs')({
            character_id: characterId,
            book_id: bookId
        });
        const listText = listResult.content[0].text;
        assert.ok(listText.includes('From cynic to believer'));
        assert.ok(listText.includes('Isolated and suspicious'));
        assert.ok(listText.includes('Still guarded, but trusts the team'));

        const arcRow = await server.db.query(
            `SELECT id FROM character_arcs WHERE character_id = $1 AND book_id = $2`,
            [characterId, bookId]
        );
        assert.strictEqual(arcRow.rows.length, 1);
        const arcId = arcRow.rows[0].id;

        // 3. Update ending_state
        const updateResult = await server.getToolHandler('update_character_arc')({
            id: arcId,
            end_state: 'Fully trusts the team and leads by example'
        });
        assert.ok(updateResult.content[0].text.includes('updated successfully'));
        assert.ok(updateResult.content[0].text.includes('Fully trusts the team and leads by example'));

        const afterUpdate = await server.db.query(
            `SELECT ending_state, starting_state FROM character_arcs WHERE id = $1`,
            [arcId]
        );
        assert.strictEqual(afterUpdate.rows[0].ending_state, 'Fully trusts the team and leads by example');
        // start_state should be untouched by the partial update
        assert.strictEqual(afterUpdate.rows[0].starting_state, 'Isolated and suspicious');

        // Cleanup this arc explicitly (also covers delete_character_arc)
        const deleteResult = await server.getToolHandler('delete_character_arc')({ id: arcId });
        assert.ok(deleteResult.content[0].text.includes('deleted successfully'));
    });
});
