// tests/outline-server/staging-handlers.test.js
// Bead mws-5ad: scene staging, presence, trackers, staged scene view. Mocked db,
// synthetic story data only.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { StagingHandlers } from '../../src/mcps/outline-server/handlers/staging-handlers.js';
import { SceneEventsHandlers } from '../../src/mcps/outline-server/handlers/scene-events-handlers.js';
import { stagingToolsSchema } from '../../src/mcps/outline-server/schemas/staging-tools-schema.js';
import { outlineToolsSchema } from '../../src/mcps/outline-server/schemas/outline-tools-schema.js';

// rules: array of [substring, rowsOrFn]; first match wins; default no rows.
function mockDb(rules = []) {
    const queries = [];
    return {
        queries,
        async query(text, params = []) {
            queries.push({ text, params });
            for (const [pat, res] of rules) {
                if (text.includes(pat)) return { rows: typeof res === 'function' ? res(params, text) : res };
            }
            return { rows: [] };
        },
        async transaction(cb) { return cb({ query: (t, p) => this.query(t, p) }); }
    };
}

const WORK_SCENE = [{ id: 10, work_type: 'scene', title: 'The Lamp Room', summary: 'Ada finds the lamp dark.', content: 'Long text.' }];
const WORK_CHAPTER = [{ id: 5, work_type: 'chapter', title: 'Ch 1' }];
const workLookup = (rows) => ['SELECT id, work_type, title', rows];

describe('set_scene_staging', () => {
    it('rejects works that are not scene or beat', async () => {
        const db = mockDb([workLookup(WORK_CHAPTER)]);
        await assert.rejects(new StagingHandlers(db).handleSetSceneStaging({ work_id: 5, weather: 'rain' }),
            /only scene or beat/);
        assert.equal(db.queries.some(q => q.text.includes('scene_staging')), false);
    });

    it('rejects an invalid beat_kind', async () => {
        const db = mockDb([workLookup(WORK_SCENE)]);
        await assert.rejects(new StagingHandlers(db).handleSetSceneStaging({ work_id: 10, beat_kind: 'flashback' }),
            /beat_kind must be one of/);
    });

    it('inserts only the passed fields when no row exists', async () => {
        const db = mockDb([workLookup(WORK_SCENE), ['INSERT INTO scene_staging', [{ work_id: 10, weather: 'fog' }]]]);
        await new StagingHandlers(db).handleSetSceneStaging({ work_id: 10, weather: 'fog', time_of_day: 'dusk' });
        const q = db.queries.find(x => x.text.includes('INSERT INTO scene_staging'));
        assert.match(q.text, /\(work_id, time_of_day, weather\)/);
        assert.deepEqual(q.params.slice(0, 1), [10]);
        assert.ok(q.params.includes('fog') && q.params.includes('dusk'));
        assert.doesNotMatch(q.text, /light|location_id/);
    });

    it('merge: update touches only passed fields, never blanks omitted ones', async () => {
        const db = mockDb([workLookup(WORK_SCENE), ['SELECT id FROM scene_staging', [{ id: 1 }]],
            ['UPDATE scene_staging', [{ work_id: 10, weather: 'clear', light: 'lantern' }]]]);
        await new StagingHandlers(db).handleSetSceneStaging({ work_id: 10, weather: 'clear' });
        const q = db.queries.find(x => x.text.includes('UPDATE scene_staging'));
        assert.match(q.text, /SET weather = \$2 WHERE work_id = \$1/);
        assert.deepEqual(q.params, [10, 'clear']);
        assert.doesNotMatch(q.text, /light|location_id|time_of_day|beat_kind/);
    });

    it('explicit null clears a field', async () => {
        const db = mockDb([workLookup(WORK_SCENE), ['SELECT id FROM scene_staging', [{ id: 1 }]],
            ['UPDATE scene_staging', [{ work_id: 10 }]]]);
        await new StagingHandlers(db).handleSetSceneStaging({ work_id: 10, light: null, beat_kind: null });
        const q = db.queries.find(x => x.text.includes('UPDATE scene_staging'));
        assert.match(q.text, /light = \$2, beat_kind = \$3/);
        assert.deepEqual(q.params, [10, null, null]);
    });

    it('get_scene_staging returns names, and a note when no row exists', async () => {
        const db = mockDb([workLookup(WORK_SCENE),
            ['FROM scene_staging ss', [{ work_id: 10, location_id: 3, location_name: 'The Lighthouse', weather: 'gale' }]]]);
        const res = await new StagingHandlers(db).handleGetSceneStaging({ work_id: 10 });
        assert.match(res.content[0].text, /location: The Lighthouse \(#3\)/);
        assert.match(res.content[0].text, /weather: gale/);
        assert.match(res.content[0].text, /light: \(not set\)/);
        const none = await new StagingHandlers(mockDb([workLookup(WORK_SCENE)])).handleGetSceneStaging({ work_id: 10 });
        assert.match(none.content[0].text, /no staging row yet/);
    });
});

describe('set_scene_presence', () => {
    it('rejects a chapter work', async () => {
        const db = mockDb([workLookup(WORK_CHAPTER)]);
        await assert.rejects(new StagingHandlers(db).handleSetScenePresence({ work_id: 5, character_id: 1 }), /only scene or beat/);
    });

    it('first insert defaults presence_type to present and only sets passed fields', async () => {
        const db = mockDb([workLookup(WORK_SCENE), ['INSERT INTO character_chapter_presence', [{ presence_type: 'present', pressure: 'deadline' }]]]);
        await new StagingHandlers(db).handleSetScenePresence({ work_id: 10, character_id: 1, pressure: 'deadline' });
        const q = db.queries.find(x => x.text.includes('INSERT INTO character_chapter_presence'));
        assert.match(q.text, /\(work_id, character_id, presence_type, pressure\)/);
        assert.deepEqual(q.params, [10, 1, 'present', 'deadline']);
    });

    it('merge: update never blanks omitted fields; null clears; presence_type cannot be cleared', async () => {
        const rules = [workLookup(WORK_SCENE), ['SELECT id FROM character_chapter_presence', [{ id: 4 }]],
            ['UPDATE character_chapter_presence', [{ presence_type: 'comm' }]]];
        const db = mockDb(rules);
        const h = new StagingHandlers(db);
        await h.handleSetScenePresence({ work_id: 10, character_id: 1, presence_type: 'comm', clothing_description: null });
        const q = db.queries.find(x => x.text.includes('UPDATE character_chapter_presence'));
        assert.match(q.text, /SET presence_type = \$3, clothing_description = \$4/);
        assert.deepEqual(q.params, [10, 1, 'comm', null]);
        assert.doesNotMatch(q.text, /physical_state|pressure/);
        await assert.rejects(h.handleSetScenePresence({ work_id: 10, character_id: 1, presence_type: null }), /cannot be cleared/);
    });
});

describe('trackers', () => {
    it('define_tracker inserts a new one and requires owner_kind', async () => {
        const db = mockDb([['INSERT INTO trackers', [{ id: 1, name: 'Countdown', owner_kind: 'scene', value_kind: 'number', direction: 'down', unit: 'seconds' }]]]);
        const h = new StagingHandlers(db);
        const res = await h.handleDefineTracker({ series_id: 1, name: 'Countdown', owner_kind: 'scene', direction: 'down', unit: 'seconds' });
        assert.match(res.content[0].text, /created: #1 "Countdown"/);
        await assert.rejects(h.handleDefineTracker({ series_id: 1, name: 'Other' }), /owner_kind .* is required/);
        await assert.rejects(h.handleDefineTracker({ series_id: 1, name: 'X', owner_kind: 'galaxy' }), /owner_kind must be/);
    });

    it('define_tracker upsert merges: only passed fields updated', async () => {
        const db = mockDb([['SELECT id FROM trackers', [{ id: 1 }]], ['UPDATE trackers', [{ id: 1, name: 'Score', owner_kind: 'world', value_kind: 'number', direction: 'up' }]]]);
        await new StagingHandlers(db).handleDefineTracker({ series_id: 1, name: 'Score', unit: '%' });
        const q = db.queries.find(x => x.text.includes('UPDATE trackers'));
        assert.match(q.text, /SET unit = \$3 WHERE/);
        assert.deepEqual(q.params, [1, 'Score', '%']);
    });

    it('list_trackers lists them', async () => {
        const db = mockDb([['FROM trackers WHERE series_id', [{ id: 2, name: 'Gold', owner_kind: 'character', value_kind: 'number', unit: 'coins', direction: 'up', min_value: 0, max_value: null }]]]);
        const res = await new StagingHandlers(db).handleListTrackers({ series_id: 1 });
        assert.match(res.content[0].text, /#2 Gold \[character, number, coins, direction up range 0\.\.-\]/);
    });

    it('record_tracker_change requires a value, and a character for character-owned trackers', async () => {
        const db = mockDb([['FROM trackers WHERE id', [{ id: 2, name: 'Gold', owner_kind: 'character' }]], workLookup(WORK_SCENE),
            ['INSERT INTO tracker_changes', [{ id: 9 }]]]);
        const h = new StagingHandlers(db);
        await assert.rejects(h.handleRecordTrackerChange({ tracker_id: 2, work_id: 10, character_id: 1 }), /At least one of/);
        await assert.rejects(h.handleRecordTrackerChange({ tracker_id: 2, work_id: 10, delta: 5 }), /character_id is required/);
        const res = await h.handleRecordTrackerChange({ tracker_id: 2, work_id: 10, character_id: 1, delta: 5, reason: 'sold a map' });
        assert.match(res.content[0].text, /Recorded change #9/);
        const q = db.queries.find(x => x.text.includes('INSERT INTO tracker_changes'));
        assert.deepEqual(q.params, [2, 1, 10, null, null, 5, 'sold a map', 0]);
    });

    it('foldTrackerChanges: absolute then deltas accumulate; delta-only starts from 0; text replaces', () => {
        const trackers = [
            { id: 1, name: 'Countdown', owner_kind: 'scene', unit: 'seconds' },
            { id: 2, name: 'Gold', owner_kind: 'character', unit: 'coins' },
            { id: 3, name: 'Mood', owner_kind: 'world', unit: null },
            { id: 4, name: 'Unused', owner_kind: 'world', unit: null }
        ];
        const changes = [
            { tracker_id: 1, work_id: 10, value_number: '540' },
            { tracker_id: 1, work_id: 11, delta: '-100' },
            { tracker_id: 1, work_id: 12, delta: '-200' },
            { tracker_id: 2, character_id: 1, work_id: 10, delta: '5' },
            { tracker_id: 2, character_id: 1, work_id: 11, delta: '3' },
            { tracker_id: 2, character_id: 2, work_id: 11, value_number: '50' },
            { tracker_id: 3, work_id: 10, value_text: 'tense' },
            { tracker_id: 1, work_id: 13, value_number: '58' }
        ];
        const v = StagingHandlers.foldTrackerChanges(trackers, changes);
        const get = (id, c = null) => v.find(x => x.tracker_id === id && x.character_id === c);
        assert.equal(get(1).value, 58);
        assert.equal(get(1).as_of_work_id, 13);
        assert.equal(get(2, 1).value, 8);
        assert.equal(get(2, 2).value, 50);
        assert.equal(get(3).value, 'tense');
        assert.equal(get(4).value, null);
        // before the reset: 540 - 100 - 200
        const before = StagingHandlers.foldTrackerChanges(trackers, changes.slice(0, 3));
        assert.equal(before.find(x => x.tracker_id === 1).value, 240);
    });

    it('get_tracker_values_at queries in outline tree order and folds deltas', async () => {
        const db = mockDb([workLookup(WORK_SCENE),
            ['FROM trackers WHERE series_id', [{ id: 1, name: 'Countdown', owner_kind: 'scene', unit: 'seconds' }]],
            ['FROM tracker_changes tc', [
                { tracker_id: 1, work_id: 10, value_number: '300', delta: null, character_id: null },
                { tracker_id: 1, work_id: 11, value_number: null, delta: '-60', character_id: null }
            ]]]);
        const res = await new StagingHandlers(db).handleGetTrackerValuesAt({ series_id: 1, work_id: 11 });
        const q = db.queries.find(x => x.text.includes('FROM tracker_changes tc'));
        assert.match(q.text, /t\.path <= target\.path/);
        assert.match(q.text, /ORDER BY t\.path, tc\.ordering, tc\.id/);
        assert.match(res.content[0].text, /Countdown: 240 seconds \[as of work 11\]/);
    });

    it('get_tracker_values_at with character_id filters character rows in SQL', async () => {
        const db = mockDb([workLookup(WORK_SCENE), ['FROM trackers WHERE series_id', [{ id: 1, name: 'Gold', owner_kind: 'character', unit: null }]]]);
        const res = await new StagingHandlers(db).handleGetTrackerValuesAt({ series_id: 1, work_id: 10, character_id: 7 });
        const q = db.queries.find(x => x.text.includes('FROM tracker_changes tc'));
        assert.match(q.text, /tc\.character_id = \$3 OR tc\.character_id IS NULL/);
        assert.equal(q.params[2], 7);
        assert.match(res.content[0].text, /Gold \(character 7\): \(no value yet\)/);
    });
});

describe('record_scene_events (extended)', () => {
    it('accepts staging event types and stores location_id, element_id, channel', async () => {
        const db = mockDb([['FROM outline_works WHERE id = $1', [{ id: 11, work_type: 'beat' }]], ['INSERT INTO outline_scene_events', [{ id: 1 }]]]);
        const h = new SceneEventsHandlers(db);
        await h.handleRecordSceneEvents({ work_id: 11, events: [
            { event_type: 'line', character_id: 1, channel: 'comm', note: 'Hold the door.' },
            { event_type: 'dressing', element_id: 4, location_id: 6, note: 'turned to face the window' }
        ] });
        const ins = db.queries.filter(x => x.text.includes('INSERT INTO outline_scene_events'));
        assert.equal(ins.length, 2);
        assert.match(ins[0].text, /location_id, element_id, channel/);
        assert.deepEqual(ins[0].params.slice(8), [null, null, 'comm']);
        assert.deepEqual(ins[1].params.slice(8), [6, 4, null]);
    });

    it('stays backward compatible and rejects a bad channel or type', async () => {
        const db = mockDb([['FROM outline_works WHERE id = $1', [{ id: 11, work_type: 'scene' }]], ['INSERT INTO outline_scene_events', [{ id: 1 }]]]);
        const h = new SceneEventsHandlers(db);
        await h.handleRecordSceneEvents({ work_id: 11, events: [{ event_type: 'reveals_fact', fact_id: 3 }] });
        await assert.rejects(h.handleRecordSceneEvents({ work_id: 11, events: [{ event_type: 'line', channel: 'telepathy' }] }), /Invalid channel/);
        await assert.rejects(h.handleRecordSceneEvents({ work_id: 11, events: [{ event_type: 'dance' }] }), /Invalid event_type/);
    });
});

// Scene 10 at loc 3 (no landmarks, weather missing); beat 11 picture with no events, beat 12 no
// staging row, beat 13 no beat_kind. Ada present with no clothing.
function stagedDb({ full = true } = {}) {
    const staging = [
        { work_id: 10, location_id: 3, location_name: 'The Lighthouse', time_of_day: 'night', weather: null, light: 'lantern' },
        { work_id: 11, beat_kind: 'picture', location_id: null },
        { work_id: 13, beat_kind: null }
    ];
    return mockDb([
        ['SELECT id, work_type, title', WORK_SCENE],
        ["parent_id = $1 AND work_type = 'beat'", [
            { id: 11, title: 'Ada climbs', summary: 'Ada climbs the stairs.', sequence: 1 },
            { id: 12, title: 'The plan', summary: 'Ada decides what to do.', sequence: 2 },
            { id: 13, title: 'The lamp', summary: 'She lights the lamp.', sequence: 3 }
        ]],
        ['FROM scene_staging ss', staging],
        ['FROM outline_scene_events se', [
            { id: 1, work_id: 13, event_type: 'line', character_id: 1, character_name: 'Ada', channel: 'in_room', note: 'Light, please.' },
            { id: 2, work_id: 13, event_type: 'sound', note: 'a chime' },
            { id: 3, work_id: 10, event_type: 'reveals_fact', fact_statement: 'The lamp was sabotaged.' }
        ]],
        ['FROM character_chapter_presence p', [
            { character_id: 1, character_name: 'Ada', presence_type: 'present', clothing_description: null, pressure: 'the storm' }
        ]],
        ['FROM tracker_changes tc\n               JOIN trackers t', [
            { work_id: 13, tracker_name: 'Countdown', unit: 'seconds', delta: '-30', value_number: null, value_text: null, reason: 'lamp lit' }
        ]],
        ['WITH RECURSIVE\n             ancestors', [{ tracker_id: 1, work_id: 10, value_number: '600', character_id: null }]],
        ['SELECT series_id FROM up', [{ series_id: 1 }]],
        ['FROM trackers WHERE series_id', [{ id: 1, name: 'Countdown', owner_kind: 'scene', unit: 'seconds' }]],
        ['FROM locations WHERE id = ANY', [{ id: 3, name: 'The Lighthouse', location_type: 'building', position_note: null }]],
        ['FROM locations\n                  WHERE parent_location_id', []]
    ]);
}

describe('get_staged_scene', () => {
    it('reports every kind of hole in empty_fields (json)', async () => {
        const res = await new StagingHandlers(stagedDb()).handleGetStagedScene({ work_id: 10, level: 'staged', format: 'json' });
        const out = JSON.parse(res.content[0].text);
        const e = out.empty_fields.join('\n');
        assert.match(e, /scene 10: weather is missing/);
        assert.doesNotMatch(e, /scene 10: light is missing|scene 10: location_id|scene 10: time_of_day/);
        assert.match(e, /beat 11 \(Ada climbs\): picture beat has no position or action event/);
        assert.match(e, /beat 12 \(The plan\): no staging row/);
        assert.match(e, /beat 13 \(The lamp\): beat_kind is missing/);
        assert.match(e, /Ada \(character 1\): present in scene 10 with no clothing_description/);
        assert.match(e, /location 3 \(The Lighthouse\): no landmark child locations/);
    });

    it('short level: title plus beat lines and still returns empty_fields', async () => {
        const res = await new StagingHandlers(stagedDb()).handleGetStagedScene({ work_id: 10, level: 'short' });
        const t = res.content[0].text;
        assert.match(t, /^# The Lamp Room/);
        assert.match(t, /- Ada climbs: Ada climbs the stairs\./);
        assert.match(t, /- The lamp: She lights the lamp\./);
        assert.match(t, /## Empty fields/);
        assert.doesNotMatch(t, /## Staging|## Present/);
    });

    it('staged level shows events, presence and tracker values; hides hidden layer and story events', async () => {
        const t = (await new StagingHandlers(stagedDb()).handleGetStagedScene({ work_id: 10, level: 'staged' })).content[0].text;
        assert.match(t, /at The Lighthouse; time of day: night; light: lantern/);
        assert.match(t, /line: Ada \(in_room\): "Light, please\."/);
        assert.match(t, /sound: a chime/);
        assert.match(t, /Countdown: 600 seconds/);
        assert.match(t, /tracker: Countdown -30 seconds - lamp lit/);
        assert.match(t, /- Ada: present/);
        assert.doesNotMatch(t, /the storm|sabotaged|Long text/);
    });

    it('full level adds hidden layer, story events, summary and content', async () => {
        const t = (await new StagingHandlers(stagedDb()).handleGetStagedScene({ work_id: 10, level: 'full' })).content[0].text;
        assert.match(t, /pressure: the storm/);
        assert.match(t, /reveals_fact: The lamp was sabotaged\./);
        assert.match(t, /## Scene summary\nAda finds the lamp dark\./);
        assert.match(t, /Long text\./);
    });

    it('json full includes hidden_layer; json staged does not', async () => {
        const h = new StagingHandlers(stagedDb());
        const full = JSON.parse((await h.handleGetStagedScene({ work_id: 10, level: 'full', format: 'json' })).content[0].text);
        assert.equal(full.presence[0].hidden_layer.pressure, 'the storm');
        assert.equal(full.story_events.length, 1);
        const staged = JSON.parse((await new StagingHandlers(stagedDb()).handleGetStagedScene({ work_id: 10, level: 'staged', format: 'json' })).content[0].text);
        assert.equal(staged.presence[0].hidden_layer, undefined);
        assert.equal(staged.tracker_values_at_start[0].value, 600);
        assert.equal(staged.beats[2].events[0].event_type, 'line');
    });

    it('rejects non-scene works and bad level', async () => {
        const db = mockDb([workLookup(WORK_CHAPTER)]);
        await assert.rejects(new StagingHandlers(db).handleGetStagedScene({ work_id: 5, level: 'short' }), /only scene/);
        await assert.rejects(new StagingHandlers(db).handleGetStagedScene({ work_id: 5, level: 'huge' }), /level must be/);
    });

    it('a fully staged scene has no empty_fields', async () => {
        const db = mockDb([
            ['SELECT id, work_type, title', WORK_SCENE],
            ["parent_id = $1 AND work_type = 'beat'", [{ id: 11, title: 'Ada climbs', summary: 's', sequence: 1 }]],
            ['FROM scene_staging ss', [
                { work_id: 10, location_id: 3, time_of_day: 'night', weather: 'fog', light: 'lantern' },
                { work_id: 11, beat_kind: 'picture' }]],
            ['FROM outline_scene_events se', [{ id: 1, work_id: 11, event_type: 'position', note: 'at the top stair' }]],
            ['FROM character_chapter_presence p', [{ character_id: 1, character_name: 'Ada', presence_type: 'present', clothing_description: 'oilskin coat' }]],
            ['FROM locations WHERE id = ANY', [{ id: 3, name: 'The Lighthouse', location_type: 'building' }]],
            ['FROM locations\n                  WHERE parent_location_id', [{ id: 4, name: 'Spiral stair', location_type: 'landmark', parent_location_id: 3, position_note: 'north wall' }]]
        ]);
        const out = JSON.parse((await new StagingHandlers(db).handleGetStagedScene({ work_id: 10, level: 'staged', format: 'json' })).content[0].text);
        assert.deepEqual(out.empty_fields, []);
        assert.equal(out.locations[0].landmarks[0].position_note, 'north wall');
    });
});

describe('registration and migration', () => {
    it('staging tools are in the outline schema list', () => {
        const names = outlineToolsSchema.map(t => t.name);
        for (const t of stagingToolsSchema) assert.ok(names.includes(t.name), t.name);
        assert.equal(new Set(names).size, names.length, 'no duplicate tool names');
    });

    it('migration 059 is additive, idempotent and covers every contract item', () => {
        const sql = readFileSync(new URL('../../migrations/059_scene_staging.sql', import.meta.url), 'utf8');
        assert.match(sql, /FROM migrations WHERE filename = '059_scene_staging.sql'/);
        assert.match(sql, /INSERT INTO migrations \(filename\) VALUES \('059_scene_staging.sql'\)/);
        for (const frag of ['CREATE TABLE IF NOT EXISTS scene_staging', 'CREATE TABLE IF NOT EXISTS trackers',
            'CREATE TABLE IF NOT EXISTS tracker_changes', "'action','position','line','display','sound','prop_state','dressing'",
            "'reveals_fact','plants_promise','pays_promise','character_choice','consequence'",
            "'in_room','comm','ai','off_screen'", 'ADD COLUMN IF NOT EXISTS position_note', 'ADD COLUMN IF NOT EXISTS x_m',
            'ADD COLUMN IF NOT EXISTS z_m', 'ALTER COLUMN chapter_id DROP NOT NULL',
            'ON character_chapter_presence(work_id, character_id) WHERE work_id IS NOT NULL',
            'ADD COLUMN IF NOT EXISTS withheld BOOLEAN NOT NULL DEFAULT false',
            'ADD COLUMN IF NOT EXISTS discovery_work_id']) {
            assert.ok(sql.includes(frag), frag);
        }
        assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/);
    });
});
