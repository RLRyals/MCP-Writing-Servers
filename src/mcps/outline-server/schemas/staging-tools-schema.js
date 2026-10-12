// src/mcps/outline-server/schemas/staging-tools-schema.js
// Tool schemas for scene staging, presence, trackers and the generated staged outline (mws-5ad).

const nullableStr = (description) => ({ type: ['string', 'null'], description });
const nullableInt = (description) => ({ type: ['integer', 'null'], description });

export const stagingToolsSchema = [
    {
        name: 'set_scene_staging',
        description: 'Upsert the staging row (location, time, weather, light, beat kind) for a scene or beat outline work. Only works with work_type scene or beat. Merge semantics: only fields you pass are changed; pass null explicitly to clear a field.',
        inputSchema: {
            type: 'object',
            properties: {
                work_id: { type: 'integer', description: 'outline_works id (work_type scene or beat)' },
                location_id: nullableInt('locations.id where this takes place'),
                shows_location_id: nullableInt('locations.id of a place shown here rather than occupied (a screen, projection, dream)'),
                time_of_day: nullableStr('e.g. dawn, noon, night'),
                story_datetime: nullableStr('In-world date and time, free text'),
                weather: nullableStr('Weather at the location'),
                light: nullableStr('What lights the place'),
                beat_kind: { type: ['string', 'null'], enum: ['picture', 'not_picture', 'memory', null], description: 'picture = visible on screen; not_picture = goal/plan/interior beat; memory = cut to another place and time' },
                memory_age: nullableInt('For memory beats: how old the POV character is in the memory')
            },
            required: ['work_id']
        }
    },
    {
        name: 'get_scene_staging',
        description: 'Get the staging row for a scene or beat outline work (with location names).',
        inputSchema: { type: 'object', properties: { work_id: { type: 'integer' } }, required: ['work_id'] }
    },
    {
        name: 'set_scene_presence',
        description: 'Upsert who is in a scene (one row per work_id + character_id). Merge semantics: only fields you pass are changed; pass null to clear a field. presence_type is free text; conventional values: present (physically there), comm (on a comm/phone/video link), ai (an AI voice or ping), hidden (there but unseen). Default on first insert: present. enters_at/exits_at are not offered: the underlying columns (enters_at_scene/exits_at_scene) are legacy integers tied to the drafting table, so use arrival_method/departure_method text instead.',
        inputSchema: {
            type: 'object',
            properties: {
                work_id: { type: 'integer', description: 'The scene (or beat) outline work' },
                character_id: { type: 'integer' },
                presence_type: { type: 'string', description: 'present | comm | ai | hidden (free text)' },
                clothing_description: nullableStr('What they wear/carry at entry'),
                physical_state: nullableStr('Physical condition at entry'),
                arrival_method: nullableStr('How they enter the scene'),
                departure_method: nullableStr('How they leave'),
                emotional_state: nullableStr('Visible emotional state'),
                pressure: nullableStr('Hidden layer: what pressure they are under'),
                performance: nullableStr('Hidden layer: how they want to come across'),
                unadmitted: nullableStr('Hidden layer: what they will not admit'),
                pattern: nullableStr('Hidden layer: the pattern they repeat'),
                sabotage: nullableStr('Hidden layer: how they work against themselves'),
                emotional_build: nullableStr('Hidden layer: how emotion builds across the scene')
            },
            required: ['work_id', 'character_id']
        }
    },
    {
        name: 'define_tracker',
        description: 'Define (upsert by series_id + name) a tracker: a number or value that changes over the story and belongs to a character, a scene, or the world (e.g. a countdown, a score, HP, money). Merge semantics on update: omitted fields keep their value.',
        inputSchema: {
            type: 'object',
            properties: {
                series_id: { type: 'integer', description: 'series.id' },
                name: { type: 'string' },
                owner_kind: { type: 'string', enum: ['character', 'scene', 'world'] },
                value_kind: { type: 'string', enum: ['number', 'text'], description: 'Default number' },
                unit: nullableStr('e.g. seconds, %, gold'),
                min_value: { type: ['number', 'null'] },
                max_value: { type: ['number', 'null'] },
                direction: { type: 'string', enum: ['up', 'down', 'none'], description: 'Which way it normally moves. Default none' },
                description: nullableStr('What it measures')
            },
            required: ['series_id', 'name', 'owner_kind']
        }
    },
    {
        name: 'list_trackers',
        description: 'List the trackers defined for a series.',
        inputSchema: { type: 'object', properties: { series_id: { type: 'integer' } }, required: ['series_id'] }
    },
    {
        name: 'record_tracker_change',
        description: 'Record a change to a tracker at a scene or beat: an absolute value_number or value_text, and/or a delta (accumulates from the last absolute value). At least one of value_number, value_text, delta is required. character_id is required for character-owned trackers.',
        inputSchema: {
            type: 'object',
            properties: {
                tracker_id: { type: 'integer' },
                work_id: { type: 'integer', description: 'Scene or beat where the change happens' },
                character_id: { type: 'integer' },
                value_number: { type: 'number' },
                value_text: { type: 'string' },
                delta: { type: 'number' },
                reason: { type: 'string' },
                ordering: { type: 'integer', description: 'Order among changes on the same work (default 0)' }
            },
            required: ['tracker_id', 'work_id']
        }
    },
    {
        name: 'get_tracker_values_at',
        description: 'Each tracker value of a series as of an outline work in story order (the outline tree order): the latest change at or before that work, with deltas accumulated from the last absolute value. Changes on the work itself count; changes on its child beats come after it. With character_id, character-owned trackers show that character only.',
        inputSchema: {
            type: 'object',
            properties: {
                series_id: { type: 'integer' },
                work_id: { type: 'integer' },
                character_id: { type: 'integer' }
            },
            required: ['series_id', 'work_id']
        }
    },
    {
        name: 'get_staged_scene',
        description: 'The generated outline for one scene, built from database rows (never edited by hand). level short = scene title + beat lines. staged = short + scene/beat staging, events per beat (actions, positions, lines, display, sound, prop_state, dressing), who is present and how, tracker values at scene start and changes per beat, locations with landmark children. full = staged + hidden-layer presence fields + story events (reveals, promises, evidence) + the scene summary/content. Every level returns empty_fields: the holes the staged level expects filled.',
        inputSchema: {
            type: 'object',
            properties: {
                work_id: { type: 'integer', description: 'The scene outline work' },
                level: { type: 'string', enum: ['short', 'staged', 'full'] },
                format: { type: 'string', enum: ['markdown', 'json'], description: 'Default markdown' }
            },
            required: ['work_id', 'level']
        }
    }
];
