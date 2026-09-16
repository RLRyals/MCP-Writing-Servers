// src/mcps/biz-server/handlers/biz-helpers.js
// Shared helpers for the biz-server handlers (bead mws-s0l).

// v1 is single-company (S15 §0b seeds exactly one row, 'Broad Quill', in
// migration 048) -- callers never pass company_id, so every create resolves
// it here instead of assuming a hardcoded id.
export async function getDefaultCompanyId(db) {
    const result = await db.query('SELECT id FROM fictionlab.biz_companies ORDER BY id LIMIT 1');
    if (result.rows.length === 0) {
        throw new Error('No fictionlab.biz_companies row exists -- migration 048 must run first');
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
