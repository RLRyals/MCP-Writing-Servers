// src/mcps/outline-server/handlers/scene-state-handlers.js
// Canon Over Time (mws-wm4): the per-scene state note written on scene approval.
// Plain words, no scores. Knowledge changes also land in character_knowledge with
// this scene as the "known from" anchor. get_scene_brief hands the previous
// scene's note to the next scene's plan.

import { sceneStateToolsSchema } from '../schemas/outline-tools-schema.js';

export const STATE_FIELDS = [
    ['knowledge_changes', 'Knowledge changes'],
    ['stops_being_true', 'Stops being true'],
    ['decisions', 'Decisions'],
    ['alternatives_turned_down', 'Alternatives turned down'],
    ['emotion_carried_forward', 'Emotion carried forward'],
    ['open_pressures', 'Open pressures']
];
const KNOWLEDGE_LEVELS = new Set(['knows', 'suspects', 'unaware', 'forgot', 'locked']);

export function renderSceneState(note) {
    const lines = [];
    for (const [key, label] of STATE_FIELDS) {
        if (note[key]) lines.push(`- **${label}:** ${note[key]}`);
    }
    return lines;
}

export class SceneStateHandlers {
    constructor(db) {
        this.db = db;
    }

    getSceneStateTools() {
        return sceneStateToolsSchema;
    }

    async handleRecordSceneState(args) {
        const { work_id, knowledge = [] } = args;
        const w = await this.db.query(`SELECT id, work_type FROM outline_works WHERE id = $1`, [work_id]);
        if (w.rows.length === 0) throw new Error(`Work ${work_id} not found.`);
        if (w.rows[0].work_type !== 'scene') {
            throw new Error(`Work ${work_id} is a ${w.rows[0].work_type}; state notes belong on scenes.`);
        }
        for (const k of knowledge) {
            if (!k.character_id || !k.knowledge_item) {
                throw new Error('each knowledge entry needs character_id and knowledge_item.');
            }
            if (k.knowledge_level != null && !KNOWLEDGE_LEVELS.has(k.knowledge_level)) {
                throw new Error(`Invalid knowledge_level: ${k.knowledge_level}`);
            }
        }

        // Only fields the caller sent are written, so a later call can amend one field.
        const sent = STATE_FIELDS.map(([key]) => key).filter(key => args[key] !== undefined);
        if (sent.length === 0 && knowledge.length === 0) {
            throw new Error('Nothing to record: give at least one state field or a knowledge entry.');
        }

        try {
            const note = await this.db.transaction(async (client) => {
                const cols = ['work_id', ...sent];
                const vals = [work_id, ...sent.map(k => args[k])];
                const params = vals.map((_, i) => `$${i + 1}`).join(', ');
                const sets = [...sent.map(k => `${k} = EXCLUDED.${k}`), 'updated_at = CURRENT_TIMESTAMP'].join(', ');
                const res = await client.query(
                    `INSERT INTO outline_scene_state_notes (${cols.join(', ')})
                     VALUES (${params})
                     ON CONFLICT (work_id) DO UPDATE SET ${sets}
                     RETURNING *`,
                    vals
                );
                for (const k of knowledge) {
                    await client.query(
                        `INSERT INTO character_knowledge (character_id, knowledge_category, knowledge_item,
                                                          knowledge_level, learned_context,
                                                          known_from, known_scene_id, fact_id, reveal_id)
                         VALUES ($1, $2, $3, $4, $5, 'scene', $6, $7, $8)`,
                        [k.character_id, k.knowledge_category || 'uncategorized', k.knowledge_item,
                         k.knowledge_level || 'knows', k.learned_context || null,
                         work_id, k.fact_id || null, k.reveal_id || null]
                    );
                }
                return res.rows[0];
            });
            const lines = [`Recorded state note for scene ${work_id}.`, ...renderSceneState(note)];
            if (knowledge.length) lines.push(`Added ${knowledge.length} character_knowledge row(s) anchored to this scene.`);
            return { content: [{ type: 'text', text: lines.join('\n') }] };
        } catch (err) {
            throw new Error(`record_scene_state failed: ${err.message}`);
        }
    }

    async handleGetSceneState(args) {
        const { work_id } = args;
        const res = await this.db.query(
            `SELECT * FROM outline_scene_state_notes WHERE work_id = $1`, [work_id]);
        if (res.rows.length === 0) {
            return { content: [{ type: 'text', text: `No state note recorded for scene ${work_id}.` }] };
        }
        const lines = [`State note for scene ${work_id}:`, ...renderSceneState(res.rows[0])];
        return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
}
