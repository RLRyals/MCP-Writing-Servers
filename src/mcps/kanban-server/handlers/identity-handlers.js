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

export class IdentityHandlers {
    constructor(db) {
        this.db = db;
    }

    /**
     * list_identities — all registered identities, optionally filtered by
     * kind, optionally including inactive ones (default: active only).
     */
    async handleListIdentities(args) {
        const { kind, include_inactive = false } = args || {};

        const conditions = [];
        const params = [];
        let i = 1;

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
}
