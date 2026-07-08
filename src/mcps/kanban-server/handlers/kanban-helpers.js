// src/mcps/kanban-server/handlers/kanban-helpers.js
// Small shared utilities used by all four kanban handler classes
// (board/card/claim/comment-handlers). Kept together so the activity-log +
// NOTIFY side effects can never drift out of sync between mutation tools.

/**
 * Resolve a board_id from either an explicit board_id, a board_key, or (for
 * the create_card quick-add fast path) a default board_key. Throws if the
 * board can't be found.
 */
export async function resolveBoardId(db, { board_id, board_key, defaultBoardKey } = {}) {
    if (board_id) {
        return board_id;
    }

    const key = board_key || defaultBoardKey;
    if (!key) {
        throw new Error('board_key or board_id is required');
    }

    const result = await db.query(
        'SELECT id FROM fictionlab.kanban_boards WHERE board_key = $1',
        [key]
    );

    if (result.rows.length === 0) {
        throw new Error(`Board not found: ${key}`);
    }

    return result.rows[0].id;
}

/**
 * Append a row to the append-only kanban_activity log. Every mutation tool
 * calls this exactly once (claim_card writes an extra claim_denied row on a
 * lost race, on top of its own claimed row when it wins).
 */
export async function logActivity(db, { boardId, cardId, actor, action, fromStatus, toStatus, detail }) {
    await db.query(
        `INSERT INTO fictionlab.kanban_activity
            (board_id, card_id, actor, action, from_status, to_status, detail)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
            boardId || null,
            cardId || null,
            actor || 'unknown',
            action,
            fromStatus || null,
            toStatus || null,
            detail ? JSON.stringify(detail) : '{}'
        ]
    );
}

/**
 * Emit NOTIFY kanban_changed, '<card_id>' on the shared pool connection so a
 * LISTENer (the Electron plugin, per S11 decision 3) can push instant board
 * updates instead of polling. Uses pg_notify() rather than a literal NOTIFY
 * statement because pg_notify() accepts bound parameters — a plain
 * `NOTIFY channel, 'payload'` cannot be parameterized.
 */
export async function notifyKanbanChanged(db, cardId) {
    await db.query('SELECT pg_notify($1, $2)', ['kanban_changed', String(cardId)]);
}

/**
 * S11 §11.5 (decision 5): default review_policy by risk class at create_card
 * time. This can't be a DB column default because it needs to inspect the
 * card's content (labels / spec_ref / issue_ref / title / body) — anything
 * that looks like it touches live workflow definitions, DB migrations, the
 * executor / run-workflow skill, or shared skills/configs defaults to
 * 'review-required'; docs/specs/reports/analysis-only cards default to
 * 'auto-done'. When ambiguous, default to the SAFE side ('review-required') —
 * agents may escalate a card to review-required but must never downgrade it
 * themselves, so an over-cautious default is the correct failure mode.
 */
/**
 * Validate an assignee id against fictionlab.kanban_identities before it's
 * written via create_card/update_card (GH issue #62 — the human-gate must be
 * identity-kind-driven, not name-driven). Unknown ids are REJECTED here, no
 * silent auto-create — the error lists every known active identity so the
 * caller can pick a real one or register a new one via upsert_identity.
 *
 * This is the primary gate. The DB trigger (kanban_enforce_human_reserve,
 * migration 044) is separate, fail-safe defense-in-depth for a write that
 * bypasses this validation entirely (e.g. raw SQL) — it treats an
 * unrecognized assignee as human rather than silently leaving it
 * agent-claimable.
 *
 * Pass-through, no-op cases: assignee is falsy (unset) or the '__clear__'
 * unassign sentinel — both are always allowed.
 */
export async function validateAssignee(db, assignee) {
    if (!assignee || assignee === '__clear__') {
        return;
    }

    const result = await db.query(
        'SELECT 1 FROM fictionlab.kanban_identities WHERE id = $1 AND active',
        [assignee]
    );

    if (result.rows.length === 0) {
        const known = await db.query(
            'SELECT id FROM fictionlab.kanban_identities WHERE active ORDER BY id'
        );
        const knownIds = known.rows.map((r) => r.id).join(', ') || '(none registered)';
        throw new Error(
            `Unknown assignee '${assignee}'. Known identities: ${knownIds}. Register it first via upsert_identity.`
        );
    }
}

export function inferReviewPolicy({ labels = [], spec_ref, issue_ref, title, body } = {}) {
    const haystack = [
        ...(Array.isArray(labels) ? labels : []),
        spec_ref || '',
        issue_ref || '',
        title || '',
        body || ''
    ].join(' ').toLowerCase();

    const highRiskPatterns = [
        /migrations?[\\/]/,
        /\bmigration\b/,
        /workflow[-_ ]?definitions?/,
        /workflow-manager/,
        /run-?workflow/,
        /\bexecutor\b/,
        /\bskills?[\\/]/,
        /shared[\\/]?configs?/,
        /\.kcpps/,
        /\bkanban-server\b/
    ];

    if (highRiskPatterns.some((re) => re.test(haystack))) {
        return 'review-required';
    }

    const lowRiskPatterns = [
        /\bdocs?[\\/]/,
        /\bspecs?[\\/]/,
        /\breports?[\\/]/,
        /analysis[-_ ]?only/,
        /docs?[-_ ]?only/,
        /\breadme\b/
    ];

    if (lowRiskPatterns.some((re) => re.test(haystack))) {
        return 'auto-done';
    }

    // Ambiguous / no signal at all -> safe default.
    return 'review-required';
}
