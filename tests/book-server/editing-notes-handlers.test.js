// tests/book-server/editing-notes-handlers.test.js
// Tests for EditingNotesHandlers (bead mws-00b): structured, quote-anchored
// line-level editing notes + cross-chapter lessons for the chapter-by-chapter
// editing process. DB is fully mocked, matching the pattern used in
// tests/outline-server/works-handlers.test.js.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EditingNotesHandlers } from '../../src/mcps/book-server/handlers/editing-notes-handlers.js';

class MockDatabase {
    constructor() {
        this.queryResults = new Map();
        this.queries = [];
    }

    setQueryResult(queryPattern, rows) {
        this.queryResults.set(queryPattern, { rows });
    }

    async query(text, params = []) {
        this.queries.push({ text, params });
        for (const [pattern, result] of this.queryResults.entries()) {
            if (text.includes(pattern)) {
                return typeof result === 'function' ? result(params) : result;
            }
        }
        return { rows: [] };
    }
}

describe('EditingNotesHandlers.handleAddEditingNote', () => {
    it('inserts a note and returns it', async () => {
        const mockDb = new MockDatabase();
        mockDb.setQueryResult('INSERT INTO editing_notes', [{
            id: 1, chapter_id: 32, draft_number: 1, line_quote: 'She felt scared.',
            reason: 'Telling, not showing.', suggested_fix: 'Show a physical reaction.',
            status: 'open', lesson: null
        }]);
        const handlers = new EditingNotesHandlers(mockDb);

        const result = await handlers.handleAddEditingNote({
            chapter_id: 32, draft_number: 1, line_quote: 'She felt scared.',
            reason: 'Telling, not showing.', suggested_fix: 'Show a physical reaction.'
        });

        assert.strictEqual(result.note.id, 1);
        assert.strictEqual(result.note.status, 'open');
    });

    it('raises a clear error on an invalid chapter_id (FK violation)', async () => {
        const mockDb = new MockDatabase();
        mockDb.query = async () => {
            const err = new Error('violates foreign key constraint');
            err.code = '23503';
            throw err;
        };
        const handlers = new EditingNotesHandlers(mockDb);

        await assert.rejects(
            () => handlers.handleAddEditingNote({
                chapter_id: 999999, draft_number: 1, line_quote: 'x', reason: 'y'
            }),
            /Invalid chapter_id/
        );
    });
});

describe('EditingNotesHandlers.handleUpdateEditingNoteStatus', () => {
    it('applies a fix and records the lesson', async () => {
        const mockDb = new MockDatabase();
        mockDb.setQueryResult('UPDATE editing_notes', [{
            id: 1, chapter_id: 32, draft_number: 1, status: 'applied',
            lesson: 'Show, do not tell fear.'
        }]);
        const handlers = new EditingNotesHandlers(mockDb);

        const result = await handlers.handleUpdateEditingNoteStatus({
            note_id: 1, status: 'applied', lesson: 'Show, do not tell fear.'
        });

        assert.strictEqual(result.note.status, 'applied');
        assert.strictEqual(result.note.lesson, 'Show, do not tell fear.');
    });

    it('returns not_found for a missing note', async () => {
        const mockDb = new MockDatabase();
        const handlers = new EditingNotesHandlers(mockDb);

        const result = await handlers.handleUpdateEditingNoteStatus({
            note_id: 999999, status: 'rejected'
        });

        assert.strictEqual(result.error, 'not_found');
    });
});

describe('EditingNotesHandlers.handleGetEditingNotes', () => {
    it('returns notes for a chapter', async () => {
        const mockDb = new MockDatabase();
        mockDb.setQueryResult('FROM editing_notes', [
            { id: 1, chapter_id: 32, draft_number: 1, status: 'applied' },
            { id: 2, chapter_id: 32, draft_number: 1, status: 'open' }
        ]);
        const handlers = new EditingNotesHandlers(mockDb);

        const result = await handlers.handleGetEditingNotes({ chapter_id: 32 });

        assert.strictEqual(result.notes.length, 2);
    });
});

describe('EditingNotesHandlers.handleGetLessons', () => {
    it('joins to chapters and filters to applied notes with a lesson before the given chapter number', async () => {
        const mockDb = new MockDatabase();
        mockDb.setQueryResult('FROM editing_notes en', [
            { note_id: 1, chapter_id: 32, chapter_number: 1, lesson: 'Show, do not tell fear.' }
        ]);
        const handlers = new EditingNotesHandlers(mockDb);

        const result = await handlers.handleGetLessons({ book_id: 1, before_chapter_number: 2 });

        assert.strictEqual(result.lessons.length, 1);
        assert.strictEqual(result.lessons[0].chapter_number, 1);

        const call = mockDb.queries.find(q => q.text.includes('FROM editing_notes en'));
        assert.deepStrictEqual(call.params, [1, 2]);
        assert.ok(call.text.includes("status = 'applied'"));
        assert.ok(call.text.includes('lesson IS NOT NULL'));
    });
});
