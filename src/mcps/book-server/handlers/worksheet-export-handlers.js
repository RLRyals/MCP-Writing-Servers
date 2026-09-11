// src/mcps/book-server/handlers/worksheet-export-handlers.js
// Book planning .md export projection (mws-0zk rework).
//
// Rebecca's ruling (2026-09-05, mid-review of PR #107; re-confirmed 2026-09-07
// after the accidental merge + revert of PRs #107/#109): "I don't think we
// need new tables for worksheets. I can already write books with the current
// tables." Planning documents live in EXISTING storage:
//   - genre            -> book_genres / genres (assign_book_genres, existing tool)
//   - target word count -> books.target_word_count (existing column)
//   - everything else   -> the universal metadata table, via the existing
//     create_metadata / update_metadata / list_metadata tools (metadata-server),
//     using the key conventions below. No new tables, no new write tools --
//     this file adds only the one genuinely new piece: a read-only .md
//     projection of that storage. DB = truth, .md = projection.
//
// Amendment 4 (Rebecca, 2026-09-08) killed the 17-section EAW worksheet
// taxonomy entirely -- most planning content is canon DB rows in existing
// entity tables, not worksheet prose. Amendment/rework note (Casey, 2026-09-11)
// confirmed: the export projects book parameters plus whatever genuinely
// prose-shaped planning docs exist, NOT a fixed dossier shape. There is no
// registry of section names or canonical ordering here -- planning docs are
// rendered generically, one per `planning_doc:<name>` metadata row, sorted by
// key, with the key humanized into a heading.
//
// Deterministic: re-exporting unchanged data must produce byte-identical
// output, so nothing here embeds a wall-clock "generated at" timestamp.

import fs from 'fs';
import path from 'path';
import { worksheetExportSchema } from '../schemas/worksheet-export-schema.js';

// metadata_key convention for the journey's "Project Info" station fields.
// One row per field per book, e.g. metadata_key = 'book_parameters:pov'.
export const PARAMETER_KEY_PREFIX = 'book_parameters:';

export const PARAMETER_FIELDS = [
    { key: 'target_chapters', label: 'Target Chapters' },
    { key: 'act_structure', label: 'Act Structure' },
    { key: 'pov', label: 'POV' },
    { key: 'narrative_tense', label: 'Narrative Tense' },
    { key: 'target_words_per_chapter', label: 'Target Words Per Chapter' }
];

// metadata_key convention for freeform, prose-shaped planning documents the
// per-book workflow emits (e.g. a premise writeup, a voice note). One row per
// document per book, e.g. metadata_key = 'planning_doc:premise'. There is no
// fixed registry or canonical order -- unlike the retired worksheet taxonomy,
// any key under this prefix is projected, sorted alphabetically, with the
// key humanized into a heading.
export const PLANNING_DOC_KEY_PREFIX = 'planning_doc:';

function humanizeKey(key) {
    return key
        .split('_')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export class WorksheetExportHandlers {
    constructor(db) {
        this.db = db;
    }

    getWorksheetExportTools() {
        return [worksheetExportSchema.export_book_worksheet_md];
    }

    async handleExportBookWorksheetMd(args) {
        try {
            const { book_id, export_path } = args;

            if (!path.isAbsolute(export_path)) {
                throw new Error(`export_path must be an absolute path, got: ${export_path}`);
            }

            const bookResult = await this.db.query(
                'SELECT id, title, target_word_count FROM books WHERE id = $1',
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

            const genresResult = await this.db.query(
                `SELECT g.genre_name
                 FROM book_genres bg
                 JOIN genres g ON g.id = bg.genre_id
                 WHERE bg.book_id = $1
                 ORDER BY g.genre_name`,
                [book_id]
            );

            const metadataResult = await this.db.query(
                `SELECT metadata_key, metadata_value
                 FROM metadata
                 WHERE book_id = $1
                 ORDER BY metadata_key`,
                [book_id]
            );

            const parameters = new Map();
            const planningDocs = new Map();
            for (const row of metadataResult.rows) {
                if (row.metadata_key.startsWith(PARAMETER_KEY_PREFIX)) {
                    parameters.set(row.metadata_key.slice(PARAMETER_KEY_PREFIX.length), row.metadata_value);
                } else if (row.metadata_key.startsWith(PLANNING_DOC_KEY_PREFIX)) {
                    planningDocs.set(row.metadata_key.slice(PLANNING_DOC_KEY_PREFIX.length), row.metadata_value);
                }
            }

            const lines = [];
            lines.push(`# ${book.title} — Book Planning`);
            lines.push('');

            lines.push('## Project Info');
            lines.push('');
            const genreList = genresResult.rows.map(r => r.genre_name);
            lines.push(`- **Genre:** ${genreList.length > 0 ? genreList.join(', ') : '_(not set)_'}`);
            lines.push(`- **Target Word Count:** ${book.target_word_count ?? '_(not set)_'}`);
            for (const field of PARAMETER_FIELDS) {
                const value = parameters.get(field.key);
                lines.push(`- **${field.label}:** ${value !== undefined ? value : '_(not set)_'}`);
                parameters.delete(field.key);
            }
            // Forward-compat: any book_parameters:* metadata rows not in the
            // known registry still get projected, sorted after the known ones.
            for (const key of Array.from(parameters.keys()).sort()) {
                lines.push(`- **${key}:** ${parameters.get(key)}`);
            }
            lines.push('');

            lines.push('## Planning Documents');
            lines.push('');
            if (planningDocs.size === 0) {
                lines.push('_No planning documents yet._');
            } else {
                for (const key of Array.from(planningDocs.keys()).sort()) {
                    lines.push(`### ${humanizeKey(key)}`);
                    lines.push('');
                    lines.push(planningDocs.get(key) || '_(empty)_');
                    lines.push('');
                }
            }

            const markdown = lines.join('\n');

            fs.mkdirSync(path.dirname(export_path), { recursive: true });
            fs.writeFileSync(export_path, markdown, 'utf8');

            return {
                book_id,
                export_path,
                planning_doc_count: planningDocs.size,
                bytes_written: Buffer.byteLength(markdown, 'utf8')
            };
        } catch (error) {
            throw new Error(`Failed to export book worksheet: ${error.message}`);
        }
    }
}
