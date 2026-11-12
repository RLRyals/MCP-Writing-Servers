// src/mcps/outline-server/handlers/scene-events-handlers.js
// Polymorphic event log: record what each outline node DOES.
// Plus the projection query: replay reveals_fact events filtered by
// character, ordered by narrative position, to derive knowledge state.

import { sceneEventsToolsSchema } from '../schemas/outline-tools-schema.js';

const VALID_EVENT_TYPES = new Set([
    'reveals_fact','plants_promise','pays_promise',
    'character_choice','consequence','evidence_produced','evidence_converted',
    'action','position','line','display','sound','prop_state','dressing',
    'reveals','learns','starts_truth','ends_truth'
]);
// Canon Over Time event types and the pointer(s) each must carry.
const TRUTH_POINTERS = {
    reveals: ['reveal_id'],
    learns: ['knowledge_id'],
    starts_truth: ['fact_id', 'detail_id', 'knowledge_id'],
    ends_truth: ['fact_id', 'detail_id', 'knowledge_id']
};
const VALID_CHANNELS = new Set(['in_room','comm','ai','off_screen']);

export class SceneEventsHandlers {
    constructor(db) {
        this.db = db;
    }

    getSceneEventsTools() {
        return sceneEventsToolsSchema;
    }

    // character_id may be an integer, a numeric string, or a character name
    // (case-insensitive). A miss or ambiguous name is a clear validation error.
    async resolveCharacterId(value, cache) {
        if (value === undefined || value === null || value === '') return null;
        if (typeof value === 'number' || /^\d+$/.test(String(value).trim())) return Number(value);
        const wanted = String(value).trim().toLowerCase();
        if (cache.has(wanted)) return cache.get(wanted);
        const rows = (await this.db.query(
            `SELECT id, name FROM characters WHERE LOWER(name) = $1 ORDER BY id`, [wanted]
        )).rows;
        if (rows.length === 0) {
            throw new Error(`Validation failed: character_id: no character named "${value}". Pass a characters.id or an exact character name.`);
        }
        if (rows.length > 1) {
            throw new Error(`Validation failed: character_id: name "${value}" is ambiguous (ids ${rows.map(r => r.id).join(', ')}). Pass the characters.id.`);
        }
        cache.set(wanted, rows[0].id);
        return rows[0].id;
    }

    async handleRecordSceneEvents(args) {
        const { work_id, events, replace = false } = args;
        if (!Array.isArray(events) || events.length === 0) {
            throw new Error('events array is required and must be non-empty.');
        }
        for (const ev of events) {
            if (!VALID_EVENT_TYPES.has(ev.event_type)) {
                throw new Error(`Invalid event_type: ${ev.event_type}`);
            }
            if (ev.channel != null && !VALID_CHANNELS.has(ev.channel)) {
                throw new Error(`Invalid channel: ${ev.channel}`);
            }
            // Pointer events must point at a row (never copy its content).
            const pointer = TRUTH_POINTERS[ev.event_type];
            if (pointer && !pointer.some(k => ev[k])) {
                throw new Error(`${ev.event_type} needs one of: ${pointer.join(', ')}`);
            }
        }

        // Verify work exists.
        const w = await this.db.query(
            `SELECT id, work_type FROM outline_works WHERE id = $1`,
            [work_id]
        );
        if (w.rows.length === 0) {
            throw new Error(`Work ${work_id} not found.`);
        }

        // Accept a character name as well as an id (mws-wqy): resolve to characters.id.
        const nameCache = new Map();
        for (const ev of events) {
            ev.character_id = await this.resolveCharacterId(ev.character_id, nameCache);
        }

        try {
            const insertedIds = await this.db.transaction(async (client) => {
                if (replace) {
                    await client.query(`DELETE FROM outline_scene_events WHERE work_id = $1`, [work_id]);
                }
                const ids = [];
                for (let idx = 0; idx < events.length; idx++) {
                    const ev = events[idx];
                    const result = await client.query(
                        `INSERT INTO outline_scene_events
                            (work_id, event_type, fact_id, promise_id, evidence_id,
                             character_id, ordering, note, location_id, element_id, channel,
                             reveal_id, knowledge_id, detail_id)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
                        [work_id, ev.event_type,
                         ev.fact_id || null, ev.promise_id || null,
                         ev.evidence_id || null, ev.character_id || null,
                         ev.ordering ?? idx, ev.note || null,
                         ev.location_id || null, ev.element_id || null, ev.channel || null,
                         ev.reveal_id || null, ev.knowledge_id || null, ev.detail_id || null]
                    );
                    ids.push(result.rows[0].id);
                }
                return ids;
            });

            return { content: [{ type: 'text', text:
                `Recorded ${insertedIds.length} event(s) on work ${work_id}` +
                (replace ? ' (replaced existing).' : ' (appended).') +
                `\nEvent IDs: ${insertedIds.join(', ')}`
            }] };
        } catch (err) {
            throw new Error(`record_scene_events failed: ${err.message}`);
        }
    }

    async handleWhatDoesCharacterKnowAt(args) {
        try {
            const { character_id, work_id } = args;

            // 1. Walk up from target to its root.
            // 2. Build sortable path for every node in that root's tree.
            // 3. Select reveals_fact events where work's path <= target path.
            const result = await this.db.query(
                `WITH RECURSIVE
                 ancestors AS (
                     SELECT id, parent_id FROM outline_works WHERE id = $1
                     UNION ALL
                     SELECT w.id, w.parent_id FROM outline_works w JOIN ancestors a ON w.id = a.parent_id
                 ),
                 root AS (
                     SELECT id FROM ancestors WHERE parent_id IS NULL LIMIT 1
                 ),
                 tree AS (
                     SELECT w.id, w.parent_id, ARRAY[w.sequence]::int[] AS path
                       FROM outline_works w, root WHERE w.id = root.id
                     UNION ALL
                     SELECT w.id, w.parent_id, t.path || w.sequence
                       FROM outline_works w
                       JOIN tree t ON w.parent_id = t.id
                 ),
                 target_path AS (SELECT path FROM tree WHERE id = $1),
                 preceding AS (
                     SELECT t.id, t.path FROM tree t, target_path tp WHERE t.path <= tp.path
                 )
                 SELECT DISTINCT f.id AS fact_id, f.statement, f.fact_type,
                        se.work_id, w.title AS work_title, w.work_type,
                        p.path
                   FROM outline_scene_events se
                   JOIN outline_facts f ON se.fact_id = f.id
                   JOIN outline_works w ON se.work_id = w.id
                   JOIN preceding p ON se.work_id = p.id
                  WHERE se.event_type = 'reveals_fact'
                    AND se.character_id = $2
                  ORDER BY p.path`,
                [work_id, character_id]
            );

            // Character lookup for display.
            const charResult = await this.db.query(
                `SELECT name FROM characters WHERE id = $1`,
                [character_id]
            );
            const charName = charResult.rows[0]?.name ?? `character#${character_id}`;

            if (result.rows.length === 0) {
                return { content: [{ type: 'text', text:
                    `${charName} knows nothing at work ${work_id} (no reveals_fact events found for this character at or before this point).`
                }] };
            }

            const lines = result.rows.map(r =>
                `- [${r.fact_type ?? 'untyped'}] ${r.statement}` +
                `\n    learned in: ${r.work_type}#${r.work_id} ${r.work_title ?? ''}`
            );
            return { content: [{ type: 'text', text:
                `${charName} knows (${result.rows.length} fact(s)) at work ${work_id}:\n\n${lines.join('\n')}`
            }] };
        } catch (err) {
            throw new Error(`what_does_character_know_at failed: ${err.message}`);
        }
    }
}
