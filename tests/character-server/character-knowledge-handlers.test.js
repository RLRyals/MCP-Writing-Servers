// tests/character-server/character-knowledge-handlers.test.js
// Covers bead mws-1783883496370-6-cf5bef5c acceptance criterion:
// "Knowledge-entry correction round-trip: add wrong entry -> update ->
//  check_character_knowledge reflects the fix; delete -> entry gone."
//
// Runs against a real Postgres instance (DATABASE_URL), matching the pattern
// used by tests/database-admin-server/batch-operations.test.js. In CI this is
// the ephemeral postgres service defined in .github/workflows/test.yml.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { CharacterMCPServer } from '../../src/mcps/character-server/index.js';

describe('Character Knowledge Handlers - update/delete (mws-6)', () => {
    let server;
    let authorId;
    let seriesId;
    let bookId;
    let characterId;

    before(async () => {
        server = new CharacterMCPServer();

        const authorResult = await server.db.query(
            `INSERT INTO authors (name) VALUES ($1) RETURNING id`,
            ['Test Author (mws-6 knowledge)']
        );
        authorId = authorResult.rows[0].id;

        const seriesResult = await server.db.query(
            `INSERT INTO series (author_id, title) VALUES ($1, $2) RETURNING id`,
            [authorId, 'Test Series (mws-6 knowledge)']
        );
        seriesId = seriesResult.rows[0].id;

        const bookResult = await server.db.query(
            `INSERT INTO books (series_id, title) VALUES ($1, $2) RETURNING id`,
            [seriesId, 'Test Book (mws-6 knowledge)']
        );
        bookId = bookResult.rows[0].id;

        const characterResult = await server.db.query(
            `INSERT INTO characters (series_id, name) VALUES ($1, $2) RETURNING id`,
            [seriesId, 'Test Character (mws-6 knowledge)']
        );
        characterId = characterResult.rows[0].id;
    });

    after(async () => {
        // Cascades clean up character_knowledge/characters/books/series rows
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

    it('registers update_character_knowledge and delete_character_knowledge tools', () => {
        const toolNames = server.tools.map(t => t.name);
        assert.ok(toolNames.includes('update_character_knowledge'), 'update_character_knowledge should be registered');
        assert.ok(toolNames.includes('delete_character_knowledge'), 'delete_character_knowledge should be registered');

        assert.strictEqual(typeof server.getToolHandler('update_character_knowledge'), 'function');
        assert.strictEqual(typeof server.getToolHandler('delete_character_knowledge'), 'function');
    });

    it('full round-trip: add wrong entry -> update -> check reflects fix -> delete -> gone', async () => {
        // 1. Add a deliberately wrong knowledge entry
        const addResult = await server.getToolHandler('add_character_knowledge')({
            character_id: characterId,
            knowledge_category: 'secret',
            knowledge_item: 'The killer is the butler',
            knowledge_level: 'knows',
            learned_context: 'Wrong - added by mistake'
        });
        assert.ok(addResult.content[0].text.includes('added successfully'));

        const lookup = await server.db.query(
            `SELECT id FROM character_knowledge WHERE character_id = $1 AND knowledge_item = $2`,
            [characterId, 'The killer is the butler']
        );
        assert.strictEqual(lookup.rows.length, 1, 'the wrong entry should exist exactly once');
        const knowledgeId = lookup.rows[0].id;

        // 2. Correct it via update_character_knowledge
        const updateResult = await server.getToolHandler('update_character_knowledge')({
            id: knowledgeId,
            knowledge_item: 'The killer is the gardener',
            knowledge_level: 'suspects',
            learned_context: 'Corrected after re-reading chapter 3'
        });
        assert.ok(updateResult.content[0].text.includes('updated successfully'));

        // 3. check_character_knowledge reflects the fix
        const checkResult = await server.getToolHandler('check_character_knowledge')({
            character_id: characterId
        });
        const checkText = checkResult.content[0].text;
        assert.ok(checkText.includes('The killer is the gardener'), 'corrected item should be visible');
        assert.ok(!checkText.includes('The killer is the butler'), 'wrong item should no longer be visible');
        assert.ok(checkText.includes('suspects'), 'corrected knowledge_level should be visible');

        // 4. Delete the entry
        const deleteResult = await server.getToolHandler('delete_character_knowledge')({ id: knowledgeId });
        assert.ok(deleteResult.content[0].text.includes('deleted successfully'));

        const postDelete = await server.db.query(
            `SELECT id FROM character_knowledge WHERE id = $1`,
            [knowledgeId]
        );
        assert.strictEqual(postDelete.rows.length, 0, 'entry should be gone after delete');
    });

    it('update_character_knowledge requires id and only changes provided fields', async () => {
        const addResult = await server.getToolHandler('add_character_knowledge')({
            character_id: characterId,
            knowledge_category: 'skill',
            knowledge_item: 'Fluent in Latin',
            knowledge_level: 'knows',
            learned_context: 'Established in prologue'
        });
        assert.ok(addResult.content[0].text.includes('added successfully'));

        const lookup = await server.db.query(
            `SELECT id, learned_context FROM character_knowledge WHERE character_id = $1 AND knowledge_item = $2`,
            [characterId, 'Fluent in Latin']
        );
        const knowledgeId = lookup.rows[0].id;
        const originalContext = lookup.rows[0].learned_context;

        // Only update knowledge_level; learned_context must be untouched
        await server.getToolHandler('update_character_knowledge')({
            id: knowledgeId,
            knowledge_level: 'forgot'
        });

        const after1 = await server.db.query(
            `SELECT knowledge_level, learned_context FROM character_knowledge WHERE id = $1`,
            [knowledgeId]
        );
        assert.strictEqual(after1.rows[0].knowledge_level, 'forgot');
        assert.strictEqual(after1.rows[0].learned_context, originalContext);

        // Missing id should throw
        await assert.rejects(
            () => server.getToolHandler('update_character_knowledge')({ knowledge_level: 'knows' }),
            /id is required/
        );

        // Cleanup
        await server.db.query('DELETE FROM character_knowledge WHERE id = $1', [knowledgeId]);
    });

    it('delete_character_knowledge requires id and reports a clear message when the entry is missing', async () => {
        await assert.rejects(
            () => server.getToolHandler('delete_character_knowledge')({}),
            /id is required/
        );

        const result = await server.getToolHandler('delete_character_knowledge')({ id: 999999999 });
        assert.ok(result.content[0].text.includes('No character knowledge entry found to delete'));
    });
});
