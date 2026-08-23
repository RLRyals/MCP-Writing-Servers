// src/mcps/book-server/handlers/editing-notes-handlers.js
// Structured, queryable line-level editing notes + cross-chapter lessons
// (mws-00b). Notes are quote-anchored (line_quote), not line-number-anchored,
// so they survive re-drafts.

import { editingNotesSchemas } from '../schemas/editing-notes-schemas.js';

export class EditingNotesHandlers {
    constructor(db) {
        this.db = db;
    }

    getEditingNotesTools() {
        return [
            editingNotesSchemas.add_editing_note,
            editingNotesSchemas.update_editing_note_status,
            editingNotesSchemas.get_editing_notes,
            editingNotesSchemas.get_lessons
        ];
    }

    async handleAddEditingNote(args) {
        try {
            const { chapter_id, draft_number, line_quote, reason, suggested_fix } = args;

            const query = `
                INSERT INTO editing_notes (
                    chapter_id, draft_number, line_quote, reason, suggested_fix
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `;

            const result = await this.db.query(query, [
                chapter_id, draft_number, line_quote, reason, suggested_fix || null
            ]);

            return { note: result.rows[0] };
        } catch (error) {
            if (error.code === '23503') { // Foreign key violation
                throw new Error(`Invalid chapter_id: Chapter ${args.chapter_id} not found`);
            }
            throw new Error(`Failed to add editing note: ${error.message}`);
        }
    }

    async handleUpdateEditingNoteStatus(args) {
        try {
            const { note_id, status, lesson } = args;

            const query = `
                UPDATE editing_notes
                SET status = $2,
                    lesson = COALESCE($3, lesson),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING *
            `;

            const result = await this.db.query(query, [note_id, status, lesson || null]);

            if (result.rows.length === 0) {
                return {
                    error: 'not_found',
                    note_id,
                    message: `No editing note found with ID: ${note_id}`
                };
            }

            return { note: result.rows[0] };
        } catch (error) {
            throw new Error(`Failed to update editing note status: ${error.message}`);
        }
    }

    async handleGetEditingNotes(args) {
        try {
            const { chapter_id, draft_number, status } = args;

            let query = `
                SELECT * FROM editing_notes
                WHERE chapter_id = $1
            `;
            const params = [chapter_id];
            let paramCount = 1;

            if (draft_number !== undefined) {
                paramCount++;
                query += ` AND draft_number = $${paramCount}`;
                params.push(draft_number);
            }

            if (status) {
                paramCount++;
                query += ` AND status = $${paramCount}`;
                params.push(status);
            }

            query += ' ORDER BY draft_number, id';

            const result = await this.db.query(query, params);

            return {
                chapter_id,
                notes: result.rows
            };
        } catch (error) {
            throw new Error(`Failed to get editing notes: ${error.message}`);
        }
    }

    async handleGetLessons(args) {
        try {
            const { book_id, before_chapter_number } = args;

            const query = `
                SELECT en.id AS note_id, en.chapter_id, c.chapter_number,
                       en.draft_number, en.line_quote, en.reason,
                       en.suggested_fix, en.lesson, en.updated_at
                FROM editing_notes en
                JOIN chapters c ON c.id = en.chapter_id
                WHERE c.book_id = $1
                  AND c.chapter_number < $2
                  AND en.status = 'applied'
                  AND en.lesson IS NOT NULL
                ORDER BY c.chapter_number, en.draft_number, en.id
            `;

            const result = await this.db.query(query, [book_id, before_chapter_number]);

            return {
                book_id,
                before_chapter_number,
                lessons: result.rows
            };
        } catch (error) {
            throw new Error(`Failed to get lessons: ${error.message}`);
        }
    }
}
