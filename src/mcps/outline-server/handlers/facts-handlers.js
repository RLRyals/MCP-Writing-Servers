// src/mcps/outline-server/handlers/facts-handlers.js
// Atomic truth units. A fact is anything a character can know or not know.

import { factsToolsSchema } from '../schemas/outline-tools-schema.js';

export class FactsHandlers {
    constructor(db) {
        this.db = db;
    }

    getFactsTools() {
        return factsToolsSchema;
    }

    async handleCreateFact(args) {
        try {
            const { series_root_id, statement, fact_type, canonical_source, notes } = args;
            const result = await this.db.query(
                `INSERT INTO outline_facts (series_root_id, statement, fact_type, canonical_source, notes)
                 VALUES ($1,$2,$3,$4,$5) RETURNING *`,
                [series_root_id || null, statement, fact_type || null, canonical_source || null, notes || null]
            );
            const f = result.rows[0];
            return { content: [{ type: 'text', text:
                `Created fact #${f.id}.\nStatement: ${f.statement}\nType: ${f.fact_type ?? '(none)'}`
            }] };
        } catch (err) {
            throw new Error(`create_fact failed: ${err.message}`);
        }
    }

    async handleUpdateFact(args) {
        try {
            const { fact_id, statement, fact_type, canonical_source, notes } = args;
            const updates = [];
            const values = [];
            let p = 1;
            if (statement !== undefined)        { updates.push(`statement = $${p++}`);        values.push(statement); }
            if (fact_type !== undefined)        { updates.push(`fact_type = $${p++}`);        values.push(fact_type); }
            if (canonical_source !== undefined) { updates.push(`canonical_source = $${p++}`); values.push(canonical_source); }
            if (notes !== undefined)            { updates.push(`notes = $${p++}`);            values.push(notes); }
            if (updates.length === 0) {
                return { content: [{ type: 'text', text: 'No fields to update.' }] };
            }
            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(fact_id);
            const result = await this.db.query(
                `UPDATE outline_facts SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
                values
            );
            if (result.rows.length === 0) {
                return { content: [{ type: 'text', text: `Fact ${fact_id} not found.` }] };
            }
            const f = result.rows[0];
            return { content: [{ type: 'text', text:
                `Updated fact #${f.id}.\nStatement: ${f.statement}`
            }] };
        } catch (err) {
            throw new Error(`update_fact failed: ${err.message}`);
        }
    }

    async handleDeleteFact(args) {
        try {
            const { fact_id, confirm } = args;
            if (!confirm) {
                throw new Error('confirm must be true to delete.');
            }
            const result = await this.db.query(
                `DELETE FROM outline_facts WHERE id = $1 RETURNING id, statement`,
                [fact_id]
            );
            if (result.rows.length === 0) {
                return { content: [{ type: 'text', text: `Fact ${fact_id} not found.` }] };
            }
            return { content: [{ type: 'text', text:
                `Deleted fact #${result.rows[0].id}. Any scene_events referencing it had fact_id set to NULL.`
            }] };
        } catch (err) {
            throw new Error(`delete_fact failed: ${err.message}`);
        }
    }

    async handleListFacts(args) {
        try {
            const { series_root_id, fact_type, search } = args;
            const where = [];
            const values = [];
            let p = 1;
            if (series_root_id) { where.push(`series_root_id = $${p++}`); values.push(series_root_id); }
            if (fact_type)      { where.push(`fact_type = $${p++}`);      values.push(fact_type); }
            if (search)         { where.push(`statement ILIKE $${p++}`);  values.push(`%${search}%`); }

            const sql = `SELECT * FROM outline_facts ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`;
            const result = await this.db.query(sql, values);

            if (result.rows.length === 0) {
                return { content: [{ type: 'text', text: 'No facts found.' }] };
            }
            const lines = result.rows.map(f =>
                `#${f.id} [${f.fact_type ?? 'untyped'}] ${f.statement}` +
                (f.canonical_source ? `\n    source: ${f.canonical_source}` : '')
            );
            return { content: [{ type: 'text', text: `Found ${result.rows.length} fact(s):\n\n${lines.join('\n\n')}` }] };
        } catch (err) {
            throw new Error(`list_facts failed: ${err.message}`);
        }
    }
}
