// src/mcps/outline-server/handlers/works-handlers.js
// Outline hierarchy CRUD + zoom queries (get_outline, get_ancestry).
// outline_works is self-referential: series -> book -> act -> beat? -> chapter -> scene.

import { worksToolsSchema } from '../schemas/outline-tools-schema.js';

export class WorksHandlers {
    constructor(db) {
        this.db = db;
    }

    getWorksTools() {
        return worksToolsSchema;
    }

    async handleCreateWork(args) {
        try {
            const {
                parent_id, work_type, sequence, title, summary, content, status,
                legacy_series_id, legacy_book_id, legacy_chapter_id, legacy_scene_id
            } = args;

            if (work_type !== 'series' && !parent_id) {
                throw new Error('parent_id is required for any work_type other than "series".');
            }
            if (work_type === 'series' && parent_id) {
                throw new Error('A "series" work cannot have a parent_id.');
            }

            const result = await this.db.query(
                `INSERT INTO outline_works
                    (parent_id, work_type, sequence, title, summary, content, status,
                     legacy_series_id, legacy_book_id, legacy_chapter_id, legacy_scene_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                 RETURNING *`,
                [parent_id || null, work_type, sequence ?? 0, title || null,
                 summary || null, content || null, status || 'planned',
                 legacy_series_id || null, legacy_book_id || null,
                 legacy_chapter_id || null, legacy_scene_id || null]
            );

            const w = result.rows[0];
            return {
                content: [{ type: 'text', text:
                    `Created outline work.\n\n` +
                    `ID: ${w.id}\n` +
                    `Type: ${w.work_type}\n` +
                    `Parent: ${w.parent_id ?? '(root)'}\n` +
                    `Sequence: ${w.sequence}\n` +
                    `Title: ${w.title ?? '(none)'}\n` +
                    `Status: ${w.status}`
                }]
            };
        } catch (err) {
            throw new Error(`create_work failed: ${err.message}`);
        }
    }

    async handleUpdateWork(args) {
        try {
            const { work_id, title, summary, content, status, sequence } = args;

            const updates = [];
            const values = [];
            let p = 1;
            if (title !== undefined)    { updates.push(`title = $${p++}`);    values.push(title); }
            if (summary !== undefined)  { updates.push(`summary = $${p++}`);  values.push(summary); }
            if (content !== undefined)  { updates.push(`content = $${p++}`);  values.push(content); }
            if (status !== undefined)   { updates.push(`status = $${p++}`);   values.push(status); }
            if (sequence !== undefined) { updates.push(`sequence = $${p++}`); values.push(sequence); }

            if (updates.length === 0) {
                return { content: [{ type: 'text', text: 'No fields to update.' }] };
            }
            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(work_id);

            const result = await this.db.query(
                `UPDATE outline_works SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
                values
            );
            if (result.rows.length === 0) {
                return { content: [{ type: 'text', text: `No work found with ID ${work_id}.` }] };
            }
            const w = result.rows[0];
            return { content: [{ type: 'text', text:
                `Updated work ${w.id} (${w.work_type}).\nTitle: ${w.title ?? '(none)'}\nStatus: ${w.status}`
            }] };
        } catch (err) {
            throw new Error(`update_work failed: ${err.message}`);
        }
    }

    async handleMoveWork(args) {
        try {
            const { work_id, new_parent_id, new_sequence } = args;

            const cur = await this.db.query(
                `SELECT id, work_type, parent_id, sequence FROM outline_works WHERE id = $1`,
                [work_id]
            );
            if (cur.rows.length === 0) throw new Error(`Work ${work_id} not found.`);
            const w = cur.rows[0];

            if (new_parent_id !== undefined && new_parent_id !== null) {
                if (w.work_type === 'series') {
                    throw new Error('Cannot reparent a series root.');
                }
                // Prevent moving into own descendant
                const desc = await this.db.query(
                    `WITH RECURSIVE d AS (
                         SELECT id FROM outline_works WHERE id = $1
                         UNION ALL
                         SELECT c.id FROM outline_works c JOIN d ON c.parent_id = d.id
                     ) SELECT 1 FROM d WHERE id = $2`,
                    [work_id, new_parent_id]
                );
                if (desc.rows.length > 0) {
                    throw new Error('Cannot move a work into its own descendant.');
                }
            }

            const updates = [];
            const values = [];
            let p = 1;
            if (new_parent_id !== undefined) { updates.push(`parent_id = $${p++}`); values.push(new_parent_id); }
            if (new_sequence !== undefined)  { updates.push(`sequence = $${p++}`);  values.push(new_sequence); }
            if (updates.length === 0) {
                return { content: [{ type: 'text', text: 'No changes specified.' }] };
            }
            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(work_id);

            await this.db.query(
                `UPDATE outline_works SET ${updates.join(', ')} WHERE id = $${p}`,
                values
            );
            return { content: [{ type: 'text', text: `Moved work ${work_id}.` }] };
        } catch (err) {
            throw new Error(`move_work failed: ${err.message}`);
        }
    }

    async handleGetOutline(args) {
        try {
            const { work_id, depth = 2, include_content = true } = args;

            const result = await this.db.query(
                `WITH RECURSIVE tree AS (
                     SELECT id, parent_id, work_type, sequence, title, summary, content, status,
                            0 AS rel_depth,
                            ARRAY[sequence]::int[] AS path
                       FROM outline_works WHERE id = $1
                     UNION ALL
                     SELECT w.id, w.parent_id, w.work_type, w.sequence, w.title, w.summary, w.content, w.status,
                            t.rel_depth + 1,
                            t.path || w.sequence
                       FROM outline_works w
                       JOIN tree t ON w.parent_id = t.id
                      WHERE t.rel_depth < $2
                 )
                 SELECT * FROM tree ORDER BY path`,
                [work_id, depth]
            );

            if (result.rows.length === 0) {
                return { content: [{ type: 'text', text: `No work found with ID ${work_id}.` }] };
            }

            const lines = [];
            for (const r of result.rows) {
                const indent = '  '.repeat(r.rel_depth);
                const heading = '#'.repeat(Math.min(r.rel_depth + 1, 6));
                lines.push(`${indent}${heading} [${r.work_type}#${r.id}] ${r.title ?? '(untitled)'} (seq ${r.sequence}, ${r.status})`);
                if (r.summary) lines.push(`${indent}_${r.summary}_`);
                if (include_content && r.content) lines.push(`${indent}${r.content}`);
                lines.push('');
            }

            return { content: [{ type: 'text', text: lines.join('\n') }] };
        } catch (err) {
            throw new Error(`get_outline failed: ${err.message}`);
        }
    }

    async handleGetAncestry(args) {
        try {
            const { work_id } = args;

            const result = await this.db.query(
                `WITH RECURSIVE up AS (
                     SELECT id, parent_id, work_type, sequence, title, summary, 0 AS depth
                       FROM outline_works WHERE id = $1
                     UNION ALL
                     SELECT w.id, w.parent_id, w.work_type, w.sequence, w.title, w.summary, u.depth + 1
                       FROM outline_works w
                       JOIN up u ON w.id = u.parent_id
                 )
                 SELECT * FROM up ORDER BY depth DESC`,
                [work_id]
            );

            if (result.rows.length === 0) {
                return { content: [{ type: 'text', text: `No work found with ID ${work_id}.` }] };
            }

            const lines = result.rows.map(r =>
                `[${r.work_type}#${r.id}] ${r.title ?? '(untitled)'}` +
                (r.summary ? `\n    ${r.summary}` : '')
            );
            return { content: [{ type: 'text', text:
                `Ancestry (root -> self):\n\n${lines.join('\n\n')}`
            }] };
        } catch (err) {
            throw new Error(`get_ancestry failed: ${err.message}`);
        }
    }
}
