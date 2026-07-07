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
        if (agent === 'rebecca') {
            throw new Error("agent must not be 'rebecca' — claim_card is for agent identities only (session-scoped claude-code:<sessionLabel> or a .kcpps config id)");
        }
        if (!['claimed', 'in_progress'].includes(move_to)) {
            throw new Error(`Invalid move_to: ${move_to}`);
        }

        // The atomic compare-and-swap. Every predicate in the WHERE clause is
        // independent defense-in-depth against the same failure mode (an
        // agent ending up with a card that belongs to Rebecca):
        //   - status = expected_status         -> still in the pool the caller thinks it's in
        //   - agent_claimable = TRUE           -> not reserved (kept true by the DB trigger)
        //   - assignee IS DISTINCT FROM 'rebecca' -> human cards NEVER agent-claimable
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
                AND assignee IS DISTINCT FROM 'rebecca'
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
        if (card.assignee === 'rebecca' || !card.agent_claimable) {
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
