// src/mcps/book-server/handlers/planning-document-handlers.js
// DB-first storage for per-book planning documents (mws-0zk): the 17-section
// EAW story-dossier worksheet and the journey's book parameters, plus an
// export-to-.md projection. DB is truth; the exported file is a read-only
// rendering of it (canon-db-architecture direction) -- re-running the export
// against unchanged rows must produce byte-identical output, so nothing here
// embeds a wall-clock "generated at" timestamp.

import fs from 'fs';
import path from 'path';
import { planningDocumentSchemas } from '../schemas/planning-document-schemas.js';

export class PlanningDocumentHandlers {
    constructor(db) {
        this.db = db;
    }

    getPlanningDocumentTools() {
        return [
            planningDocumentSchemas.upsert_worksheet_section,
            planningDocumentSchemas.get_worksheet_section,
            planningDocumentSchemas.list_worksheet_sections,
            planningDocumentSchemas.get_book_parameters,
            planningDocumentSchemas.upsert_book_parameters,
            planningDocumentSchemas.export_book_worksheet_md
        ];
    }

    async handleUpsertWorksheetSection(args) {
        try {
            const { book_id, section_key, section_title, content, status, sort_order } = args;

            const query = `
                INSERT INTO book_worksheet_sections (
                    book_id, section_key, section_title, content, status, sort_order
                )
                VALUES ($1, $2, $3, $4, COALESCE($5, 'draft'), COALESCE($6, 0))
                ON CONFLICT (book_id, section_key) DO UPDATE SET
                    section_title = COALESCE(EXCLUDED.section_title, book_worksheet_sections.section_title),
                    content = COALESCE(EXCLUDED.content, book_worksheet_sections.content),
                    status = COALESCE($5, book_worksheet_sections.status),
                    sort_order = COALESCE($6, book_worksheet_sections.sort_order)
                RETURNING *
            `;

            const result = await this.db.query(query, [
                book_id, section_key, section_title || null, content || null,
                status || null, sort_order ?? null
            ]);

            return { section: result.rows[0] };
        } catch (error) {
            if (error.code === '23503') { // Foreign key violation
                throw new Error(`Invalid book_id: Book ${args.book_id} not found`);
            }
            throw new Error(`Failed to upsert worksheet section: ${error.message}`);
        }
    }

    async handleGetWorksheetSection(args) {
        try {
            const { book_id, section_key } = args;

            const result = await this.db.query(
                'SELECT * FROM book_worksheet_sections WHERE book_id = $1 AND section_key = $2',
                [book_id, section_key]
            );

            if (result.rows.length === 0) {
                return {
                    error: 'not_found',
                    book_id,
                    section_key,
                    message: `No worksheet section "${section_key}" found for book ID: ${book_id}`
                };
            }

            return { section: result.rows[0] };
        } catch (error) {
            throw new Error(`Failed to get worksheet section: ${error.message}`);
        }
    }

    async handleListWorksheetSections(args) {
        try {
            const { book_id } = args;

            const result = await this.db.query(
                `SELECT * FROM book_worksheet_sections
                 WHERE book_id = $1
                 ORDER BY sort_order, section_key`,
                [book_id]
            );

            return { book_id, sections: result.rows };
        } catch (error) {
            throw new Error(`Failed to list worksheet sections: ${error.message}`);
        }
    }

    async handleGetBookParameters(args) {
        try {
            const { book_id } = args;

            const result = await this.db.query(
                'SELECT * FROM book_parameters WHERE book_id = $1',
                [book_id]
            );

            if (result.rows.length === 0) {
                return {
                    error: 'not_found',
                    book_id,
                    message: `No book parameters found for book ID: ${book_id}`
                };
            }

            return { parameters: result.rows[0] };
        } catch (error) {
            throw new Error(`Failed to get book parameters: ${error.message}`);
        }
    }

    async handleUpsertBookParameters(args) {
        try {
            const {
                book_id, genre, target_chapters, act_structure,
                pov, narrative_tense, target_words_per_chapter
            } = args;

            const query = `
                INSERT INTO book_parameters (
                    book_id, genre, target_chapters, act_structure,
                    pov, narrative_tense, target_words_per_chapter
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (book_id) DO UPDATE SET
                    genre = COALESCE(EXCLUDED.genre, book_parameters.genre),
                    target_chapters = COALESCE(EXCLUDED.target_chapters, book_parameters.target_chapters),
                    act_structure = COALESCE(EXCLUDED.act_structure, book_parameters.act_structure),
                    pov = COALESCE(EXCLUDED.pov, book_parameters.pov),
                    narrative_tense = COALESCE(EXCLUDED.narrative_tense, book_parameters.narrative_tense),
                    target_words_per_chapter = COALESCE(EXCLUDED.target_words_per_chapter, book_parameters.target_words_per_chapter)
                RETURNING *
            `;

            const result = await this.db.query(query, [
                book_id, genre ?? null, target_chapters ?? null, act_structure ?? null,
                pov ?? null, narrative_tense ?? null, target_words_per_chapter ?? null
            ]);

            return { parameters: result.rows[0] };
        } catch (error) {
            if (error.code === '23503') { // Foreign key violation
                throw new Error(`Invalid book_id: Book ${args.book_id} not found`);
            }
            throw new Error(`Failed to upsert book parameters: ${error.message}`);
        }
    }

    async handleExportBookWorksheetMd(args) {
        try {
            const { book_id, export_path } = args;

            if (!path.isAbsolute(export_path)) {
                throw new Error(`export_path must be an absolute path, got: ${export_path}`);
            }

            const bookResult = await this.db.query(
                'SELECT id, title FROM books WHERE id = $1',
                [book_id]
            );

            if (bookResult.rows.length === 0) {
                return {
                    error: 'not_found',
                    book_id,
                    message: `No book found with ID: ${book_id}`
                };
            }

            const book = bookResult.rows[0];

            const sectionsResult = await this.db.query(
                `SELECT section_key, section_title, content, status
                 FROM book_worksheet_sections
                 WHERE book_id = $1
                 ORDER BY sort_order, section_key`,
                [book_id]
            );

            const lines = [];
            lines.push(`# ${book.title} — Story Dossier Worksheet`);
            lines.push('');

            if (sectionsResult.rows.length === 0) {
                lines.push('_No worksheet sections yet._');
            } else {
                for (const section of sectionsResult.rows) {
                    const title = section.section_title || section.section_key;
                    lines.push(`## ${title}`);
                    lines.push('');
                    lines.push(`_Status: ${section.status}_`);
                    lines.push('');
                    lines.push(section.content ? section.content : '_(empty)_');
                    lines.push('');
                }
            }

            const markdown = lines.join('\n');

            fs.mkdirSync(path.dirname(export_path), { recursive: true });
            fs.writeFileSync(export_path, markdown, 'utf8');

            return {
                book_id,
                export_path,
                section_count: sectionsResult.rows.length,
                bytes_written: Buffer.byteLength(markdown, 'utf8')
            };
        } catch (error) {
            throw new Error(`Failed to export book worksheet: ${error.message}`);
        }
    }
}
