// src/mcps/biz-server/handlers/deadline-handlers.js
// list_biz_deadlines, complete_biz_deadline -- S14 recurrence semantics
// (S14-broadquill-dashboard-plugin.md §5 `POST /deadlines/:id/complete`):
// recurrence='none' sets done_at; a recurring deadline rolls due_date
// forward one period and clears any snooze, instead of duplicating rows.

import { recurrenceInterval } from './biz-helpers.js';

export class DeadlineHandlers {
    constructor(db) {
        this.db = db;
    }

    async handleListBizDeadlines(args) {
        const { category } = args || {};

        const result = category
            ? await this.db.query(
                  'SELECT * FROM fictionlab.biz_deadlines WHERE category = $1 ORDER BY due_date',
                  [category]
              )
            : await this.db.query('SELECT * FROM fictionlab.biz_deadlines ORDER BY due_date');

        return { deadlines: result.rows };
    }

    async handleCompleteBizDeadline(args) {
        const { id } = args || {};
        if (!id) {
            throw new Error('id is required');
        }

        const existing = await this.db.query('SELECT * FROM fictionlab.biz_deadlines WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            throw new Error(`Deadline not found: ${id}`);
        }
        const deadline = existing.rows[0];

        let result;
        if (deadline.recurrence === 'none') {
            result = await this.db.query(
                'UPDATE fictionlab.biz_deadlines SET done_at = NOW() WHERE id = $1 RETURNING *',
                [id]
            );
        } else {
            const interval = recurrenceInterval(deadline.recurrence);
            result = await this.db.query(
                `UPDATE fictionlab.biz_deadlines
                 SET due_date = due_date + $2::interval, snoozed_until = NULL
                 WHERE id = $1
                 RETURNING *`,
                [id, interval]
            );
        }

        return { deadline: result.rows[0] };
    }
}
