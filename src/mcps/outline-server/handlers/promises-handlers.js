// src/mcps/outline-server/handlers/promises-handlers.js
// Unified promise ledger: clues, setups, foreshadowing, threads, romance beats.

import { promisesToolsSchema } from '../schemas/outline-tools-schema.js';

export class PromisesHandlers {
    constructor(db) {
        this.db = db;
    }

    getPromisesTools() {
        return promisesToolsSchema;
    }

    async handleCreatePromise(args) {
        try {
            const { series_root_id, promise_type, label, description,
                    planted_work_id, carries_to_series, notes } = args;
            const result = await this.db.query(
                `INSERT INTO outline_promises
                    (series_root_id, promise_type, label, description, planted_work_id,
                     carries_to_series, notes)
                 VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
                [series_root_id || null, promise_type || null, label,
                 description || null, planted_work_id || null,
                 !!carries_to_series, notes || null]
            );
            const pr = result.rows[0];
            return { content: [{ type: 'text', text:
                `Created promise #${pr.id}.\n` +
                `Label: ${pr.label}\n` +
                `Type: ${pr.promise_type ?? '(untyped)'}\n` +
                `Planted at work: ${pr.planted_work_id ?? '(unplanted)'}\n` +
                `Status: ${pr.status}\n` +
                `Carries to series: ${pr.carries_to_series}`
            }] };
        } catch (err) {
            throw new Error(`create_promise failed: ${err.message}`);
        }
    }

    async handleUpdatePromise(args) {
        try {
            const { promise_id, label, description, planted_work_id, payoff_work_id,
                    status, carries_to_series, notes } = args;

            const updates = [];
            const values = [];
            let p = 1;
            if (label !== undefined)             { updates.push(`label = $${p++}`);              values.push(label); }
            if (description !== undefined)       { updates.push(`description = $${p++}`);        values.push(description); }
            if (planted_work_id !== undefined)   { updates.push(`planted_work_id = $${p++}`);    values.push(planted_work_id); }
            if (payoff_work_id !== undefined)    { updates.push(`payoff_work_id = $${p++}`);     values.push(payoff_work_id); }
            if (status !== undefined)            { updates.push(`status = $${p++}`);             values.push(status); }
            if (carries_to_series !== undefined) { updates.push(`carries_to_series = $${p++}`);  values.push(!!carries_to_series); }
            if (notes !== undefined)             { updates.push(`notes = $${p++}`);              values.push(notes); }

            if (updates.length === 0) {
                return { content: [{ type: 'text', text: 'No fields to update.' }] };
            }
            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(promise_id);

            const result = await this.db.query(
                `UPDATE outline_promises SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
                values
            );
            if (result.rows.length === 0) {
                return { content: [{ type: 'text', text: `Promise ${promise_id} not found.` }] };
            }
            const pr = result.rows[0];
            return { content: [{ type: 'text', text:
                `Updated promise #${pr.id}.\nStatus: ${pr.status}\nPayoff at work: ${pr.payoff_work_id ?? '(none)'}`
            }] };
        } catch (err) {
            throw new Error(`update_promise failed: ${err.message}`);
        }
    }

    async handleListOpenPromises(args) {
        try {
            const { series_root_id, scope_work_id, promise_type } = args;

            const where = [`p.status IN ('open','progressing')`, `p.payoff_work_id IS NULL`];
            const values = [];
            let i = 1;
            if (series_root_id) { where.push(`p.series_root_id = $${i++}`); values.push(series_root_id); }
            if (promise_type)   { where.push(`p.promise_type = $${i++}`);   values.push(promise_type); }

            let sql;
            if (scope_work_id) {
                // Limit to promises planted within the subtree rooted at scope_work_id.
                sql = `
                    WITH RECURSIVE subtree AS (
                        SELECT id FROM outline_works WHERE id = $${i}
                        UNION ALL
                        SELECT w.id FROM outline_works w JOIN subtree s ON w.parent_id = s.id
                    )
                    SELECT p.*, w.title AS planted_title, w.work_type AS planted_type
                      FROM outline_promises p
                      LEFT JOIN outline_works w ON p.planted_work_id = w.id
                     WHERE p.planted_work_id IN (SELECT id FROM subtree)
                       AND ${where.join(' AND ')}
                     ORDER BY p.id`;
                values.push(scope_work_id);
            } else {
                sql = `
                    SELECT p.*, w.title AS planted_title, w.work_type AS planted_type
                      FROM outline_promises p
                      LEFT JOIN outline_works w ON p.planted_work_id = w.id
                     WHERE ${where.join(' AND ')}
                     ORDER BY p.id`;
            }

            const result = await this.db.query(sql, values);
            if (result.rows.length === 0) {
                return { content: [{ type: 'text', text: 'No open promises.' }] };
            }
            const lines = result.rows.map(p =>
                `#${p.id} [${p.promise_type ?? 'untyped'}] ${p.label}\n` +
                `    planted: ${p.planted_title ? `${p.planted_type}#${p.planted_work_id} ${p.planted_title}` : '(unplanted)'}\n` +
                `    status: ${p.status}` +
                (p.description ? `\n    desc: ${p.description}` : '') +
                (p.carries_to_series ? `\n    carries to next series` : '')
            );
            return { content: [{ type: 'text', text:
                `${result.rows.length} open promise(s):\n\n${lines.join('\n\n')}`
            }] };
        } catch (err) {
            throw new Error(`list_open_promises failed: ${err.message}`);
        }
    }
}
