// src/mcps/outline-server/handlers/evidence-handlers.js
// Evidence chain: forensic-tech protagonist produces findings she cannot
// directly act on. Forces every finding to answer who_acts_on_it and what
// the action_gap costs (off-books, social capital, etc.).

import { evidenceToolsSchema } from '../schemas/outline-tools-schema.js';

export class EvidenceHandlers {
    constructor(db) {
        this.db = db;
    }

    getEvidenceTools() {
        return evidenceToolsSchema;
    }

    async handleCreateEvidence(args) {
        try {
            const { series_root_id, produced_work_id, finding,
                    who_acts_on_it, action_gap_note, notes } = args;
            const result = await this.db.query(
                `INSERT INTO outline_evidence_chain
                    (series_root_id, produced_work_id, finding, who_acts_on_it,
                     action_gap_note, notes)
                 VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
                [series_root_id || null, produced_work_id || null, finding,
                 who_acts_on_it || null, action_gap_note || null, notes || null]
            );
            const e = result.rows[0];
            return { content: [{ type: 'text', text:
                `Created evidence #${e.id}.\n` +
                `Finding: ${e.finding}\n` +
                `Produced at work: ${e.produced_work_id ?? '(none)'}\n` +
                `Acts on it: ${e.who_acts_on_it ?? '(undecided)'}\n` +
                `Action gap: ${e.action_gap_note ?? '(undecided)'}\n` +
                `Status: ${e.status}`
            }] };
        } catch (err) {
            throw new Error(`create_evidence failed: ${err.message}`);
        }
    }

    async handleUpdateEvidence(args) {
        try {
            const { evidence_id, finding, who_acts_on_it, action_gap_note,
                    converted_work_id, status, notes } = args;

            const updates = [];
            const values = [];
            let p = 1;
            if (finding !== undefined)           { updates.push(`finding = $${p++}`);           values.push(finding); }
            if (who_acts_on_it !== undefined)    { updates.push(`who_acts_on_it = $${p++}`);    values.push(who_acts_on_it); }
            if (action_gap_note !== undefined)   { updates.push(`action_gap_note = $${p++}`);   values.push(action_gap_note); }
            if (converted_work_id !== undefined) { updates.push(`converted_work_id = $${p++}`); values.push(converted_work_id); }
            if (status !== undefined)            { updates.push(`status = $${p++}`);            values.push(status); }
            if (notes !== undefined)             { updates.push(`notes = $${p++}`);             values.push(notes); }

            if (updates.length === 0) {
                return { content: [{ type: 'text', text: 'No fields to update.' }] };
            }
            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(evidence_id);

            const result = await this.db.query(
                `UPDATE outline_evidence_chain SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
                values
            );
            if (result.rows.length === 0) {
                return { content: [{ type: 'text', text: `Evidence ${evidence_id} not found.` }] };
            }
            const e = result.rows[0];
            return { content: [{ type: 'text', text:
                `Updated evidence #${e.id}.\nStatus: ${e.status}\nConverted at work: ${e.converted_work_id ?? '(none)'}`
            }] };
        } catch (err) {
            throw new Error(`update_evidence failed: ${err.message}`);
        }
    }

    async handleListUnconvertedEvidence(args) {
        try {
            const { series_root_id, scope_work_id } = args;

            const where = [`e.status = 'unconverted'`];
            const values = [];
            let i = 1;
            if (series_root_id) { where.push(`e.series_root_id = $${i++}`); values.push(series_root_id); }

            let sql;
            if (scope_work_id) {
                sql = `
                    WITH RECURSIVE subtree AS (
                        SELECT id FROM outline_works WHERE id = $${i}
                        UNION ALL
                        SELECT w.id FROM outline_works w JOIN subtree s ON w.parent_id = s.id
                    )
                    SELECT e.*, w.title AS produced_title, w.work_type AS produced_type
                      FROM outline_evidence_chain e
                      LEFT JOIN outline_works w ON e.produced_work_id = w.id
                     WHERE e.produced_work_id IN (SELECT id FROM subtree)
                       AND ${where.join(' AND ')}
                     ORDER BY e.id`;
                values.push(scope_work_id);
            } else {
                sql = `
                    SELECT e.*, w.title AS produced_title, w.work_type AS produced_type
                      FROM outline_evidence_chain e
                      LEFT JOIN outline_works w ON e.produced_work_id = w.id
                     WHERE ${where.join(' AND ')}
                     ORDER BY e.id`;
            }

            const result = await this.db.query(sql, values);
            if (result.rows.length === 0) {
                return { content: [{ type: 'text', text: 'No unconverted evidence.' }] };
            }
            const lines = result.rows.map(e =>
                `#${e.id} ${e.finding}\n` +
                `    produced: ${e.produced_title ? `${e.produced_type}#${e.produced_work_id} ${e.produced_title}` : '(unset)'}\n` +
                `    acts on it: ${e.who_acts_on_it ?? '(undecided)'}\n` +
                `    action gap: ${e.action_gap_note ?? '(undecided)'}`
            );
            return { content: [{ type: 'text', text:
                `${result.rows.length} unconverted finding(s):\n\n${lines.join('\n\n')}`
            }] };
        } catch (err) {
            throw new Error(`list_unconverted_evidence failed: ${err.message}`);
        }
    }
}
