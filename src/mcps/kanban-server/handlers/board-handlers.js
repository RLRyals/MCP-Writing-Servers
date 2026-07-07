// src/mcps/kanban-server/handlers/board-handlers.js
// Board-level read tools: get_board (the board-render call) and the
// supporting list_boards.

export class BoardHandlers {
    constructor(db) {
        this.db = db;
    }

    /**
     * get_board — board + its columns + per-column card counts.
     * One of board_key|board_id is required.
     */
    async handleGetBoard(args) {
        const { board_key, board_id } = args || {};

        if (!board_id && !board_key) {
            throw new Error('board_key or board_id is required');
        }

        const boardResult = await this.db.query(
            board_id
                ? 'SELECT * FROM fictionlab.kanban_boards WHERE id = $1'
                : 'SELECT * FROM fictionlab.kanban_boards WHERE board_key = $1',
            [board_id || board_key]
        );

        if (boardResult.rows.length === 0) {
            throw new Error(`Board not found: ${board_id || board_key}`);
        }

        const board = boardResult.rows[0];

        const columnsResult = await this.db.query(
            `SELECT
                col.status_key,
                col.name,
                col.position,
                col.color,
                col.wip_limit,
                col.is_agent_pickup,
                COUNT(card.id) AS card_count
             FROM fictionlab.kanban_columns col
             LEFT JOIN fictionlab.kanban_cards card
               ON card.board_id = col.board_id AND card.status = col.status_key
             WHERE col.board_id = $1
             GROUP BY col.id, col.status_key, col.name, col.position, col.color, col.wip_limit, col.is_agent_pickup
             ORDER BY col.position`,
            [board.id]
        );

        return {
            board,
            columns: columnsResult.rows.map((row) => ({
                ...row,
                card_count: parseInt(row.card_count, 10)
            }))
        };
    }

    /**
     * list_boards (supporting tool) — all boards + their total card counts.
     */
    async handleListBoards() {
        const result = await this.db.query(
            `SELECT b.*, COUNT(c.id) AS card_count
             FROM fictionlab.kanban_boards b
             LEFT JOIN fictionlab.kanban_cards c ON c.board_id = b.id
             GROUP BY b.id
             ORDER BY b.created_at`
        );

        return {
            boards: result.rows.map((row) => ({
                ...row,
                card_count: parseInt(row.card_count, 10)
            }))
        };
    }
}
