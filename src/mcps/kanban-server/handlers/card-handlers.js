// src/mcps/kanban-server/handlers/card-handlers.js
// Card CRUD + lifecycle tools: list_cards, create_card, update_card,
// move_card, plus the supporting get_card / add_card_link / archive_card.
// claim_card lives in claim-handlers.js — the atomic compare-and-swap is
// kept in exactly one place.

import { resolveBoardId, logActivity, notifyKanbanChanged, inferReviewPolicy, validateAssignee } from './kanban-helpers.js';

const CARD_STATUSES = ['backlog', 'ready', 'claimed', 'in_progress', 'review', 'blocked', 'done', 'archived'];

export class CardHandlers {
    constructor(db) {
        this.db = db;
    }

    /**
     * list_cards — the workhorse filter. board_key/board_id, assignee, agent,
     * status, label, priority, agent_claimable_only, include_archived,
     * include_workflow_phase, due_filter, q, limit.
     */
    async handleListCards(args) {
        const {
            board_key,
            board_id,
            assignee,
            agent,
            status,
            label,
            priority,
            agent_claimable_only = false,
            include_archived = false,
            include_workflow_phase = false,
            due_filter,
            q,
            limit = 200
        } = args || {};

        const conditions = [];
        const params = [];
        let i = 1;
        // Set below when q is present -- reused (never re-interpolated) in both
        // the WHERE clause and the ORDER BY rank expression.
        let qParamIndex = null;

        if (board_id) {
            conditions.push(`c.board_id = $${i++}`);
            params.push(board_id);
        } else if (board_key) {
            conditions.push(`c.board_id = (SELECT id FROM fictionlab.kanban_boards WHERE board_key = $${i++})`);
            params.push(board_key);
        }

        if (assignee === '__unassigned__') {
            conditions.push('c.assignee IS NULL');
        } else if (assignee) {
            conditions.push(`c.assignee = $${i++}`);
            params.push(assignee);
        }

        if (status) {
            conditions.push(`c.status = $${i++}`);
            params.push(status);
        }

        if (label) {
            conditions.push(`$${i++} = ANY(c.labels)`);
            params.push(label);
        }

        if (priority) {
            conditions.push(`c.priority = $${i++}`);
            params.push(priority);
        }

        // Free-text search (GH issue #66). Combines with AND against every
        // other filter above. Matches title OR body OR any comment body --
        // parameterized throughout, q is NEVER string-interpolated into the
        // SQL text. When no board_key/board_id filter is given, this already
        // searches every board (the board conditions above simply add no
        // predicate in that case) -- no separate "search all boards" branch
        // needed. ILIKE is sufficient at current scale (hundreds of cards);
        // pg_trgm/full-text search is the upgrade path if it ever gets slow.
        if (q) {
            qParamIndex = i++;
            conditions.push(`(
                c.title ILIKE '%' || $${qParamIndex} || '%'
                OR c.body ILIKE '%' || $${qParamIndex} || '%'
                OR EXISTS (
                    SELECT 1 FROM fictionlab.kanban_comments cm
                    WHERE cm.card_id = c.id AND cm.body ILIKE '%' || $${qParamIndex} || '%'
                )
            )`);
            params.push(q);
        }

        // agent_claimable_only MUST exclude every card assigned to an active
        // human identity by construction (not just by relying on the
        // agent_claimable trigger) — GH issue #62: identity-kind-driven, not
        // name-driven, so this covers 'rebecca' and every other human
        // identity (e.g. 'mom') alike.
        if (agent_claimable_only) {
            conditions.push(`c.agent_claimable = TRUE AND NOT EXISTS (
                SELECT 1 FROM fictionlab.kanban_identities ki
                WHERE ki.id = c.assignee AND ki.kind = 'human' AND ki.active
            )`);
            if (agent) {
                conditions.push(`(c.assignee IS NULL OR c.assignee = $${i++})`);
                params.push(agent);
            }
        } else if (agent) {
            // agent given without agent_claimable_only: cards claimable-by-or-
            // assigned-to this agent (unassigned pool, or already routed to it).
            conditions.push(`(c.assignee = $${i} OR (c.assignee IS NULL AND c.agent_claimable = TRUE))`);
            params.push(agent);
            i++;
        }

        // Default excludes archived cards, unless the caller explicitly asked
        // for archived cards via status:'archived'.
        if (!include_archived && status !== 'archived') {
            conditions.push(`c.status <> 'archived'`);
        }

        // S14 fold-in minimum: due/overdue filtering. Both branches exclude
        // done/archived cards -- a completed or archived card is never
        // "overdue" or "upcoming" in any UI-meaningful sense.
        if (due_filter === 'overdue') {
            conditions.push(`c.due_at IS NOT NULL AND c.due_at < NOW() AND c.status NOT IN ('done', 'archived')`);
        } else if (due_filter === 'upcoming') {
            conditions.push(`c.due_at IS NOT NULL AND c.due_at >= NOW() AND c.status NOT IN ('done', 'archived')`);
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const workflowJoin = include_workflow_phase
            ? 'LEFT JOIN fictionlab.active_workflows aw ON aw.id = c.workflow_registry_id'
            : '';
        const workflowSelect = include_workflow_phase
            ? `, aw.current_node_name AS workflow_phase, aw.progress_percent AS workflow_progress_percent, aw.status AS workflow_status`
            : '';

        params.push(limit);

        // When filtering by due date, the soonest-due card matters more than
        // priority/position ordering -- lead with due_at ascending. Otherwise
        // keep the existing priority-then-position-then-created_at order.
        const baseOrder = due_filter
            ? 'c.due_at ASC NULLS LAST, c.priority, c.position'
            : `CASE c.priority
                    WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4
                END,
                c.position,
                c.created_at`;

        // When q is set, title hits outrank body-only hits outrank
        // comment-only hits; the existing due/priority ordering above is the
        // secondary sort within each rank. Reuses the same $qParamIndex bound
        // parameter already used in the WHERE clause -- never re-interpolated.
        const searchRank = q
            ? `CASE
                    WHEN c.title ILIKE '%' || $${qParamIndex} || '%' THEN 0
                    WHEN c.body ILIKE '%' || $${qParamIndex} || '%' THEN 1
                    ELSE 2
                END,
                `
            : '';

        const orderClause = `ORDER BY ${searchRank}${baseOrder}`;

        // board_key is always joined in so q's cross-board results are
        // attributable to a board without a second round trip.
        const result = await this.db.query(
            `SELECT
                c.*,
                b.board_key,
                (SELECT COUNT(*) FROM fictionlab.kanban_comments cm WHERE cm.card_id = c.id) AS comment_count,
                (SELECT COUNT(*) FROM fictionlab.kanban_card_links l WHERE l.card_id = c.id) AS link_count
                ${workflowSelect}
             FROM fictionlab.kanban_cards c
             JOIN fictionlab.kanban_boards b ON b.id = c.board_id
             ${workflowJoin}
             ${whereClause}
             ${orderClause}
             LIMIT $${i}`,
            params
        );

        return {
            cards: result.rows.map((row) => ({
                ...row,
                comment_count: parseInt(row.comment_count, 10),
                link_count: parseInt(row.link_count, 10)
            }))
        };
    }

    /**
     * create_card — full or quick-add (title-only is valid; board resolves to
     * dev-backlog if neither board_key nor board_id given).
     */
    async handleCreateCard(args) {
        const {
            board_key,
            board_id,
            title,
            body,
            status = 'ready',
            assignee,
            priority = 'normal',
            labels = [],
            spec_ref,
            issue_ref,
            created_by = 'rebecca',
            due_at,
            review_policy
        } = args || {};

        if (!title) {
            throw new Error('title is required');
        }

        if (status && !CARD_STATUSES.includes(status)) {
            throw new Error(`Invalid status: ${status}`);
        }

        await validateAssignee(this.db, assignee);

        const resolvedBoardId = await resolveBoardId(this.db, {
            board_id,
            board_key,
            defaultBoardKey: 'dev-backlog'
        });

        // Agents may escalate a card to review-required but never downgrade it
        // themselves -- an explicit override is only ever honored as-is here;
        // "never downgrade" is enforced by update_card not exposing
        // review_policy as a patchable field (see update_card below).
        const resolvedReviewPolicy = review_policy || inferReviewPolicy({ labels, spec_ref, issue_ref, title, body });

        const result = await this.db.query(
            `INSERT INTO fictionlab.kanban_cards
                (board_id, title, body, status, assignee, priority, labels, spec_ref, issue_ref, review_policy, created_by, due_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING *`,
            [
                resolvedBoardId,
                title,
                body || null,
                status,
                assignee || null,
                priority,
                labels,
                spec_ref || null,
                issue_ref || null,
                resolvedReviewPolicy,
                created_by,
                due_at || null
            ]
        );

        const card = result.rows[0];

        await logActivity(this.db, {
            boardId: resolvedBoardId,
            cardId: card.id,
            actor: created_by,
            action: 'created',
            toStatus: card.status,
            detail: { title, review_policy: resolvedReviewPolicy }
        });
        await notifyKanbanChanged(this.db, card.id);

        return { card };
    }

    /**
     * update_card — partial patch; only provided keys change.
     * assignee is validated against fictionlab.kanban_identities (unknown
     * ids are rejected — GH issue #62); an assignee resolving to an active
     * human identity auto-clears agent_claimable via the DB trigger.
     * assignee:'__clear__' unassigns.
     * review_policy: escalate-only (S11 §11.5 decision 5 — "agents may
     * escalate a card to review-required, never downgrade it themselves").
     * 'auto-done' -> 'review-required' is always allowed; the reverse throws.
     */
    async handleUpdateCard(args) {
        const {
            card_id,
            actor = 'rebecca',
            title,
            body,
            assignee,
            priority,
            labels,
            spec_ref,
            issue_ref,
            workflow_registry_id,
            due_at,
            metadata,
            review_policy
        } = args || {};

        if (!card_id) {
            throw new Error('card_id is required');
        }

        const existing = await this.db.query('SELECT * FROM fictionlab.kanban_cards WHERE id = $1', [card_id]);
        if (existing.rows.length === 0) {
            throw new Error(`Card not found: ${card_id}`);
        }

        if (review_policy !== undefined && review_policy !== existing.rows[0].review_policy) {
            if (existing.rows[0].review_policy === 'review-required' && review_policy === 'auto-done') {
                throw new Error(
                    'review_policy cannot be downgraded from review-required to auto-done — agents may only escalate a card, never downgrade it themselves. Ask Rebecca to change it if that is genuinely intended.'
                );
            }
        }

        const sets = [];
        const params = [card_id];
        let i = 2;
        const changedFields = [];

        if (title !== undefined) {
            sets.push(`title = $${i++}`);
            params.push(title);
            changedFields.push('title');
        }
        if (body !== undefined) {
            sets.push(`body = $${i++}`);
            params.push(body);
            changedFields.push('body');
        }
        if (assignee !== undefined) {
            await validateAssignee(this.db, assignee);
            if (assignee === '__clear__') {
                sets.push('assignee = NULL');
            } else {
                sets.push(`assignee = $${i++}`);
                params.push(assignee);
            }
            changedFields.push('assignee');
        }
        if (priority !== undefined) {
            sets.push(`priority = $${i++}`);
            params.push(priority);
            changedFields.push('priority');
        }
        if (labels !== undefined) {
            sets.push(`labels = $${i++}`);
            params.push(labels);
            changedFields.push('labels');
        }
        if (spec_ref !== undefined) {
            sets.push(`spec_ref = $${i++}`);
            params.push(spec_ref);
            changedFields.push('spec_ref');
        }
        if (issue_ref !== undefined) {
            sets.push(`issue_ref = $${i++}`);
            params.push(issue_ref);
            changedFields.push('issue_ref');
        }
        if (workflow_registry_id !== undefined) {
            sets.push(`workflow_registry_id = $${i++}`);
            params.push(workflow_registry_id);
            changedFields.push('workflow_registry_id');
        }
        if (due_at !== undefined) {
            if (due_at === '__clear__') {
                sets.push('due_at = NULL');
            } else {
                sets.push(`due_at = $${i++}`);
                params.push(due_at);
            }
            changedFields.push('due_at');
        }
        if (metadata !== undefined) {
            sets.push(`metadata = metadata || $${i++}`);
            params.push(metadata);
            changedFields.push('metadata');
        }
        if (review_policy !== undefined) {
            sets.push(`review_policy = $${i++}`);
            params.push(review_policy);
            changedFields.push('review_policy');
        }

        if (sets.length === 0) {
            throw new Error('No fields to update');
        }

        const result = await this.db.query(
            `UPDATE fictionlab.kanban_cards SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
            params
        );

        const card = result.rows[0];

        await logActivity(this.db, {
            boardId: card.board_id,
            cardId: card.id,
            actor,
            action: 'updated',
            detail: { fields: changedFields }
        });
        await notifyKanbanChanged(this.db, card.id);

        return { card };
    }

    /**
     * move_card — change status/lane. Writes activity {action:'moved',
     * from_status, to_status}. Per S11 §11.5 decision 5: a review-required
     * card moving into 'review' is automatically reassigned to 'rebecca'
     * (an auto-done card may move straight to 'done' without this).
     */
    async handleMoveCard(args) {
        const { card_id, to_status, actor = 'rebecca', position } = args || {};

        if (!card_id || !to_status) {
            throw new Error('card_id and to_status are required');
        }
        if (!CARD_STATUSES.includes(to_status)) {
            throw new Error(`Invalid to_status: ${to_status}`);
        }

        const existing = await this.db.query('SELECT * FROM fictionlab.kanban_cards WHERE id = $1', [card_id]);
        if (existing.rows.length === 0) {
            throw new Error(`Card not found: ${card_id}`);
        }
        const existingCard = existing.rows[0];
        const fromStatus = existingCard.status;

        const sets = ['status = $2'];
        const params = [card_id, to_status];
        let i = 3;

        if (position !== undefined) {
            sets.push(`position = $${i++}`);
            params.push(position);
        }

        if (to_status === 'review' && existingCard.review_policy === 'review-required') {
            sets.push(`assignee = $${i++}`);
            params.push('rebecca');
        }

        const result = await this.db.query(
            `UPDATE fictionlab.kanban_cards SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
            params
        );
        const card = result.rows[0];

        await logActivity(this.db, {
            boardId: card.board_id,
            cardId: card.id,
            actor,
            action: 'moved',
            fromStatus,
            toStatus: to_status,
            detail: {}
        });
        await notifyKanbanChanged(this.db, card.id);

        return { card };
    }

    /**
     * get_card (supporting tool) — card + comments + links + activity + live
     * workflow_phase. The detail-drawer call.
     */
    async handleGetCard(args) {
        const { card_id } = args || {};
        if (!card_id) {
            throw new Error('card_id is required');
        }

        const cardResult = await this.db.query(
            `SELECT c.*,
                    aw.current_node_name AS workflow_current_node_name,
                    aw.progress_percent AS workflow_progress_percent,
                    aw.status AS workflow_status
             FROM fictionlab.kanban_cards c
             LEFT JOIN fictionlab.active_workflows aw ON aw.id = c.workflow_registry_id
             WHERE c.id = $1`,
            [card_id]
        );

        if (cardResult.rows.length === 0) {
            throw new Error(`Card not found: ${card_id}`);
        }

        const [comments, links, activity] = await Promise.all([
            this.db.query('SELECT * FROM fictionlab.kanban_comments WHERE card_id = $1 ORDER BY created_at', [card_id]),
            this.db.query('SELECT * FROM fictionlab.kanban_card_links WHERE card_id = $1 ORDER BY created_at', [card_id]),
            this.db.query('SELECT * FROM fictionlab.kanban_activity WHERE card_id = $1 ORDER BY created_at DESC', [card_id])
        ]);

        return {
            card: cardResult.rows[0],
            comments: comments.rows,
            links: links.rows,
            activity: activity.rows
        };
    }

    /**
     * add_card_link (supporting tool) — attach a typed link to a card.
     */
    async handleAddCardLink(args) {
        const { card_id, link_type, ref, label } = args || {};
        if (!card_id || !link_type || !ref) {
            throw new Error('card_id, link_type, and ref are required');
        }

        const cardResult = await this.db.query('SELECT board_id FROM fictionlab.kanban_cards WHERE id = $1', [card_id]);
        if (cardResult.rows.length === 0) {
            throw new Error(`Card not found: ${card_id}`);
        }

        const result = await this.db.query(
            `INSERT INTO fictionlab.kanban_card_links (card_id, link_type, ref, label)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [card_id, link_type, ref, label || null]
        );
        const link = result.rows[0];

        await logActivity(this.db, {
            boardId: cardResult.rows[0].board_id,
            cardId: card_id,
            actor: 'rebecca',
            action: 'linked',
            detail: { link_type, ref }
        });
        await notifyKanbanChanged(this.db, card_id);

        return { link };
    }

    /**
     * archive_card (supporting tool) = move_card to 'archived'.
     */
    async handleArchiveCard(args) {
        const { card_id, actor = 'rebecca' } = args || {};
        if (!card_id) {
            throw new Error('card_id is required');
        }
        return this.handleMoveCard({ card_id, to_status: 'archived', actor });
    }
}
