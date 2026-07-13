// src/mcps/kanban-server/handlers/identity-handlers.js
// list_identities + upsert_identity — the identities model backing the
// human-claimable gate (GH issue #62). fictionlab.kanban_identities maps a
// kanban_cards.assignee value to a kind: 'human' (never agent-claimable),
// 'persona' (agent-claimable — an agent may act as a pen name/persona), or
// 'agent' (agent-claimable — a registered agent/worker identity).
// create_card/update_card validate assignee against this table and reject
// unknown ids (see kanban-helpers.js validateAssignee) — upsert_identity is
// the only way to register a new one; there is no silent auto-create.

const IDENTITY_KINDS = ['human', 'persona', 'agent'];

// Reserved id namespace for throwaway ids minted by tests (bead
// mws-1783883496146-1). Any test that mints an agent/persona id it doesn't
// permanently want in the registry MUST prefix it 'test:' — list_identities
// unconditionally filters this namespace out (see handleListIdentities)
// regardless of whether the row ever gets cleaned up.
export const TEST_NAMESPACE_PREFIX = 'test:';

export class IdentityHandlers {
    constructor(db) {
        this.db = db;
    }

    /**
     * list_identities — all registered identities, optionally filtered by
     * kind, optionally including inactive ones (default: active only).
     *
     * Always excludes the `test:` id namespace (bead mws-1783883496146-1 —
     * concurrent-claim-test.js and any other test that mints throwaway agent
     * ids MUST prefix them 'test:...'). This is unconditional, not an
     * include_inactive-style opt-in: the assignee dropdown this feeds must
     * never surface test junk, and there is no legitimate caller that needs
     * test: ids back.
     */
    async handleListIdentities(args) {
        const { kind, include_inactive = false } = args || {};

        const conditions = [];
        const params = [];
        let i = 1;

        conditions.push(`id NOT LIKE $${i++}`);
        params.push(`${TEST_NAMESPACE_PREFIX}%`);

        if (kind) {
            if (!IDENTITY_KINDS.includes(kind)) {
                throw new Error(`Invalid kind: ${kind}`);
            }
            conditions.push(`kind = $${i++}`);
            params.push(kind);
        }

        if (!include_inactive) {
            conditions.push('active = TRUE');
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await this.db.query(
            `SELECT * FROM fictionlab.kanban_identities ${whereClause} ORDER BY id`,
            params
        );

        return { identities: result.rows };
    }

    /**
     * upsert_identity — register a new identity or update an existing one's
     * display_name/kind/active. This is the ONLY sanctioned way to add an
     * assignee value that create_card/update_card will accept — there is no
     * silent auto-create on write.
     */
    async handleUpsertIdentity(args) {
        const { id, display_name, kind, active = true } = args || {};

        if (!id) {
            throw new Error('id is required');
        }
        if (!kind || !IDENTITY_KINDS.includes(kind)) {
            throw new Error(`kind is required and must be one of: ${IDENTITY_KINDS.join(', ')}`);
        }

        const result = await this.db.query(
            `INSERT INTO fictionlab.kanban_identities (id, display_name, kind, active)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO UPDATE
                SET display_name = EXCLUDED.display_name,
                    kind         = EXCLUDED.kind,
                    active       = EXCLUDED.active
             RETURNING *`,
            [id, display_name || id, kind, active]
        );

        return { identity: result.rows[0] };
    }

    /**
     * delete_identity — hard-remove an identity row (bead
     * mws-1783883496146-1, acceptance criterion: "a supported path to
     * remove or hide an identity that should not be offered as an
     * assignee"). upsert_identity(active:false) already gives a soft-hide
     * path (list_identities excludes inactive rows by default), but there
     * was previously no way to remove a row outright — this is that path,
     * for cleanup scripts and mis-registered/throwaway ids alike.
     *
     * No FK enforced against kanban_cards.assignee (migration 044, by
     * design), so this never fails on a foreign-key violation; any card
     * still pointing at a deleted id simply falls through
     * kanban_enforce_human_reserve's fail-safe branch (unrecognized
     * assignee -> treated as human, not agent-claimable) the next time that
     * card is written.
     */
    async handleDeleteIdentity(args) {
        const { id } = args || {};

        if (!id) {
            throw new Error('id is required');
        }

        const result = await this.db.query(
            'DELETE FROM fictionlab.kanban_identities WHERE id = $1 RETURNING *',
            [id]
        );

        return { deleted: result.rows.length > 0, identity: result.rows[0] || null };
    }
}
