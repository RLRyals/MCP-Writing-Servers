// src/mcps/book-server/schemas/planning-document-schemas.js
// Schemas for DB-first per-book planning documents (mws-0zk): the 17-section
// EAW story-dossier worksheet and the journey's book parameters. DB = truth,
// .md = projection (canon-db-architecture direction).
// Used by: config-mcps/book-planning-server

export const planningDocumentSchemas = {
    upsert_worksheet_section: {
        name: 'upsert_worksheet_section',
        description: 'Create or update a worksheet section for a book (17-section EAW dossier). Writing an existing section_key overwrites it in place.',
        inputSchema: {
            type: 'object',
            properties: {
                book_id: {
                    type: 'integer',
                    description: 'Book ID'
                },
                section_key: {
                    type: 'string',
                    description: 'Stable section identifier, e.g. "premise", "protagonist"'
                },
                section_title: {
                    type: 'string',
                    description: 'Human-readable section title, e.g. "Premise"'
                },
                content: {
                    type: 'string',
                    description: 'Section body text'
                },
                status: {
                    type: 'string',
                    enum: ['draft', 'approved'],
                    description: 'Section status (default: draft; keeps current status if omitted on update)'
                },
                sort_order: {
                    type: 'integer',
                    description: 'Position within the worksheet (default: 0; keeps current order if omitted on update)'
                }
            },
            required: ['book_id', 'section_key']
        }
    },

    get_worksheet_section: {
        name: 'get_worksheet_section',
        description: 'Get a single worksheet section for a book',
        inputSchema: {
            type: 'object',
            properties: {
                book_id: {
                    type: 'integer',
                    description: 'Book ID'
                },
                section_key: {
                    type: 'string',
                    description: 'Section identifier'
                }
            },
            required: ['book_id', 'section_key']
        }
    },

    list_worksheet_sections: {
        name: 'list_worksheet_sections',
        description: 'List all worksheet sections for a book, ordered for display',
        inputSchema: {
            type: 'object',
            properties: {
                book_id: {
                    type: 'integer',
                    description: 'Book ID'
                }
            },
            required: ['book_id']
        }
    },

    get_book_parameters: {
        name: 'get_book_parameters',
        description: 'Get the journey Project Info parameters for a book (genre, target chapters, act structure, POV/tense, target words per chapter)',
        inputSchema: {
            type: 'object',
            properties: {
                book_id: {
                    type: 'integer',
                    description: 'Book ID'
                }
            },
            required: ['book_id']
        }
    },

    upsert_book_parameters: {
        name: 'upsert_book_parameters',
        description: 'Create or update the journey Project Info parameters for a book. Fields omitted on an update keep their current value.',
        inputSchema: {
            type: 'object',
            properties: {
                book_id: {
                    type: 'integer',
                    description: 'Book ID'
                },
                genre: {
                    type: 'string',
                    description: 'Genre'
                },
                target_chapters: {
                    type: 'integer',
                    description: 'Target number of chapters'
                },
                act_structure: {
                    type: 'string',
                    description: 'Act structure, e.g. "No Act Structure", "9 Act Structure"'
                },
                pov: {
                    type: 'string',
                    description: 'Point of view, e.g. "First Person", "Third Person Limited"'
                },
                narrative_tense: {
                    type: 'string',
                    description: 'Narrative tense, e.g. "Past", "Present"'
                },
                target_words_per_chapter: {
                    type: 'integer',
                    description: 'Target words per chapter'
                }
            },
            required: ['book_id']
        }
    },

    export_book_worksheet_md: {
        name: 'export_book_worksheet_md',
        description: 'Render the book\'s worksheet sections (DB truth) into a readable Markdown file at the given path, overwriting it. Deterministic: re-exporting unchanged data produces byte-identical output.',
        inputSchema: {
            type: 'object',
            properties: {
                book_id: {
                    type: 'integer',
                    description: 'Book ID'
                },
                export_path: {
                    type: 'string',
                    description: 'Absolute filesystem path to write the .md file to (e.g. a path inside the series repo\'s planning/ directory). Parent directories are created if missing.'
                }
            },
            required: ['book_id', 'export_path']
        }
    }
};

export const planningDocumentSchemaArray = Object.values(planningDocumentSchemas);
