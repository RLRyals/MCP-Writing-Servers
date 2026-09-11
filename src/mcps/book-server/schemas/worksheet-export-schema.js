// src/mcps/book-server/schemas/worksheet-export-schema.js
// Schema for the book planning .md export projection (mws-0zk rework).
//
// Rebecca's 2026-09-05 no-new-tables ruling (mid-review of PR #107) replaced
// the original book_worksheet_sections / book_parameters tables with a
// projection onto EXISTING storage: book_genres (genre), books.target_word_count,
// and the universal metadata table (book_parameters:<field> Project Info
// fields, plus planning_doc:<name> freeform planning docs -- Amendment 4,
// 2026-09-08, killed the 17-section EAW worksheet taxonomy in favor of this
// generic, registry-free shape). This schema covers the one genuinely new
// piece: the read-only .md export tool. DB = truth, .md = projection.

export const worksheetExportSchema = {
    export_book_worksheet_md: {
        name: 'export_book_worksheet_md',
        description: 'Render a book\'s planning documents (genre + book_genres, books.target_word_count, metadata rows for Project Info parameters (book_parameters:<field>), and any freeform prose-shaped planning documents (planning_doc:<name>)) into a readable Markdown file at the given path, overwriting it. Deterministic: re-exporting unchanged data produces byte-identical output.',
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

export const worksheetExportSchemaArray = Object.values(worksheetExportSchema);
