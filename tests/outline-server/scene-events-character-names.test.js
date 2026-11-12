// Bead mws-wqy: record_scene_events accepts character names.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SceneEventsHandlers } from '../../src/mcps/outline-server/handlers/scene-events-handlers.js';

const mk = (chars) => {
    const calls = [];
    const client = { async query(sql, params) { calls.push({ sql, params }); return { rows: [{ id: 1 }] }; } };
    return {
        calls,
        async query(sql, params) {
            calls.push({ sql, params });
            if (/FROM characters/.test(sql)) return { rows: chars.filter(c => c.name.toLowerCase() === params[0]) };
            return { rows: [{ id: 1, work_type: 'scene' }] };
        },
        async transaction(fn) { return fn(client); }
    };
};

describe('record_scene_events character names (mws-wqy)', () => {
    it('resolves a name to its id', async () => {
        const db = mk([{ id: 7, name: 'Emma' }]);
        await new SceneEventsHandlers(db).handleRecordSceneEvents({ work_id: 5, events: [{ event_type: 'action', character_id: 'emma' }, { event_type: 'action', character_id: '9' }] });
        const ins = db.calls.filter(c => /INSERT INTO outline_scene_events/.test(c.sql));
        assert.strictEqual(ins[0].params[5], 7);
        assert.strictEqual(ins[1].params[5], 9);
    });
    it('rejects an unknown name with a clear error', async () => {
        const db = mk([]);
        await assert.rejects(new SceneEventsHandlers(db).handleRecordSceneEvents({ work_id: 5, events: [{ event_type: 'action', character_id: 'Jack' }] }), /character_id: no character named "Jack"/);
    });
    it('rejects an ambiguous name', async () => {
        const db = mk([{ id: 1, name: 'Sam' }, { id: 2, name: 'Sam' }]);
        await assert.rejects(new SceneEventsHandlers(db).handleRecordSceneEvents({ work_id: 5, events: [{ event_type: 'action', character_id: 'Sam' }] }), /ambiguous/);
    });
});
