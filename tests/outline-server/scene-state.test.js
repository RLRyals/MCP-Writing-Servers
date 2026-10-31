// tests/outline-server/scene-state.test.js
// Bead mws-wm4: per-scene state note on approval, fed to the next scene's brief.
// Mocked db: asserts SQL/params and rendering.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SceneStateHandlers } from '../../src/mcps/outline-server/handlers/scene-state-handlers.js';
import { BriefHandlers } from '../../src/mcps/outline-server/handlers/brief-handlers.js';
import { sceneStateToolsSchema } from '../../src/mcps/outline-server/schemas/outline-tools-schema.js';

const mockDb = (respond) => {
    const calls = [];
    const q = async (sql, params) => { calls.push({ sql, params }); return { rows: respond(sql, params) }; };
    return { calls, query: q, async transaction(fn) { return fn({ query: q }); } };
};

describe('scene state notes (mws-wm4)', () => {
    it('schema exposes record_scene_state and get_scene_state', () => {
        const names = sceneStateToolsSchema.map(t => t.name);
        assert.deepStrictEqual(names, ['record_scene_state', 'get_scene_state']);
        const props = sceneStateToolsSchema[0].inputSchema.properties;
        for (const f of ['knowledge_changes', 'stops_being_true', 'decisions', 'alternatives_turned_down',
            'emotion_carried_forward', 'open_pressures', 'knowledge']) assert.ok(props[f], f);
    });

    it('upserts only the sent fields and anchors knowledge rows to the scene', async () => {
        const db = mockDb((sql) => sql.includes('FROM outline_works') ? [{ id: 5, work_type: 'scene' }]
            : sql.startsWith('INSERT INTO outline_scene_state_notes') ? [{ work_id: 5, decisions: 'Mal keeps quiet', open_pressures: 'Oz is watching' }] : []);
        const res = await new SceneStateHandlers(db).handleRecordSceneState({
            work_id: 5, decisions: 'Mal keeps quiet', open_pressures: 'Oz is watching',
            knowledge: [{ character_id: 2, knowledge_item: 'the door was unlocked', fact_id: 9 }]
        });
        const up = db.calls.find(c => c.sql.startsWith('INSERT INTO outline_scene_state_notes'));
        assert.match(up.sql, /\(work_id, decisions, open_pressures\)/);
        assert.match(up.sql, /ON CONFLICT \(work_id\) DO UPDATE/);
        assert.doesNotMatch(up.sql, /stops_being_true/);
        assert.deepStrictEqual(up.params, [5, 'Mal keeps quiet', 'Oz is watching']);
        const ck = db.calls.find(c => c.sql.startsWith('INSERT INTO character_knowledge'));
        assert.match(ck.sql, /'scene'/);
        assert.deepStrictEqual(ck.params, [2, 'uncategorized', 'the door was unlocked', 'knows', null, 5, 9, null]);
        assert.match(res.content[0].text, /Decisions:\*\* Mal keeps quiet/);
    });

    it('rejects non-scenes, missing works, empty calls and bad levels', async () => {
        const h = (type) => new SceneStateHandlers(mockDb(() => type ? [{ id: 1, work_type: type }] : []));
        await assert.rejects(h(null).handleRecordSceneState({ work_id: 1, decisions: 'x' }), /not found/);
        await assert.rejects(h('chapter').handleRecordSceneState({ work_id: 1, decisions: 'x' }), /belong on scenes/);
        await assert.rejects(h('scene').handleRecordSceneState({ work_id: 1 }), /Nothing to record/);
        await assert.rejects(h('scene').handleRecordSceneState({ work_id: 1,
            knowledge: [{ character_id: 1, knowledge_item: 'x', knowledge_level: 'bogus' }] }), /Invalid knowledge_level/);
    });

    it('get_scene_state renders the note or says none', async () => {
        const some = new SceneStateHandlers(mockDb(() => [{ work_id: 5, emotion_carried_forward: 'dread' }]));
        assert.match((await some.handleGetSceneState({ work_id: 5 })).content[0].text, /Emotion carried forward:\*\* dread/);
        const none = new SceneStateHandlers(mockDb(() => []));
        assert.match((await none.handleGetSceneState({ work_id: 5 })).content[0].text, /No state note/);
    });

    it('get_scene_brief carries the previous scene note', async () => {
        const db = mockDb((sql) => {
            if (sql.includes('FROM outline_scene_state_notes')) {
                return [{ work_id: 4, scene_title: 'The Alley', decisions: 'run', alternatives_turned_down: 'fight' }];
            }
            if (sql.startsWith('SELECT * FROM outline_works')) {
                return [{ id: 5, work_type: 'scene', title: 'Next', status: 'planned' }];
            }
            return [];
        });
        const text = (await new BriefHandlers(db).handleGetSceneBrief({ work_id: 5 })).content[0].text;
        assert.match(text, /State carried from the previous scene — \[scene#4\] The Alley/);
        assert.match(text, /Alternatives turned down:\*\* fight/);
        assert.ok(text.indexOf('State carried') < text.indexOf('Open promises connected'));
    });

    it('get_scene_brief omits the section when no earlier note exists', async () => {
        const db = mockDb((sql) => sql.startsWith('SELECT * FROM outline_works')
            ? [{ id: 5, work_type: 'scene', title: 'First', status: 'planned' }] : []);
        const text = (await new BriefHandlers(db).handleGetSceneBrief({ work_id: 5 })).content[0].text;
        assert.doesNotMatch(text, /State carried/);
    });
});
