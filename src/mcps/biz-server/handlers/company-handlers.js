// src/mcps/biz-server/handlers/company-handlers.js
// list_biz_companies, create_biz_company, update_biz_company (bead mws-9ht).
// Closing a company is a status change, never a delete (table comment, S15 §0b).

const COMPANY_COLUMNS = 'id, name, legal_name, status, closed_on, notes, created_at, updated_at';

export class CompanyHandlers {
    constructor(db) {
        this.db = db;
    }

    async handleListBizCompanies() {
        const result = await this.db.query(
            `SELECT ${COMPANY_COLUMNS} FROM fictionlab.biz_companies ORDER BY id`
        );
        return { companies: result.rows };
    }

    async handleCreateBizCompany(args) {
        const { name, legal_name = null, notes = null } = args || {};
        if (!name || !String(name).trim()) {
            throw new Error('name is required');
        }
        const trimmed = String(name).trim();

        try {
            const result = await this.db.query(
                `INSERT INTO fictionlab.biz_companies (name, legal_name, notes)
                 VALUES ($1, $2, $3) RETURNING ${COMPANY_COLUMNS}`,
                [trimmed, legal_name, notes]
            );
            return { company: result.rows[0] };
        } catch (error) {
            if (error.code === '23505') {
                throw new Error(`A company named "${trimmed}" already exists`);
            }
            throw error;
        }
    }

    async handleUpdateBizCompany(args) {
        const { id, name, legal_name, notes, status, closed_on } = args || {};
        if (!id) {
            throw new Error('id is required');
        }
        if (status !== undefined && !['active', 'closed'].includes(status)) {
            throw new Error('status must be "active" or "closed"');
        }

        const sets = [];
        const params = [id];
        const add = (col, val) => {
            params.push(val);
            sets.push(`${col} = $${params.length}`);
        };
        if (name !== undefined) {
            if (!String(name).trim()) throw new Error('name cannot be empty');
            add('name', String(name).trim());
        }
        if (legal_name !== undefined) add('legal_name', legal_name);
        if (notes !== undefined) add('notes', notes);
        if (status === 'active') {
            add('status', 'active');
            sets.push('closed_on = NULL');
        } else if (status === 'closed') {
            add('status', 'closed');
            if (closed_on !== undefined) add('closed_on', closed_on);
            else sets.push('closed_on = COALESCE(closed_on, CURRENT_DATE)');
        } else if (closed_on !== undefined) {
            add('closed_on', closed_on);
        }
        if (sets.length === 0) {
            throw new Error('No fields to update');
        }
        sets.push('updated_at = NOW()');

        try {
            const result = await this.db.query(
                `UPDATE fictionlab.biz_companies SET ${sets.join(', ')}
                 WHERE id = $1 RETURNING ${COMPANY_COLUMNS}`,
                params
            );
            if (result.rows.length === 0) {
                throw new Error(`Company not found: ${id}`);
            }
            return { company: result.rows[0] };
        } catch (error) {
            if (error.code === '23505') {
                throw new Error(`A company named "${String(name).trim()}" already exists`);
            }
            throw error;
        }
    }
}
