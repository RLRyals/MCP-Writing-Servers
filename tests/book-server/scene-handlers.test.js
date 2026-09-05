// tests/book-server/scene-handlers.test.js
// Regression test for bead mws-1af: get_scene must return the full scene
// body, not the old 1000-char truncated read. DB is fully mocked, matching
// the pattern used in tests/book-server/editing-notes-handlers.test.js.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SceneHandlers } from '../../src/mcps/book-server/handlers/scene-handlers.js';

class MockDatabase {
    constructor() {
        this.queryResults = new Map();
        this.queries = [];
    }

    setQueryResult(queryPattern, rows) {
        this.queryResults.set(queryPattern, { rows });
    }

    async query(text, params = []) {
        this.queries.push({ text, params });
        for (const [pattern, result] of this.queryResults.entries()) {
            if (text.includes(pattern)) {
                return typeof result === 'function' ? result(params) : result;
            }
        }
        return { rows: [] };
    }
}

describe('SceneHandlers.handleGetScene', () => {
    it('returns scene_content in full, uncut at 1000 characters', async () => {
        const longContent = 'a'.repeat(2500);
        const mockDb = new MockDatabase();
        mockDb.setQueryResult('FROM chapter_scenes s', [{
            id: 42,
            chapter_id: 7,
            chapter_number: 3,
            chapter_title: 'The Turn',
            book_title: 'Arcane Protocol',
            pov_character_name: null,
            scene_number: 1,
            scene_title: 'Opening',
            scene_content: longContent,
            scene_participants: [],
            scene_elements: [],
            scene_revisions: [],
            word_count: 400
        }]);

        const handlers = new SceneHandlers(mockDb);
        const result = await handlers.handleGetScene({ scene_id: 42 });

        assert.strictEqual(result.scene.scene_content, longContent);
        assert.strictEqual(result.scene.scene_content.length, 2500);
        assert.strictEqual(result.scene.content_length, 2500);
        assert.strictEqual('content_truncated' in result.scene, false);
    });

    it('ignores a caller-supplied full_content flag (no-op, always full)', async () => {
        const longContent = 'b'.repeat(5000);
        const mockDb = new MockDatabase();
        mockDb.setQueryResult('FROM chapter_scenes s', [{
            id: 43,
            chapter_id: 7,
            chapter_number: 3,
            chapter_title: 'The Turn',
            book_title: 'Arcane Protocol',
            pov_character_name: null,
            scene_number: 2,
            scene_title: 'Middle',
            scene_content: longContent,
            scene_participants: [],
            scene_elements: [],
            scene_revisions: [],
            word_count: 800
        }]);

        const handlers = new SceneHandlers(mockDb);
        const result = await handlers.handleGetScene({ scene_id: 43, full_content: false });

        assert.strictEqual(result.scene.scene_content.length, 5000);
    });

    it('returns null scene_content untouched when the scene has no prose yet', async () => {
        const mockDb = new MockDatabase();
        mockDb.setQueryResult('FROM chapter_scenes s', [{
            id: 44,
            chapter_id: 7,
            chapter_number: 3,
            chapter_title: 'The Turn',
            book_title: 'Arcane Protocol',
            pov_character_name: null,
            scene_number: 3,
            scene_title: 'Planned',
            scene_content: null,
            scene_participants: [],
            scene_elements: [],
            scene_revisions: [],
            word_count: 0
        }]);

        const handlers = new SceneHandlers(mockDb);
        const result = await handlers.handleGetScene({ scene_id: 44 });

        assert.strictEqual(result.scene.scene_content, null);
        assert.strictEqual(result.scene.content_length, 0);
    });
});
