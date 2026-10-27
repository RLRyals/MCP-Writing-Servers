// tests/outline-server/canon-scene-pointers.test.js
// Bead mws-ntf: scene_events point at reveal/knowledge/detail rows and start/end a truth;
// plot_threads parent promises. Mocked db: asserts SQL/params and tool schemas.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SceneEventsHandlers } from '../../src/mcps/outline-server/handlers/scene-events-handlers.js';
import { PromisesHandlers } from '../../src/mcps/outline-server/handlers/promises-handlers.js';
import { sceneEventsToolsSchema, promisesToolsSchema } from '../../src/mcps/outline-server/schemas/outline-tools-schema.js';
import { characterTimelineToolsSchema } from '../../src/mcps/character-server/schemas/character-tools-schema.js';

const recordingDb = (rows) => {
    const calls = [];
    const client = { async query(sql, params) { calls.push({ sql, params }); return { rows }; } };
    return {
        calls,
        async query(sql, params) { calls.push({ sql, params }); return { rows }; },
        async transaction(fn) { return fn(client); }
    };
};

describe('scene_events canon pointers (mws-ntf)', () => {
    it('schema exposes pointers and new event types', () => {
        const rec = sceneEventsToolsSchema.find(t => t.name === 'record_scene_events');
        const item = rec.inputSchema.properties.events.items.properties;
        assert.ok(item.reveal_id && item.knowledge_id && item.detail_id);
        for (const t of ['reveals', 'learns', 'starts_truth', 'ends_truth']) {
            assert.ok(item.event_type.enum.includes(t), t);
        }
    });

    it('stores pointers on insert', async () => {
        const db = recordingDb([{ id: 1, work_type: 'scene' }]);
        await new SceneEventsHandlers(db).handleRecordSceneEvents({
            work_id: 5,
            events: [
                { event_type: 'reveals', reveal_id: 9 },
                { event_type: 'ends_truth', detail_id: 3 }
            ]
        });
        const inserts = db.calls.filter(c => /INSERT INTO outline_scene_events/.test(c.sql));
        assert.strictEqual(inserts.length, 2);
        assert.deepStrictEqual(inserts[0].params.slice(11), [9, null, null]);
        assert.deepStrictEqual(inserts[1].params.slice(11), [null, null, 3]);
    });

    it('rejects a pointer event with no pointer', async () => {
        const db = recordingDb([{ id: 1 }]);
        const h = new SceneEventsHandlers(db);
        await assert.rejects(h.handleRecordSceneEvents({ work_id: 5, events: [{ event_type: 'reveals' }] }), /needs one of: reveal_id/);
        await assert.rejects(h.handleRecordSceneEvents({ work_id: 5, events: [{ event_type: 'starts_truth' }] }), /fact_id, detail_id, knowledge_id/);
    });
});

describe('plot thread parents promises (mws-ntf)', () => {
    it('schema exposes plot_thread_id on create/update/list', () => {
        const by = Object.fromEntries(promisesToolsSchema.map(t => [t.name, t.inputSchema.properties]));
        assert.ok(by.create_promise.plot_thread_id);
        assert.ok(by.update_promise.plot_thread_id);
        assert.ok(by.list_promises.plot_thread_id);
    });

    it('create stores plot_thread_id', async () => {
        const db = recordingDb([{ id: 1, label: 'x', status: 'open' }]);
        await new PromisesHandlers(db).handleCreatePromise({ label: 'x', plot_thread_id: 12 });
        assert.strictEqual(db.calls[0].params[8], 12);
    });

    it('update can re-parent and list can filter', async () => {
        const db = recordingDb([{ id: 1, status: 'open' }]);
        const h = new PromisesHandlers(db);
        await h.handleUpdatePromise({ promise_id: 1, plot_thread_id: 12 });
        assert.match(db.calls[0].sql, /plot_thread_id = \$1/);
        await h.handleListPromises({ plot_thread_id: 12 });
        assert.match(db.calls[1].sql, /p\.plot_thread_id = \$1/);
    });
});

describe('character_presence knowledge fields retired (mws-ntf)', () => {
    it('track_character_presence no longer takes learns/reveals', () => {
        const props = characterTimelineToolsSchema.find(t => t.name === 'track_character_presence').inputSchema.properties;
        assert.ok(!props.learns_this_chapter && !props.reveals_this_chapter);
    });
});
