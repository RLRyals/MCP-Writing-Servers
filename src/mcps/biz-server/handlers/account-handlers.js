// src/mcps/biz-server/handlers/account-handlers.js
// list_biz_accounts, create_biz_account (bead mws-817).

const ACCOUNT_COLUMNS = 'id, company_id, name, account_type, institution, currency, opening_balance, credit_limit, apr, statement_day, is_archived, notes, created_at, updated_at';
const ACCOUNT_TYPES = ['checking', 'savings', 'credit_card', 'payment_processor', 'other'];

export class AccountHandlers {
    constructor(db) {
        this.db = db;
    }

    async handleListBizAccounts(args) {
        const { company_id, include_archived = false } = args || {};
        const params = [];
        const where = [];
        if (company_id !== undefined && company_id !== null) {
            params.push(company_id);
            where.push(`company_id = $${params.length}`);
        }
        if (!include_archived) where.push('is_archived = FALSE');
        const result = await this.db.query(
            `SELECT ${ACCOUNT_COLUMNS} FROM fictionlab.biz_accounts
             ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`,
            params
        );
        return { accounts: result.rows };
    }

    async handleCreateBizAccount(args) {
        const {
            company_id, name, account_type = 'checking', institution = null, currency = 'USD',
            opening_balance = 0, credit_limit = null, apr = null, statement_day = null, notes = null
        } = args || {};
        if (!company_id) throw new Error('company_id is required');
        if (!name || !String(name).trim()) throw new Error('name is required');
        if (!ACCOUNT_TYPES.includes(account_type)) {
            throw new Error(`account_type must be one of: ${ACCOUNT_TYPES.join(', ')}`);
        }

        try {
            const result = await this.db.query(
                `INSERT INTO fictionlab.biz_accounts
                    (company_id, name, account_type, institution, currency, opening_balance, credit_limit, apr, statement_day, notes)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${ACCOUNT_COLUMNS}`,
                [company_id, String(name).trim(), account_type, institution, currency,
                    opening_balance, credit_limit, apr, statement_day, notes]
            );
            return { account: result.rows[0] };
        } catch (error) {
            if (error.code === '23503') {
                throw new Error(`Company not found: ${company_id}`);
            }
            throw error;
        }
    }
}
