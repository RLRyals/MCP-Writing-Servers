// src/mcps/outline-server/handlers/staging-handlers.js
// Scene staging (mws-5ad): staging rows, presence, trackers, and the generated
// staged outline (get_staged_scene). Every story fact lives on the outline
// scene (outline_works work_type 'scene'); beats are child works of type 'beat'.

import { stagingToolsSchema } from '../schemas/staging-tools-schema.js';

const STAGING_WORK_TYPES = new Set(['scene', 'beat']);
const BEAT_KINDS = new Set(['picture', 'not_picture', 'memory']);
const OWNER_KINDS = new Set(['character', 'scene', 'world']);
const VALUE_KINDS = new Set(['number', 'text']);
const DIRECTIONS = new Set(['up', 'down', 'none']);
const STAGING_EVENT_TYPES = ['action', 'position', 'line', 'display', 'sound', 'prop_state', 'dressing'];
const LEVELS = new Set(['short', 'staged', 'full']);

const STAGING_FIELDS = ['location_id', 'shows_location_id', 'time_of_day', 'story_datetime',
    'weather', 'light', 'beat_kind', 'memory_age'];
const PRESENCE_FIELDS = ['presence_type', 'clothing_description', 'physical_state',
    'arrival_method', 'departure_method', 'emotional_state', 'pressure', 'performance',
    'unadmitted', 'pattern', 'sabotage', 'emotional_build'];
const TRACKER_FIELDS = ['owner_kind', 'value_kind', 'unit', 'min_value', 'max_value', 'direction', 'description'];

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined;
const text = (t) => ({ content: [{ type: 'text', text: t }] });
const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

export class StagingHandlers {
    constructor(db) {
        this.db = db;
    }

    getStagingTools() {
        return stagingToolsSchema;
    }

    // ---------- shared helpers ----------

    async _getWork(work_id, allowedTypes) {
        const r = await this.db.query(
            `SELECT id, work_type, title, summary, content, parent_id, sequence FROM outline_works WHERE id = $1`,
            [work_id]
        );
        if (r.rows.length === 0) throw new Error(`Work ${work_id} not found.`);
        const w = r.rows[0];
        if (allowedTypes && !allowedTypes.has(w.work_type)) {
            throw new Error(`Work ${work_id} is a ${w.work_type}; only ${[...allowedTypes].join(' or ')} works are allowed here.`);
        }
        return w;
    }

    // Build "SET a = $2, b = $3" for the passed (has()) fields; values are taken as-is (null clears).
    _mergeSets(args, fields, startIndex) {
        const sets = [];
        const values = [];
        let p = startIndex;
        for (const f of fields) {
            if (has(args, f)) { sets.push(`${f} = $${p++}`); values.push(args[f]); }
        }
        return { sets, values, next: p };
    }

    // ---------- scene staging ----------

    async handleSetSceneStaging(args) {
        try {
            const { work_id } = args;
            await this._getWork(work_id, STAGING_WORK_TYPES);
            if (has(args, 'beat_kind') && args.beat_kind !== null && !BEAT_KINDS.has(args.beat_kind)) {
                throw new Error(`beat_kind must be one of picture, not_picture, memory (or null).`);
            }
            if (has(args, 'memory_age') && args.memory_age !== null && !Number.isInteger(args.memory_age)) {
                throw new Error('memory_age must be an integer (or null).');
            }

            const existing = await this.db.query(`SELECT id FROM scene_staging WHERE work_id = $1`, [work_id]);
            let row;
            if (existing.rows.length === 0) {
                const cols = ['work_id'];
                const vals = [work_id];
                for (const f of STAGING_FIELDS) {
                    if (has(args, f)) { cols.push(f); vals.push(args[f]); }
                }
                const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
                const r = await this.db.query(
                    `INSERT INTO scene_staging (${cols.join(', ')}) VALUES (${ph}) RETURNING *`, vals);
                row = r.rows[0];
            } else {
                const { sets, values } = this._mergeSets(args, STAGING_FIELDS, 2);
                if (sets.length === 0) {
                    const r = await this.db.query(`SELECT * FROM scene_staging WHERE work_id = $1`, [work_id]);
                    row = r.rows[0];
                } else {
                    const r = await this.db.query(
                        `UPDATE scene_staging SET ${sets.join(', ')} WHERE work_id = $1 RETURNING *`,
                        [work_id, ...values]);
                    row = r.rows[0];
                }
            }
            return text(`Scene staging saved for work ${work_id}.\n${this._formatStaging(row)}`);
        } catch (err) {
            throw new Error(`set_scene_staging failed: ${err.message}`);
        }
    }

    _formatStaging(r) {
        if (!r) return '(no staging row)';
        const parts = [];
        for (const f of STAGING_FIELDS) parts.push(`${f}: ${r[f] ?? '(not set)'}`);
        return parts.join('\n');
    }

    async handleGetSceneStaging(args) {
        try {
            const { work_id } = args;
            await this._getWork(work_id, STAGING_WORK_TYPES);
            const r = await this.db.query(
                `SELECT ss.*, l.name AS location_name, sl.name AS shows_location_name
                   FROM scene_staging ss
                   LEFT JOIN locations l ON l.id = ss.location_id
                   LEFT JOIN locations sl ON sl.id = ss.shows_location_id
                  WHERE ss.work_id = $1`, [work_id]);
            if (r.rows.length === 0) return text(`Work ${work_id} has no staging row yet.`);
            const s = r.rows[0];
            const lines = [`Staging for work ${work_id}:`];
            lines.push(`location: ${s.location_name ?? '(not set)'}${s.location_id ? ` (#${s.location_id})` : ''}`);
            lines.push(`shows location: ${s.shows_location_name ?? '(not set)'}${s.shows_location_id ? ` (#${s.shows_location_id})` : ''}`);
            for (const f of ['time_of_day', 'story_datetime', 'weather', 'light', 'beat_kind', 'memory_age']) {
                lines.push(`${f}: ${s[f] ?? '(not set)'}`);
            }
            return text(lines.join('\n'));
        } catch (err) {
            throw new Error(`get_scene_staging failed: ${err.message}`);
        }
    }

    // ---------- presence ----------

    async handleSetScenePresence(args) {
        try {
            const { work_id, character_id } = args;
            await this._getWork(work_id, STAGING_WORK_TYPES);
            if (has(args, 'presence_type') && isBlank(args.presence_type)) {
                throw new Error('presence_type cannot be cleared; pass a value such as present, comm, ai, hidden.');
            }

            const existing = await this.db.query(
                `SELECT id FROM character_chapter_presence WHERE work_id = $1 AND character_id = $2`,
                [work_id, character_id]);
            let row;
            if (existing.rows.length === 0) {
                const cols = ['work_id', 'character_id', 'presence_type'];
                const vals = [work_id, character_id, has(args, 'presence_type') ? args.presence_type : 'present'];
                for (const f of PRESENCE_FIELDS) {
                    if (f !== 'presence_type' && has(args, f)) { cols.push(f); vals.push(args[f]); }
                }
                const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
                const r = await this.db.query(
                    `INSERT INTO character_chapter_presence (${cols.join(', ')}) VALUES (${ph}) RETURNING *`, vals);
                row = r.rows[0];
            } else {
                const { sets, values } = this._mergeSets(args, PRESENCE_FIELDS, 3);
                if (sets.length === 0) {
                    const r = await this.db.query(
                        `SELECT * FROM character_chapter_presence WHERE work_id = $1 AND character_id = $2`,
                        [work_id, character_id]);
                    row = r.rows[0];
                } else {
                    const r = await this.db.query(
                        `UPDATE character_chapter_presence SET ${sets.join(', ')}
                          WHERE work_id = $1 AND character_id = $2 RETURNING *`,
                        [work_id, character_id, ...values]);
                    row = r.rows[0];
                }
            }
            const lines = [`Presence saved: character ${character_id} in work ${work_id} (${row?.presence_type ?? 'present'}).`];
            for (const f of PRESENCE_FIELDS) if (row && row[f] != null && f !== 'presence_type') lines.push(`${f}: ${row[f]}`);
            return text(lines.join('\n'));
        } catch (err) {
            throw new Error(`set_scene_presence failed: ${err.message}`);
        }
    }

    // ---------- trackers ----------

    async handleDefineTracker(args) {
        try {
            const { series_id, name } = args;
            if (isBlank(name)) throw new Error('name is required.');
            if (has(args, 'owner_kind') && !OWNER_KINDS.has(args.owner_kind)) throw new Error('owner_kind must be character, scene, or world.');
            if (has(args, 'value_kind') && !VALUE_KINDS.has(args.value_kind)) throw new Error('value_kind must be number or text.');
            if (has(args, 'direction') && !DIRECTIONS.has(args.direction)) throw new Error('direction must be up, down, or none.');

            const existing = await this.db.query(
                `SELECT id FROM trackers WHERE series_id = $1 AND name = $2`, [series_id, name]);
            let row;
            let created = false;
            if (existing.rows.length === 0) {
                if (!OWNER_KINDS.has(args.owner_kind)) throw new Error('owner_kind (character, scene, or world) is required for a new tracker.');
                created = true;
                const cols = ['series_id', 'name'];
                const vals = [series_id, name];
                for (const f of TRACKER_FIELDS) {
                    if (has(args, f)) { cols.push(f); vals.push(args[f]); }
                }
                const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
                const r = await this.db.query(
                    `INSERT INTO trackers (${cols.join(', ')}) VALUES (${ph}) RETURNING *`, vals);
                row = r.rows[0];
            } else {
                const { sets, values } = this._mergeSets(args, TRACKER_FIELDS, 3);
                if (sets.length === 0) {
                    const r = await this.db.query(`SELECT * FROM trackers WHERE series_id = $1 AND name = $2`, [series_id, name]);
                    row = r.rows[0];
                } else {
                    const r = await this.db.query(
                        `UPDATE trackers SET ${sets.join(', ')} WHERE series_id = $1 AND name = $2 RETURNING *`,
                        [series_id, name, ...values]);
                    row = r.rows[0];
                }
            }
            return text(`Tracker ${created ? 'created' : 'updated'}: #${row.id} "${row.name}" ` +
                `(${row.owner_kind}, ${row.value_kind}${row.unit ? `, ${row.unit}` : ''}, direction ${row.direction})`);
        } catch (err) {
            throw new Error(`define_tracker failed: ${err.message}`);
        }
    }

    async handleListTrackers(args) {
        try {
            const r = await this.db.query(
                `SELECT * FROM trackers WHERE series_id = $1 ORDER BY name, id`, [args.series_id]);
            if (r.rows.length === 0) return text(`No trackers defined for series ${args.series_id}.`);
            const lines = r.rows.map(t => {
                const range = (t.min_value != null || t.max_value != null) ? ` range ${t.min_value ?? '-'}..${t.max_value ?? '-'}` : '';
                return `- #${t.id} ${t.name} [${t.owner_kind}, ${t.value_kind}${t.unit ? `, ${t.unit}` : ''}, direction ${t.direction}${range}]` +
                    (t.description ? `: ${t.description}` : '');
            });
            return text(`${r.rows.length} tracker(s) in series ${args.series_id}:\n${lines.join('\n')}`);
        } catch (err) {
            throw new Error(`list_trackers failed: ${err.message}`);
        }
    }

    async handleRecordTrackerChange(args) {
        try {
            const { tracker_id, work_id, character_id, value_number, value_text, delta, reason, ordering } = args;
            if (isBlank(value_text) && value_number == null && delta == null) {
                throw new Error('At least one of value_number, value_text, delta is required.');
            }
            const t = await this.db.query(`SELECT id, name, owner_kind FROM trackers WHERE id = $1`, [tracker_id]);
            if (t.rows.length === 0) throw new Error(`Tracker ${tracker_id} not found.`);
            if (t.rows[0].owner_kind === 'character' && character_id == null) {
                throw new Error(`Tracker "${t.rows[0].name}" is character-owned; character_id is required.`);
            }
            await this._getWork(work_id);
            const r = await this.db.query(
                `INSERT INTO tracker_changes
                    (tracker_id, character_id, work_id, value_number, value_text, delta, reason, ordering)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
                [tracker_id, character_id ?? null, work_id, value_number ?? null,
                 isBlank(value_text) ? null : value_text, delta ?? null, reason ?? null, ordering ?? 0]);
            return text(`Recorded change #${r.rows[0].id} to tracker "${t.rows[0].name}" at work ${work_id}.`);
        } catch (err) {
            throw new Error(`record_tracker_change failed: ${err.message}`);
        }
    }

    // Pure: fold ordered change rows into current values per (tracker, character).
    static foldTrackerChanges(trackers, changes, characterId) {
        const state = new Map(); // key -> { value, as_of_work_id, tracker, character_id }
        const keyOf = (t, c) => `${t}:${c ?? ''}`;
        for (const ch of changes) {
            const tr = trackers.find(t => t.id === ch.tracker_id);
            if (!tr) continue;
            const cid = tr.owner_kind === 'character' ? (ch.character_id ?? null) : null;
            const k = keyOf(tr.id, cid);
            const cur = state.get(k) || { tracker: tr, character_id: cid, value: null };
            if (ch.value_number != null) {
                cur.value = Number(ch.value_number); // absolute wins; delta on the same row is informational
            } else if (ch.value_text != null) {
                cur.value = ch.value_text;
            } else if (ch.delta != null) {
                const base = typeof cur.value === 'number' ? cur.value : 0;
                cur.value = base + Number(ch.delta);
            }
            cur.as_of_work_id = ch.work_id;
            cur.reason = ch.reason ?? null;
            state.set(k, cur);
        }
        const out = [];
        for (const tr of trackers) {
            if (tr.owner_kind === 'character') {
                const mine = [...state.values()].filter(s => s.tracker.id === tr.id);
                if (mine.length === 0) { out.push({ tracker_id: tr.id, name: tr.name, owner_kind: tr.owner_kind, unit: tr.unit, character_id: characterId ?? null, value: null, as_of_work_id: null }); continue; }
                for (const s of mine) out.push({ tracker_id: tr.id, name: tr.name, owner_kind: tr.owner_kind, unit: tr.unit, character_id: s.character_id, value: s.value, as_of_work_id: s.as_of_work_id });
            } else {
                const s = state.get(keyOf(tr.id, null));
                out.push({ tracker_id: tr.id, name: tr.name, owner_kind: tr.owner_kind, unit: tr.unit, character_id: null, value: s ? s.value : null, as_of_work_id: s ? s.as_of_work_id : null });
            }
        }
        return out;
    }

    // Structured values: trackers of the series as of work_id in outline-tree order.
    async _trackerValuesAt(series_id, work_id, character_id) {
        const trackers = (await this.db.query(
            `SELECT * FROM trackers WHERE series_id = $1 ORDER BY name, id`, [series_id])).rows;
        if (trackers.length === 0) return [];
        const params = [work_id, trackers.map(t => t.id)];
        let charClause = '';
        if (character_id != null) {
            params.push(character_id);
            charClause = `AND (tc.character_id = $3 OR tc.character_id IS NULL)`;
        }
        const changes = (await this.db.query(
            `WITH RECURSIVE
             ancestors AS (
                 SELECT id, parent_id FROM outline_works WHERE id = $1
                 UNION ALL
                 SELECT w.id, w.parent_id FROM outline_works w JOIN ancestors a ON w.id = a.parent_id
             ),
             root AS (SELECT id FROM ancestors WHERE parent_id IS NULL LIMIT 1),
             tree AS (
                 SELECT w.id, ARRAY[w.sequence]::int[] AS path
                   FROM outline_works w, root WHERE w.id = root.id
                 UNION ALL
                 SELECT w.id, t.path || w.sequence
                   FROM outline_works w JOIN tree t ON w.parent_id = t.id
             ),
             target AS (SELECT path FROM tree WHERE id = $1)
             SELECT tc.*, t.path
               FROM tracker_changes tc
               JOIN tree t ON t.id = tc.work_id, target
              WHERE tc.tracker_id = ANY($2::int[])
                AND t.path <= target.path
                ${charClause}
              ORDER BY t.path, tc.ordering, tc.id`,
            params)).rows;
        return StagingHandlers.foldTrackerChanges(trackers, changes, character_id);
    }

    _formatTrackerValue(v) {
        const who = v.character_id != null ? ` (character ${v.character_id})` : '';
        return `${v.name}${who}: ${v.value == null ? '(no value yet)' : v.value}${v.value != null && v.unit ? ` ${v.unit}` : ''}`;
    }

    async handleGetTrackerValuesAt(args) {
        try {
            const { series_id, work_id, character_id } = args;
            await this._getWork(work_id);
            const values = await this._trackerValuesAt(series_id, work_id, character_id);
            if (values.length === 0) return text(`No trackers defined for series ${series_id}.`);
            return text(`Tracker values at work ${work_id}:\n` +
                values.map(v => `- ${this._formatTrackerValue(v)}${v.as_of_work_id ? ` [as of work ${v.as_of_work_id}]` : ''}`).join('\n'));
        } catch (err) {
            throw new Error(`get_tracker_values_at failed: ${err.message}`);
        }
    }

    // ---------- get_staged_scene ----------

    async _seriesIdForWork(work_id) {
        const r = await this.db.query(
            `WITH RECURSIVE up AS (
                 SELECT id, parent_id, series_id FROM outline_works WHERE id = $1
                 UNION ALL
                 SELECT w.id, w.parent_id, w.series_id FROM outline_works w JOIN up u ON w.id = u.parent_id
             )
             SELECT series_id FROM up WHERE series_id IS NOT NULL LIMIT 1`, [work_id]);
        return r.rows[0]?.series_id ?? null;
    }

    async _loadStagedScene(work_id) {
        const scene = await this._getWork(work_id, new Set(['scene']));

        const beats = (await this.db.query(
            `SELECT id, title, summary, sequence FROM outline_works
              WHERE parent_id = $1 AND work_type = 'beat' ORDER BY sequence, id`, [work_id])).rows;
        const ids = [work_id, ...beats.map(b => b.id)];

        const stagingRows = (await this.db.query(
            `SELECT ss.*, l.name AS location_name, sl.name AS shows_location_name
               FROM scene_staging ss
               LEFT JOIN locations l ON l.id = ss.location_id
               LEFT JOIN locations sl ON sl.id = ss.shows_location_id
              WHERE ss.work_id = ANY($1::int[])`, [ids])).rows;
        const stagingByWork = new Map(stagingRows.map(r => [r.work_id, r]));

        const events = (await this.db.query(
            `SELECT se.*, c.name AS character_name, l.name AS location_name, we.name AS element_name,
                    f.statement AS fact_statement, p.label AS promise_label, ev.finding AS evidence_finding
               FROM outline_scene_events se
               LEFT JOIN characters c ON c.id = se.character_id
               LEFT JOIN locations l ON l.id = se.location_id
               LEFT JOIN world_elements we ON we.id = se.element_id
               LEFT JOIN outline_facts f ON f.id = se.fact_id
               LEFT JOIN outline_promises p ON p.id = se.promise_id
               LEFT JOIN outline_evidence_chain ev ON ev.id = se.evidence_id
              WHERE se.work_id = ANY($1::int[])
              ORDER BY se.work_id, se.ordering, se.id`, [ids])).rows;

        const presence = (await this.db.query(
            `SELECT p.*, c.name AS character_name
               FROM character_chapter_presence p
               JOIN characters c ON c.id = p.character_id
              WHERE p.work_id = $1 ORDER BY p.id`, [work_id])).rows;

        const changes = (await this.db.query(
            `SELECT tc.*, t.name AS tracker_name, t.unit, c.name AS character_name
               FROM tracker_changes tc
               JOIN trackers t ON t.id = tc.tracker_id
               LEFT JOIN characters c ON c.id = tc.character_id
              WHERE tc.work_id = ANY($1::int[])
              ORDER BY tc.work_id, tc.ordering, tc.id`, [ids])).rows;

        let trackerValues = [];
        const seriesId = await this._seriesIdForWork(work_id);
        if (seriesId != null) trackerValues = await this._trackerValuesAt(seriesId, work_id);

        const locIds = [...new Set(stagingRows.flatMap(s => [s.location_id, s.shows_location_id]).filter(x => x != null))];
        let locations = [];
        if (locIds.length > 0) {
            const locRows = (await this.db.query(
                `SELECT id, name, location_type, position_note, parent_location_id FROM locations WHERE id = ANY($1::int[])`,
                [locIds])).rows;
            const children = (await this.db.query(
                `SELECT id, name, location_type, position_note, parent_location_id FROM locations
                  WHERE parent_location_id = ANY($1::int[]) ORDER BY id`, [locIds])).rows;
            locations = locRows.map(l => ({
                id: l.id, name: l.name, location_type: l.location_type, position_note: l.position_note ?? null,
                landmarks: children.filter(c => c.parent_location_id === l.id).map(c => ({
                    id: c.id, name: c.name, location_type: c.location_type, position_note: c.position_note ?? null
                }))
            }));
        }

        const eventsFor = (wid) => events.filter(e => e.work_id === wid);
        const shapeEvent = (e) => ({
            id: e.id, event_type: e.event_type, character_id: e.character_id ?? null,
            character_name: e.character_name ?? null, location_id: e.location_id ?? null,
            location_name: e.location_name ?? null, element_id: e.element_id ?? null,
            element_name: e.element_name ?? null, channel: e.channel ?? null, note: e.note ?? null,
            evidence_id: e.evidence_id ?? null
        });
        const shapeStaging = (s) => s ? {
            location_id: s.location_id ?? null, location_name: s.location_name ?? null,
            shows_location_id: s.shows_location_id ?? null, shows_location_name: s.shows_location_name ?? null,
            time_of_day: s.time_of_day ?? null, story_datetime: s.story_datetime ?? null,
            weather: s.weather ?? null, light: s.light ?? null,
            beat_kind: s.beat_kind ?? null, memory_age: s.memory_age ?? null
        } : null;
        const shapeChange = (c) => ({
            tracker: c.tracker_name, character_name: c.character_name ?? null, unit: c.unit ?? null,
            value_number: c.value_number != null ? Number(c.value_number) : null,
            value_text: c.value_text ?? null, delta: c.delta != null ? Number(c.delta) : null,
            reason: c.reason ?? null
        });

        const beatObjs = beats.map(b => ({
            id: b.id, sequence: b.sequence, title: b.title ?? null, summary: b.summary ?? null,
            staging: shapeStaging(stagingByWork.get(b.id)),
            events: eventsFor(b.id).filter(e => STAGING_EVENT_TYPES.includes(e.event_type)).map(shapeEvent),
            tracker_changes: changes.filter(c => c.work_id === b.id).map(shapeChange)
        }));

        const sceneStaging = shapeStaging(stagingByWork.get(work_id));
        const presenceObjs = presence.map(p => ({
            character_id: p.character_id, character_name: p.character_name, presence_type: p.presence_type,
            clothing_description: p.clothing_description ?? null, physical_state: p.physical_state ?? null,
            arrival_method: p.arrival_method ?? null, departure_method: p.departure_method ?? null,
            emotional_state: p.emotional_state ?? null,
            hidden_layer: {
                pressure: p.pressure ?? null, performance: p.performance ?? null, unadmitted: p.unadmitted ?? null,
                pattern: p.pattern ?? null, sabotage: p.sabotage ?? null, emotional_build: p.emotional_build ?? null
            }
        }));

        // ----- holes the staged level expects filled -----
        const empty = [];
        const sceneLabel = `scene ${work_id}`;
        const s = stagingByWork.get(work_id);
        if (!s) {
            empty.push(`${sceneLabel}: no staging row`);
        } else {
            for (const f of ['location_id', 'time_of_day', 'weather', 'light']) {
                if (isBlank(s[f])) empty.push(`${sceneLabel}: ${f} is missing`);
            }
        }
        for (const b of beats) {
            const label = `beat ${b.id}${b.title ? ` (${b.title})` : ''}`;
            const bs = stagingByWork.get(b.id);
            if (!bs) {
                empty.push(`${label}: no staging row`);
                continue;
            }
            if (isBlank(bs.beat_kind)) empty.push(`${label}: beat_kind is missing`);
            if (bs.beat_kind === 'picture') {
                const hasPicture = eventsFor(b.id).some(e => e.event_type === 'position' || e.event_type === 'action');
                if (!hasPicture) empty.push(`${label}: picture beat has no position or action event`);
            }
        }
        for (const p of presence) {
            if (isBlank(p.clothing_description)) {
                empty.push(`${p.character_name} (character ${p.character_id}): present in ${sceneLabel} with no clothing_description`);
            }
        }
        for (const l of locations) {
            if (l.landmarks.length === 0) empty.push(`location ${l.id} (${l.name}): no landmark child locations`);
        }

        const storyEvents = eventsFor(work_id).concat(...beats.map(b => eventsFor(b.id).map(e => ({ ...e, _beat: b.id }))));

        return {
            scene, beats: beatObjs, sceneStaging, presence: presenceObjs,
            sceneEvents: eventsFor(work_id).filter(e => STAGING_EVENT_TYPES.includes(e.event_type)).map(shapeEvent),
            sceneChanges: changes.filter(c => c.work_id === work_id).map(shapeChange),
            trackerValues: trackerValues.filter(v => v.value != null).map(v => ({
                tracker: v.name, character_id: v.character_id, value: v.value, unit: v.unit ?? null
            })),
            locations, empty,
            storyEvents: storyEvents.filter(e => !STAGING_EVENT_TYPES.includes(e.event_type)).map(e => ({
                work_id: e.work_id, event_type: e.event_type, character_name: e.character_name ?? null,
                fact: e.fact_statement ?? null, promise: e.promise_label ?? null,
                evidence: e.evidence_finding ?? null, note: e.note ?? null
            }))
        };
    }

    _fmtEvent(e) {
        const who = e.character_name ? `${e.character_name}` : '';
        const where = e.location_name ? ` @ ${e.location_name}` : '';
        const what = e.element_name ? ` [${e.element_name}]` : '';
        const ch = e.channel ? ` (${e.channel})` : '';
        if (e.event_type === 'line') return `${e.event_type}: ${who || 'unknown speaker'}${ch}: "${e.note ?? ''}"`;
        return `${e.event_type}: ${[who, e.note].filter(Boolean).join(' - ')}${what}${where}${ch}`;
    }

    _fmtStaging(s) {
        if (!s) return '(no staging row)';
        const bits = [];
        if (s.location_name) bits.push(`at ${s.location_name}`);
        if (s.shows_location_name) bits.push(`showing ${s.shows_location_name}`);
        for (const f of ['time_of_day', 'story_datetime', 'weather', 'light', 'beat_kind']) {
            if (s[f]) bits.push(`${f.replace(/_/g, ' ')}: ${s[f]}`);
        }
        if (s.memory_age != null) bits.push(`memory age: ${s.memory_age}`);
        return bits.length ? bits.join('; ') : '(staging row is empty)';
    }

    _fmtChange(c) {
        const parts = [];
        if (c.value_number != null) parts.push(`= ${c.value_number}`);
        if (c.value_text != null) parts.push(`= "${c.value_text}"`);
        if (c.delta != null) parts.push(`${c.delta >= 0 ? '+' : ''}${c.delta}`);
        return `${c.tracker}${c.character_name ? ` (${c.character_name})` : ''} ${parts.join(' ')}${c.unit ? ` ${c.unit}` : ''}${c.reason ? ` - ${c.reason}` : ''}`;
    }

    _renderMarkdown(d, level) {
        const L = [];
        L.push(`# ${d.scene.title ?? `Scene ${d.scene.id}`}`);
        if (level === 'short') {
            L.push('');
            if (d.beats.length === 0) L.push('(no beats)');
            for (const b of d.beats) L.push(`- ${b.title ? `${b.title}: ` : ''}${b.summary ?? '(no summary)'}`);
        } else {
            L.push('', '## Staging', this._fmtStaging(d.sceneStaging));
            if (d.trackerValues.length) {
                L.push('', '## Trackers at scene start');
                for (const v of d.trackerValues) L.push(`- ${v.tracker}${v.character_id != null ? ` (character ${v.character_id})` : ''}: ${v.value}${v.unit ? ` ${v.unit}` : ''}`);
            }
            if (d.sceneChanges.length) {
                L.push('', '## Tracker changes on the scene');
                for (const c of d.sceneChanges) L.push(`- ${this._fmtChange(c)}`);
            }
            if (d.sceneEvents.length) {
                L.push('', '## Scene events');
                for (const e of d.sceneEvents) L.push(`- ${this._fmtEvent(e)}`);
            }
            L.push('', '## Present');
            if (d.presence.length === 0) L.push('(nobody recorded)');
            for (const p of d.presence) {
                const bits = [p.presence_type];
                if (p.clothing_description) bits.push(`wearing ${p.clothing_description}`);
                if (p.physical_state) bits.push(`state: ${p.physical_state}`);
                if (p.arrival_method) bits.push(`arrives: ${p.arrival_method}`);
                if (p.departure_method) bits.push(`leaves: ${p.departure_method}`);
                L.push(`- ${p.character_name}: ${bits.join('; ')}`);
                if (level === 'full') {
                    const h = p.hidden_layer;
                    if (p.emotional_state) L.push(`    emotional state: ${p.emotional_state}`);
                    for (const k of Object.keys(h)) if (h[k]) L.push(`    ${k.replace(/_/g, ' ')}: ${h[k]}`);
                }
            }
            L.push('', '## Beats');
            if (d.beats.length === 0) L.push('(no beats)');
            for (const b of d.beats) {
                L.push(`### ${b.sequence}. ${b.title ?? `Beat ${b.id}`}`);
                if (b.summary) L.push(b.summary);
                L.push(`staging: ${this._fmtStaging(b.staging)}`);
                for (const e of b.events) L.push(`- ${this._fmtEvent(e)}`);
                for (const c of b.tracker_changes) L.push(`- tracker: ${this._fmtChange(c)}`);
            }
            if (d.locations.length) {
                L.push('', '## Locations');
                for (const l of d.locations) {
                    L.push(`- ${l.name} (${l.location_type})${l.position_note ? `: ${l.position_note}` : ''}`);
                    for (const lm of l.landmarks) L.push(`    - ${lm.name} (${lm.location_type})${lm.position_note ? `: ${lm.position_note}` : ''}`);
                }
            }
            if (level === 'full') {
                if (d.storyEvents.length) {
                    L.push('', '## Story events (reveals, promises, evidence)');
                    for (const e of d.storyEvents) {
                        L.push(`- [work ${e.work_id}] ${e.event_type}${e.character_name ? ` (${e.character_name})` : ''}: ${e.fact ?? e.promise ?? e.evidence ?? e.note ?? ''}`);
                    }
                }
                if (d.scene.summary) L.push('', '## Scene summary', d.scene.summary);
                if (d.scene.content) L.push('', '## Scene content', d.scene.content);
            }
        }
        L.push('', '## Empty fields');
        if (d.empty.length === 0) L.push('(none)');
        for (const e of d.empty) L.push(`- ${e}`);
        return L.join('\n');
    }

    async handleGetStagedScene(args) {
        try {
            const { work_id, level, format = 'markdown' } = args;
            if (!LEVELS.has(level)) throw new Error('level must be short, staged, or full.');
            if (format !== 'markdown' && format !== 'json') throw new Error('format must be markdown or json.');
            const d = await this._loadStagedScene(work_id);

            if (format === 'markdown') return text(this._renderMarkdown(d, level));

            const out = {
                level,
                scene: { id: d.scene.id, title: d.scene.title ?? null },
                beats: d.beats.map(b => level === 'short'
                    ? { id: b.id, sequence: b.sequence, title: b.title, summary: b.summary }
                    : b),
                empty_fields: d.empty
            };
            if (level !== 'short') {
                out.staging = d.sceneStaging;
                out.scene_events = d.sceneEvents;
                out.tracker_changes = d.sceneChanges;
                out.tracker_values_at_start = d.trackerValues;
                out.locations = d.locations;
                out.presence = d.presence.map(p => {
                    if (level === 'full') return p;
                    const { hidden_layer, ...rest } = p; // eslint-disable-line no-unused-vars
                    return rest;
                });
            }
            if (level === 'full') {
                out.scene.summary = d.scene.summary ?? null;
                out.scene.content = d.scene.content ?? null;
                out.story_events = d.storyEvents;
            }
            return text(JSON.stringify(out, null, 2));
        } catch (err) {
            throw new Error(`get_staged_scene failed: ${err.message}`);
        }
    }
}
