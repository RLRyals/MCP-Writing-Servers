// src/mcps/kanban-server/handlers/comment-handlers.js
// comment_card — append to a card's comment thread. Agents report progress
// here (results, links, questions for a blocked card).

import { logActivity, notifyKanbanChanged } from './kanban-helpers.js';

export class CommentHandlers {
    constructor(db) {
        this.db = db;
    }

    async handleCommentCard(args) {
        const { card_id, author, body } = args || {};

        if (!card_id || !author || !body) {
            throw new Error('card_id, author, and body are required');
        }

        const cardResult = await this.db.query('SELECT board_id FROM fictionlab.kanban_cards WHERE id = $1', [card_id]);
        if (cardResult.rows.length === 0) {
            throw new Error(`Card not found: ${card_id}`);
        }

        const result = await this.db.query(
            `INSERT INTO fictionlab.kanban_comments (card_id, author, body)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [card_id, author, body]
        );
        const comment = result.rows[0];

        await logActivity(this.db, {
            boardId: cardResult.rows[0].board_id,
            cardId: card_id,
            actor: author,
            action: 'commented',
            detail: {}
        });
        await notifyKanbanChanged(this.db, card_id);

        return { comment };
    }
}
