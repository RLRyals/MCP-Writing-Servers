// src/mcps/kanban-server/handlers/board-handlers.js
// Board-level tools: get_board (the board-render call), the supporting
// list_boards, and create_board (mws-xoi -- there was previously no way to
// add a board other than the migration 042 seed / raw SQL).

import { CARD_STATUSES, validateAssignee } from './kanban-helpers.js';

// Default column set = the dev-backlog seed in migrations/042_kanban_tables.sql,
// used whenever create_board is called without an explicit `columns` list.
const DEFAULT_COLUMNS = [
    { status_key: 'backlog', name: 'Backlog', position: 0, is_agent_pickup: false },
    { status_key: 'ready', name: 'Ready to work', position: 1, is_agent_pickup: true },
    { status_key: 'in_progress', name: 'In progress', position: 2, is_agent_pickup: false },
    { status_key: 'review', name: 'In review', position: 3, is_agent_pickup: false },
    { status_key: 'blocked', name: 'Blocked / decision', position: 4, is_agent_pickup: false },
    { status_key: 'done', name: 'Done', position: 5, is_agent_pickup: false },
    { status_key: 'archived', name: 'Archived', position: 6, is_agent_pickup: false },
    { status_key: 'claimed', name: 'Claimed', position: 7, is_agent_pickup: false }
];

export class BoardHandlers {
    constructor(db) {
        this.db = db;
    }

    /**
     * create_board — creates a board + its columns. Idempotent on board_key
     * (ON CONFLICT DO NOTHING; a repeat call returns the existing board and
     * its columns rather than erroring or duplicating). No migration is
     * required to add a board -- this is the sanctioned replacement for the
     * raw-SQL side-channel (fictionlab-workflow kanban-projection.ts
     * ensureBoard) that Rebecca's friend's agent had to resort to.
     *
     * created_by has NO 'rebecca' default (unlike create_card's created_by)
     * and is validated against fictionlab.kanban_identities exactly like an
     * assignee -- the caller must supply a real registered identity.
     */
    async handleCreateBoard(args) {
        const { board_key, name, description, columns, created_by } = args || {};

        if (!board_key) {
            throw new Error('board_key is required');
        }
        if (!name) {
            throw new Error('name is required');
        }
        if (!created_by) {
            throw new Error('created_by is required (a registered identity id -- see list_identities / upsert_identity)');
        }
        await validateAssignee(this.db, created_by);

        const resolvedColumns = Array.isArray(columns) && columns.length > 0 ? columns : DEFAULT_COLUMNS;

        resolvedColumns.forEach((col, idx) => {
            if (!col || !col.status_key || !col.name) {
                throw new Error(`columns[${idx}] requires status_key and name`);
            }
            if (!CARD_STATUSES.includes(col.status_key)) {
                throw new Error(`columns[${idx}].status_key '${col.status_key}' is invalid -- must be one of: ${CARD_STATUSES.join(', ')}`);
            }
        });

        const insertResult = await this.db.query(
            `INSERT INTO fictionlab.kanban_boards (board_key, name, description, created_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (board_key) DO NOTHING
             RETURNING *`,
            [board_key, name, description || null, created_by]
        );

        let board;
        let created;

        if (insertResult.rows.length > 0) {
            board = insertResult.rows[0];
            created = true;

            const columnValues = [];
            const columnParams = [];
            let p = 1;
            for (const col of resolvedColumns) {
                columnValues.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
                columnParams.push(
                    board.id,
                    col.status_key,
                    col.name,
                    col.position ?? 0,
                    col.color || null,
                    col.wip_limit || null,
                    col.is_agent_pickup || false
                );
            }

            await this.db.query(
                `INSERT INTO fictionlab.kanban_columns
                    (board_id, status_key, name, position, color, wip_limit, is_agent_pickup)
                 VALUES ${columnValues.join(', ')}
                 ON CONFLICT (board_id, status_key) DO NOTHING`,
                columnParams
            );
        } else {
            const existing = await this.db.query(
                'SELECT * FROM fictionlab.kanban_boards WHERE board_key = $1',
                [board_key]
            );
            board = existing.rows[0];
            created = false;
        }

        const columnsResult = await this.db.query(
            `SELECT status_key, name, position, color, wip_limit, is_agent_pickup
             FROM fictionlab.kanban_columns
             WHERE board_id = $1
             ORDER BY position`,
            [board.id]
        );

        return { board, columns: columnsResult.rows, created };
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
