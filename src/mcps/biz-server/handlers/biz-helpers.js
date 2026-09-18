// src/mcps/biz-server/handlers/biz-helpers.js
// Shared helpers for the biz-server handlers (bead mws-s0l).

// v1 surfaces operate on the first company -- callers never pass company_id,
// so every create resolves it here instead of assuming a hardcoded id.
// Migration 048 no longer seeds a company (mws-9ht); create one first with
// create_biz_company.
export async function getDefaultCompanyId(db) {
    const result = await db.query('SELECT id FROM fictionlab.biz_companies ORDER BY id LIMIT 1');
    if (result.rows.length === 0) {
        throw new Error('No fictionlab.biz_companies row exists -- create a company first (create_biz_company)');
    }
    return result.rows[0].id;
}

const RECURRENCE_INTERVALS = {
    monthly: '1 month',
    quarterly: '3 months',
    annual: '1 year'
};

export function recurrenceInterval(recurrence) {
    const interval = RECURRENCE_INTERVALS[recurrence];
    if (!interval) {
        throw new Error(`Unknown recurrence: ${recurrence}`);
    }
    return interval;
}
