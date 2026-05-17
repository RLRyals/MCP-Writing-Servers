// src/mcps/outline-server/handlers/brief-handlers.js
// get_scene_brief: one tool call that loads the drafting context window
// for a single outline node. Composes ancestry + outline + events +
// open promises (scoped) + unconverted evidence (scoped) + per-character
// knowledge state. The intent: avoid forcing the drafting LLM through
// 6 tool calls before it can start writing.

import { briefToolsSchema } from '../schemas/outline-tools-schema.js';

export class BriefHandlers {
    constructor(db) {
        this.db = db;
    }

    getBriefTools() {
        return briefToolsSchema;
    }

    async handleGetSceneBrief(args) {
        try {
            const { work_id, present_character_ids = [] } = args;

            // 1. The node itself.
            const selfResult = await this.db.query(
                `SELECT * FROM outline_works WHERE id = $1`, [work_id]
            );
            if (selfResult.rows.length === 0) {
                return { content: [{ type: 'text', text: `Work ${work_id} not found.` }] };
            }
            const self = selfResult.rows[0];

            // 2. Ancestry (root -> self). Include pov_character_id so the brief
            //    can auto-populate present_character_ids from the scene's POV
            //    (and any ancestor that pins POV).
            const ancestryResult = await this.db.query(
                `WITH RECURSIVE up AS (
                     SELECT id, parent_id, work_type, sequence, title, summary, pov_character_id, 0 AS depth
                       FROM outline_works WHERE id = $1
                     UNION ALL
                     SELECT w.id, w.parent_id, w.work_type, w.sequence, w.title, w.summary, w.pov_character_id, u.depth + 1
                       FROM outline_works w JOIN up u ON w.id = u.parent_id
                 )
                 SELECT * FROM up ORDER BY depth DESC`,
                [work_id]
            );

            // Find series root for scoping.
            const rootId = ancestryResult.rows.find(r => !r.parent_id)?.id ?? null;

            // Auto-merge POV characters into present_character_ids.
            // Priority: self.pov_character_id, then any ancestor's, then explicit caller list.
            const autoIds = new Set();
            if (self.pov_character_id) autoIds.add(self.pov_character_id);
            for (const a of ancestryResult.rows) {
                if (a.pov_character_id) autoIds.add(a.pov_character_id);
            }
            const effectiveCharacterIds = Array.from(new Set([
                ...autoIds,
                ...present_character_ids
            ]));

            // 3. Events recorded on this node.
            const eventsResult = await this.db.query(
                `SELECT se.*,
                        f.statement AS fact_statement,
                        p.label AS promise_label,
                        ev.finding AS evidence_finding,
                        c.name AS character_name
                   FROM outline_scene_events se
                   LEFT JOIN outline_facts f ON se.fact_id = f.id
                   LEFT JOIN outline_promises p ON se.promise_id = p.id
                   LEFT JOIN outline_evidence_chain ev ON se.evidence_id = ev.id
                   LEFT JOIN characters c ON se.character_id = c.id
                  WHERE se.work_id = $1
                  ORDER BY se.ordering, se.id`,
                [work_id]
            );

            // 4. Open promises in scope: planted in the series, not yet paid.
            //    We surface ALL open ones for the series; the LLM picks which
            //    are candidates to advance/pay here.
            let openPromises = { rows: [] };
            if (rootId) {
                openPromises = await this.db.query(
                    `SELECT p.*, w.title AS planted_title, w.work_type AS planted_type
                       FROM outline_promises p
                       LEFT JOIN outline_works w ON p.planted_work_id = w.id
                      WHERE p.series_root_id = $1
                        AND p.status IN ('open','progressing')
                        AND p.payoff_work_id IS NULL
                      ORDER BY p.id`,
                    [rootId]
                );
            }

            // 5. Unconverted evidence in scope.
            let unconverted = { rows: [] };
            if (rootId) {
                unconverted = await this.db.query(
                    `SELECT e.*, w.title AS produced_title, w.work_type AS produced_type
                       FROM outline_evidence_chain e
                       LEFT JOIN outline_works w ON e.produced_work_id = w.id
                      WHERE e.series_root_id = $1
                        AND e.status = 'unconverted'
                      ORDER BY e.id`,
                    [rootId]
                );
            }

            // 6. Per-character knowledge state at this work.
            const knowledgeByChar = [];
            for (const cid of effectiveCharacterIds) {
                const charResult = await this.db.query(
                    `SELECT name FROM characters WHERE id = $1`, [cid]
                );
                const name = charResult.rows[0]?.name ?? `character#${cid}`;
                const k = await this.db.query(
                    `WITH RECURSIVE
                     ancestors AS (
                         SELECT id, parent_id FROM outline_works WHERE id = $1
                         UNION ALL
                         SELECT w.id, w.parent_id FROM outline_works w
                           JOIN ancestors a ON w.id = a.parent_id
                     ),
                     root AS (SELECT id FROM ancestors WHERE parent_id IS NULL LIMIT 1),
                     tree AS (
                         SELECT w.id, w.parent_id, ARRAY[w.sequence]::int[] AS path
                           FROM outline_works w, root WHERE w.id = root.id
                         UNION ALL
                         SELECT w.id, w.parent_id, t.path || w.sequence
                           FROM outline_works w JOIN tree t ON w.parent_id = t.id
                     ),
                     tp AS (SELECT path FROM tree WHERE id = $1),
                     preceding AS (
                         SELECT t.id FROM tree t, tp WHERE t.path <= tp.path
                     )
                     SELECT DISTINCT f.statement, f.fact_type, w.title AS work_title, w.work_type
                       FROM outline_scene_events se
                       JOIN outline_facts f ON se.fact_id = f.id
                       JOIN outline_works w ON se.work_id = w.id
                       JOIN preceding p ON se.work_id = p.id
                      WHERE se.event_type = 'reveals_fact'
                        AND se.character_id = $2
                      ORDER BY f.statement`,
                    [work_id, cid]
                );
                knowledgeByChar.push({ id: cid, name, facts: k.rows });
            }

            // Render.
            const lines = [];
            lines.push(`# Scene Brief — [${self.work_type}#${self.id}] ${self.title ?? '(untitled)'} (${self.status})`);
            lines.push('');

            lines.push('## Ancestry');
            for (const a of ancestryResult.rows) {
                if (a.id === self.id) continue;
                lines.push(`- [${a.work_type}#${a.id}] ${a.title ?? '(untitled)'}` +
                    (a.summary ? `\n    ${a.summary}` : ''));
            }
            lines.push('');

            lines.push('## This work');
            if (self.pov_character_id) {
                const povName = (await this.db.query(
                    `SELECT name FROM characters WHERE id = $1`, [self.pov_character_id]
                )).rows[0]?.name;
                lines.push(`**POV:** ${povName ?? `character#${self.pov_character_id}`}`);
            }
            if (self.summary) lines.push(`**Summary:** ${self.summary}`);
            if (self.content) lines.push(`\n${self.content}`);
            lines.push('');

            lines.push('## Scene events recorded here');
            if (eventsResult.rows.length === 0) {
                lines.push('_(none yet)_');
            } else {
                for (const e of eventsResult.rows) {
                    const refs = [];
                    if (e.fact_statement)     refs.push(`fact: ${e.fact_statement}`);
                    if (e.promise_label)      refs.push(`promise: ${e.promise_label}`);
                    if (e.evidence_finding)   refs.push(`evidence: ${e.evidence_finding}`);
                    if (e.character_name)     refs.push(`character: ${e.character_name}`);
                    lines.push(`- **${e.event_type}** — ${refs.join(' | ') || '(no refs)'}` +
                        (e.note ? `\n    ${e.note}` : ''));
                }
            }
            lines.push('');

            lines.push(`## Open promises (${openPromises.rows.length})`);
            if (openPromises.rows.length === 0) {
                lines.push('_(none)_');
            } else {
                for (const p of openPromises.rows) {
                    lines.push(`- #${p.id} [${p.promise_type ?? 'untyped'}] ${p.label}` +
                        (p.planted_title ? ` (planted: ${p.planted_type}#${p.planted_work_id})` : ''));
                }
            }
            lines.push('');

            lines.push(`## Unconverted evidence (${unconverted.rows.length})`);
            if (unconverted.rows.length === 0) {
                lines.push('_(none)_');
            } else {
                for (const e of unconverted.rows) {
                    lines.push(`- #${e.id} ${e.finding}` +
                        (e.who_acts_on_it ? ` — acts on it: ${e.who_acts_on_it}` : '') +
                        (e.action_gap_note ? `\n    gap: ${e.action_gap_note}` : ''));
                }
            }
            lines.push('');

            if (knowledgeByChar.length > 0) {
                lines.push('## Character knowledge at this point');
                for (const ch of knowledgeByChar) {
                    lines.push(`### ${ch.name} (#${ch.id}) knows ${ch.facts.length} fact(s)`);
                    if (ch.facts.length === 0) {
                        lines.push('_(nothing yet)_');
                    } else {
                        for (const f of ch.facts) {
                            lines.push(`- [${f.fact_type ?? 'untyped'}] ${f.statement}`);
                        }
                    }
                    lines.push('');
                }
            }

            return { content: [{ type: 'text', text: lines.join('\n') }] };
        } catch (err) {
            throw new Error(`get_scene_brief failed: ${err.message}`);
        }
    }
}
