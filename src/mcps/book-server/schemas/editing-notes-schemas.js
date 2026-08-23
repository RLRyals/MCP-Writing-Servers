// src/mcps/book-server/schemas/editing-notes-schemas.js
// Schemas for structured, quote-anchored line-level editing notes and the
// cross-chapter lessons they feed into the drafting lane (mws-00b).

export const editingNotesSchemas = {
    add_editing_note: {
        name: 'add_editing_note',
        description: 'Add a line-level editing note to a chapter draft (the line, why it needs fixing, how to fix it). Quote-anchored so the note survives re-drafts.',
        inputSchema: {
            type: 'object',
            properties: {
                chapter_id: {
                    type: 'integer',
                    description: 'Chapter ID'
                },
                draft_number: {
                    type: 'integer',
                    description: 'The draft number this note was made on'
                },
                line_quote: {
                    type: 'string',
                    description: 'The quoted line/passage the note is about'
                },
                reason: {
                    type: 'string',
                    description: 'Why this line needs fixing'
                },
                suggested_fix: {
                    type: 'string',
                    description: 'How to fix it'
                }
            },
            required: ['chapter_id', 'draft_number', 'line_quote', 'reason']
        }
    },

    update_editing_note_status: {
        name: 'update_editing_note_status',
        description: 'Update an editing note\'s status (open/applied/rejected). When applying a fix, pass lesson to record the generalized takeaway that get_lessons() will surface to later chapters.',
        inputSchema: {
            type: 'object',
            properties: {
                note_id: {
                    type: 'integer',
                    description: 'Editing note ID'
                },
                status: {
                    type: 'string',
                    enum: ['open', 'applied', 'rejected'],
                    description: 'New status'
                },
                lesson: {
                    type: 'string',
                    description: 'Generalized takeaway extracted when the fix is applied'
                }
            },
            required: ['note_id', 'status']
        }
    },

    get_editing_notes: {
        name: 'get_editing_notes',
        description: 'Get editing notes for a chapter, optionally filtered to a specific draft. The fix-pass reads this as its worklist.',
        inputSchema: {
            type: 'object',
            properties: {
                chapter_id: {
                    type: 'integer',
                    description: 'Chapter ID'
                },
                draft_number: {
                    type: 'integer',
                    description: 'Filter to notes made on this draft number'
                },
                status: {
                    type: 'string',
                    enum: ['open', 'applied', 'rejected'],
                    description: 'Filter by status'
                }
            },
            required: ['chapter_id']
        }
    },

    get_lessons: {
        name: 'get_lessons',
        description: 'Get applied-fix lessons from every chapter before before_chapter_number in a book. The drafting lane calls this before drafting chapter N to consume every lesson from chapters < N.',
        inputSchema: {
            type: 'object',
            properties: {
                book_id: {
                    type: 'integer',
                    description: 'Book ID'
                },
                before_chapter_number: {
                    type: 'integer',
                    description: 'Only return lessons from chapters with chapter_number strictly less than this'
                }
            },
            required: ['book_id', 'before_chapter_number']
        }
    }
};

export const editingNotesSchemaArray = Object.values(editingNotesSchemas);
