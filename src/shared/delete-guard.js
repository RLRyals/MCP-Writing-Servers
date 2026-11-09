// src/shared/delete-guard.js
// Shared helper for delete_* tools: count rows that still reference a record so
// the handler can refuse (never cascade, never silently null-out references).

const MISSING_SCHEMA_CODES = new Set(['42P01', '42703']); // undefined_table, undefined_column

/**
 * @param db   object with query(sql, params)
 * @param deps [{ table, column, label, where? }]  where = extra static SQL condition
 * @param id   id of the record about to be deleted
 * @returns    [{ label, table, column, count }] for dependents with count > 0
 */
export async function findDependents(db, deps, id) {
    const found = [];
    for (const dep of deps) {
        const extra = dep.where ? ` AND ${dep.where}` : '';
        try {
            const res = await db.query(
                `SELECT COUNT(*)::int AS count FROM ${dep.table} WHERE ${dep.column} = $1${extra}`,
                [id]
            );
            const count = Number(res.rows[0]?.count || 0);
            if (count > 0) {
                found.push({ label: dep.label, table: dep.table, column: dep.column, count });
            }
        } catch (error) {
            // A table/column from an optional migration may not exist in this database.
            if (!MISSING_SCHEMA_CODES.has(error.code)) throw error;
        }
    }
    return found;
}

export function referencedResponse(kind, id, dependents) {
    return {
        error: 'has_dependents',
        message: `${kind} ${id} is still referenced: ` +
            `${dependents.map(d => `${d.label} (${d.count})`).join(', ')}. ` +
            `Remove or reassign those first; nothing was deleted.`,
        dependents
    };
}
