// src/mcps/kanban-server/handlers/claim-handlers.js
// claim_card — the atomic compare-and-swap. This is the entire correctness
// mechanism for "two agents can never both win a card": a single conditional
// UPDATE ... RETURNING relies on Postgres row locking to guarantee exactly
// one concurrent caller matches. No transaction/advisory-lock gymnastics
// needed (S11 issue #58 §2c / spec §4c).

import { logActivity, notifyKanbanChanged } from './kanban-helpers.js';

export class ClaimHandlers {
    constructor(db) {
        this.db = db;
    }

    async handleClaimCard(args) {
        const { card_id, agent, expected_status = 'ready', move_to = 'claimed' } = args || {};

        if (!card_id) {
            throw new Error('card_id is required');
        }
        if (!agent) {
            throw new Error('agent is required');
        }

        // Generalizes the old hardcoded `agent === 'rebecca'` check to any
        // registered active human identity (GH issue #62 — the gate must be
        // identity-kind-driven, not name-driven: 'mom' or a future hire must
        // be blocked here exactly like 'rebecca' always was). The literal
        // 'rebecca' comparison is kept alongside as a fail-safe in case the
        // seed row is ever missing/inactive.
        const identityResult = await this.db.query(
            'SELECT kind FROM fictionlab.kanban_identities WHERE id = $1 AND active',
            [agent]
        );
        const agentIdentityKind = identityResult.rows[0]?.kind;
        if (agent === 'rebecca' || agentIdentityKind === 'human') {
            throw new Error(
                `agent must not be a human identity ('${agent}') — claim_card is for agent/persona identities only (session-scoped claude-code:<sessionLabel>, a .kcpps config id, or a persona claiming on its own behalf)`
            );
        }
        if (!['claimed', 'in_progress'].includes(move_to)) {
            throw new Error(`Invalid move_to: ${move_to}`);
        }

        // Self-register this agent id as kind='agent' (idempotent, ON
        // CONFLICT DO NOTHING) the first time it's ever seen claiming. This
        // keeps the kanban_enforce_human_reserve trigger's fail-safe
        // ("unrecognized assignee -> treat as human") from misfiring on the
        // claim's own UPDATE below and flipping agent_claimable back off for
        // a card an agent legitimately just won. An id already registered
        // (e.g. a persona claiming as itself) is left untouched — its
        // existing kind stands.
        if (!agentIdentityKind) {
            await this.db.query(
                `INSERT INTO fictionlab.kanban_identities (id, display_name, kind)
                 VALUES ($1, $2, 'agent')
                 ON CONFLICT (id) DO NOTHING`,
                [agent, agent]
            );
        }

        // The atomic compare-and-swap. Every predicate in the WHERE clause is
        // independent defense-in-depth against the same failure mode (an
        // agent ending up with a card reserved for a human):
        //   - status = expected_status  -> still in the pool the caller thinks it's in
        //   - agent_claimable = TRUE    -> not reserved (kept true by the DB trigger)
        //   - NOT EXISTS (... kind='human' ...) -> human-assigned cards NEVER agent-claimable
        //   - assignee IS NULL OR assignee = agent -> unassigned pool, or already this agent's
        const result = await this.db.query(
            `UPDATE fictionlab.kanban_cards
                SET status     = $2,
                    assignee   = $3,
                    claimed_by = $3,
                    claimed_at = NOW()
              WHERE id = $1
                AND status = $4
                AND agent_claimable = TRUE
                AND NOT EXISTS (
                    SELECT 1 FROM fictionlab.kanban_identities ki
                    WHERE ki.id = assignee AND ki.kind = 'human' AND ki.active
                )
                AND (assignee IS NULL OR assignee = $3)
              RETURNING *`,
            [card_id, move_to, agent, expected_status]
        );

        if (result.rows.length > 0) {
            const card = result.rows[0];

            await logActivity(this.db, {
                boardId: card.board_id,
                cardId: card.id,
                actor: agent,
                action: 'claimed',
                fromStatus: expected_status,
                toStatus: move_to,
                detail: { agent }
            });
            await notifyKanbanChanged(this.db, card.id);

            return { claimed: true, card };
        }

        // 0 rows returned -> the claim lost (or the card/agent combo was never
        // eligible). Inspect the current row to return the precise reason.
        const current = await this.db.query('SELECT * FROM fictionlab.kanban_cards WHERE id = $1', [card_id]);

        if (current.rows.length === 0) {
            return { claimed: false, reason: 'not_found' };
        }

        const card = current.rows[0];
        const reason = this.inferDenyReason(card, { agent, expectedStatus: expected_status });

        await logActivity(this.db, {
            boardId: card.board_id,
            cardId: card.id,
            actor: agent,
            action: 'claim_denied',
            detail: { reason, agent, expected_status }
        });

        return { claimed: false, reason };
    }

    inferDenyReason(card, { agent, expectedStatus }) {
        // agent_claimable is kept accurate by the kanban_enforce_human_reserve
        // trigger for every identity (not just 'rebecca') — a single check
        // here is now sufficient (GH issue #62).
        if (!card.agent_claimable) {
            return 'reserved_for_human';
        }

        if (card.status !== expectedStatus) {
            // Status moved away from what the caller expected. If it looks like
            // it was actually claimed (claimed_by/assignee set), that's a lost
            // race; otherwise the card was simply never in the right lane to
            // begin with.
            return card.claimed_by || card.assignee ? 'already_claimed' : 'wrong_status';
        }

        if (card.assignee && card.assignee !== agent) {
            return 'already_claimed';
        }

        return 'wrong_status';
    }
}
