// Regression test for bead mws-8uw: npe-character-server and npe-scene-server
// write tools took a bare GLOBAL scene_id, so a guessed id wrote into another
// book (The Mist). They must now require book_id and verify scene ownership.
// DB is fully mocked (same pattern as npe-analysis-handlers.test.js).

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NPEDecisionHandlers } from '../../src/mcps/npe-character-server/handlers/npe-decision-handlers.js';
import { NPESceneHandlers } from '../../src/mcps/npe-scene-server/handlers/npe-scene-handlers.js';

class MockDatabase {
    constructor() {
        this.results = [];
        this.queries = [];
    }
    on(pattern, rows) {
        this.results.push([pattern, rows]);
    }
    async query(text, params = []) {
        this.queries.push({ text, params });
        for (const [pattern, rows] of this.results) {
            if (text.includes(pattern)) return { rows };
        }
        return { rows: [] };
    }
    inserted(table) {
        return this.queries.filter(q => q.text.includes(`INSERT INTO ${table}`));
    }
}

const sceneRow = { id: 900, scene_number: 2, chapter_id: 50, chapter_title: 'Ch', book_id: 7, book_title: 'B' };

const decisionArgs = {
    character_id: 1,
    book_id: 7,
    decision_description: 'x',
    character_version: 'V1',
    alternatives: ['a', 'b'],
    aligned_with_goals: true,
    aligned_with_fears: false,
    aligned_with_wounds: false,
    operating_on_incomplete_info: true
};

function characterDb() {
    const db = new MockDatabase();
    db.on('FROM characters', [{ id: 1, name: 'C' }]);
    db.on('FROM books', [{ id: 7, title: 'B' }]);
    db.on('INSERT INTO npe_character_decisions', [{ id: 'd1', alternatives: '[]' }]);
    return db;
}

describe('NPEDecisionHandlers scene ownership', () => {
    it('rejects log_character_decision with no book_id', async () => {
        const h = new NPEDecisionHandlers(characterDb());
        const { book_id, ...args } = decisionArgs;
        await assert.rejects(() => h.handleLogCharacterDecision({ ...args, scene_id: 900 }), /book_id is required/);
    });

    it('rejects a scene_id that belongs to another book and writes nothing', async () => {
        const db = characterDb();
        db.on('WHERE cs.id = $1', [{ ...sceneRow, book_id: 99 }]);
        const h = new NPEDecisionHandlers(db);
        await assert.rejects(() => h.handleLogCharacterDecision({ ...decisionArgs, scene_id: 900 }), /belongs to book_id 99/);
        assert.strictEqual(db.inserted('npe_character_decisions').length, 0);
    });

    it('rejects when neither scene_id nor chapter_number + scene_number is given', async () => {
        const h = new NPEDecisionHandlers(characterDb());
        await assert.rejects(() => h.handleLogCharacterDecision(decisionArgs), /Either scene_id, or chapter_number \+ scene_number/);
    });

    it('logs against the resolved scene when addressed by chapter_number + scene_number', async () => {
        const db = characterDb();
        db.on('c.book_id = $1 AND c.chapter_number = $2', [sceneRow]);
        const h = new NPEDecisionHandlers(db);
        await h.handleLogCharacterDecision({ ...decisionArgs, chapter_number: 3, scene_number: 2 });
        const ins = db.inserted('npe_character_decisions')[0];
        assert.strictEqual(ins.params[3], 50); // chapter_id
        assert.strictEqual(ins.params[4], 900); // scene_id
    });

    it('get_character_decisions_in_scene filters by book_id', async () => {
        const db = new MockDatabase();
        db.on('WHERE cs.id = $1', [sceneRow]);
        const h = new NPEDecisionHandlers(db);
        await h.handleGetCharacterDecisionsInScene({ book_id: 7, scene_id: 900 });
        const q = db.queries.find(x => x.text.includes('FROM npe_character_decisions'));
        assert.deepStrictEqual(q.params, [900, 7]);
        await assert.rejects(() => h.handleGetCharacterDecisionsInScene({ scene_id: 900 }), /book_id is required/);
    });
});

describe('NPESceneHandlers scene ownership', () => {
    const archArgs = { has_intention: true, has_obstacle: true, has_pivot: true, has_consequence: true };

    it('validate_scene_architecture rejects a scene from another book and writes nothing', async () => {
        const db = new MockDatabase();
        db.on('WHERE cs.id = $1', [{ ...sceneRow, book_id: 99 }]);
        const h = new NPESceneHandlers(db);
        await assert.rejects(
            () => h.handleValidateSceneArchitecture({ ...archArgs, book_id: 7, scene_id: 900 }),
            /belongs to book_id 99/
        );
        assert.strictEqual(db.inserted('npe_scene_validation').length, 0);
    });

    it('validate_scene_architecture rejects missing book_id', async () => {
        const h = new NPESceneHandlers(new MockDatabase());
        await assert.rejects(() => h.handleValidateSceneArchitecture({ ...archArgs, scene_id: 900 }), /book_id is required/);
    });

    it('validate_scene_architecture writes the resolved scene ids', async () => {
        const db = new MockDatabase();
        db.on('c.book_id = $1 AND c.chapter_number = $2', [sceneRow]);
        db.on('INSERT INTO npe_scene_validation', [{ id: 'v1' }]);
        const h = new NPESceneHandlers(db);
        await h.handleValidateSceneArchitecture({ ...archArgs, book_id: 7, chapter_number: 3, scene_number: 2 });
        const ins = db.inserted('npe_scene_validation')[0];
        assert.deepStrictEqual(ins.params.slice(1, 4), [900, 7, 50]);
    });

    it('validate_dialogue_physics and get_scene_npe_compliance reject missing book_id', async () => {
        const h = new NPESceneHandlers(new MockDatabase());
        await assert.rejects(() => h.handleValidateDialoguePhysics({ scene_id: 900, dialogue_lines: [] }), /book_id is required/);
        await assert.rejects(() => h.handleGetSceneNPECompliance({ scene_id: 900 }), /book_id is required/);
    });
});
