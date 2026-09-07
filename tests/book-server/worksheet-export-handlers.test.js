// tests/book-server/worksheet-export-handlers.test.js
// Tests for WorksheetExportHandlers (bead mws-0zk rework): the .md export
// projection over EXISTING storage (books.target_word_count, book_genres/
// genres, and the universal metadata table) -- no new tables. DB is mocked
// for the query paths; the export itself does real filesystem I/O against a
// temp dir, matching the pattern used for other export-shaped handlers.

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { WorksheetExportHandlers } from '../../src/mcps/book-server/handlers/worksheet-export-handlers.js';

class MockDatabase {
    constructor({ book = null, genres = [], metadata = [] } = {}) {
        this.book = book;
        this.genres = genres;
        this.metadata = metadata;
        this.queries = [];
    }

    async query(text, params = []) {
        this.queries.push({ text, params });
        if (text.includes('FROM books')) {
            return { rows: this.book ? [this.book] : [] };
        }
        if (text.includes('FROM book_genres')) {
            return { rows: this.genres.map(genre_name => ({ genre_name })) };
        }
        if (text.includes('FROM metadata')) {
            return { rows: this.metadata };
        }
        throw new Error(`Unexpected query in test: ${text}`);
    }
}

const tempFiles = [];
function tempExportPath() {
    const p = path.join(os.tmpdir(), `mws-0zk-worksheet-export-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
    tempFiles.push(p);
    return p;
}

after(() => {
    for (const p of tempFiles) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
    }
});

describe('WorksheetExportHandlers.handleExportBookWorksheetMd', () => {
    it('returns not_found for a missing book', async () => {
        const handlers = new WorksheetExportHandlers(new MockDatabase({ book: null }));

        const result = await handlers.handleExportBookWorksheetMd({
            book_id: 999,
            export_path: tempExportPath()
        });

        assert.strictEqual(result.error, 'not_found');
        assert.strictEqual(result.book_id, 999);
    });

    it('rejects a non-absolute export_path', async () => {
        const handlers = new WorksheetExportHandlers(new MockDatabase({ book: { id: 1, title: 'Book' } }));

        await assert.rejects(
            () => handlers.handleExportBookWorksheetMd({ book_id: 1, export_path: 'relative/path.md' }),
            /export_path must be an absolute path/
        );
    });

    it('renders "not set" placeholders and no-sections message when nothing is stored', async () => {
        const db = new MockDatabase({
            book: { id: 1, title: 'Empty Book', target_word_count: null },
            genres: [],
            metadata: []
        });
        const handlers = new WorksheetExportHandlers(db);
        const exportPath = tempExportPath();

        const result = await handlers.handleExportBookWorksheetMd({ book_id: 1, export_path: exportPath });

        assert.strictEqual(result.section_count, 0);
        const markdown = fs.readFileSync(exportPath, 'utf8');
        assert.match(markdown, /# Empty Book — Story Dossier Worksheet/);
        assert.match(markdown, /\*\*Genre:\*\* _\(not set\)_/);
        assert.match(markdown, /\*\*Target Word Count:\*\* _\(not set\)_/);
        assert.match(markdown, /\*\*POV:\*\* _\(not set\)_/);
        assert.match(markdown, /_No worksheet sections yet\._/);
    });

    it('projects book_genres, books.target_word_count, and metadata rows into Project Info + Worksheet Sections', async () => {
        const db = new MockDatabase({
            book: { id: 2, title: 'Full Book', target_word_count: 90000 },
            genres: ['Fantasy', 'Romance'],
            metadata: [
                { metadata_key: 'book_parameters:pov', metadata_value: 'First Person' },
                { metadata_key: 'book_parameters:act_structure', metadata_value: '9 Act Structure' },
                { metadata_key: 'book_parameters:target_chapters', metadata_value: '25' },
                { metadata_key: 'worksheet:story_concept', metadata_value: 'A thief steals fate itself.' },
                { metadata_key: 'worksheet:protagonist_operating_systems', metadata_value: 'Kira: driven, guarded.' },
                // Unknown/forward-compat keys should still render, sorted after known ones.
                { metadata_key: 'worksheet:zzz_future_section', metadata_value: 'placeholder content' },
                { metadata_key: 'book_parameters:zzz_future_param', metadata_value: 'placeholder value' },
                // Unrelated metadata rows outside the two prefixes must be ignored.
                { metadata_key: 'unrelated_key', metadata_value: 'should not appear' }
            ]
        });
        const handlers = new WorksheetExportHandlers(db);
        const exportPath = tempExportPath();

        const result = await handlers.handleExportBookWorksheetMd({ book_id: 2, export_path: exportPath });

        assert.strictEqual(result.section_count, 3);
        const markdown = fs.readFileSync(exportPath, 'utf8');
        assert.match(markdown, /\*\*Genre:\*\* Fantasy, Romance/);
        assert.match(markdown, /\*\*Target Word Count:\*\* 90000/);
        assert.match(markdown, /\*\*POV:\*\* First Person/);
        assert.match(markdown, /\*\*Act Structure:\*\* 9 Act Structure/);
        assert.match(markdown, /\*\*Target Chapters:\*\* 25/);
        assert.match(markdown, /\*\*Narrative Tense:\*\* _\(not set\)_/);
        assert.match(markdown, /zzz_future_param.*placeholder value/);
        assert.match(markdown, /### Story Concept\n\nA thief steals fate itself\./);
        assert.match(markdown, /### Protagonist Operating Systems\n\nKira: driven, guarded\./);
        assert.match(markdown, /### zzz_future_section\n\nplaceholder content/);
        assert.doesNotMatch(markdown, /should not appear/);

        // Canonical sections must render in worksheet-order, not metadata-key order:
        // protagonist_operating_systems (#3) precedes story_concept (#2) alphabetically
        // by key text ("p" < "s") but must appear AFTER it in the export.
        const conceptIndex = markdown.indexOf('### Story Concept');
        const protagonistIndex = markdown.indexOf('### Protagonist Operating Systems');
        assert.ok(conceptIndex >= 0 && protagonistIndex >= 0 && conceptIndex < protagonistIndex);
    });

    it('re-exporting unchanged data is idempotent (byte-identical)', async () => {
        const buildDb = () => new MockDatabase({
            book: { id: 3, title: 'Repeat Book', target_word_count: 50000 },
            genres: ['Mystery'],
            metadata: [
                { metadata_key: 'book_parameters:pov', metadata_value: 'Third Person Limited' },
                { metadata_key: 'worksheet:story_world', metadata_value: 'A drowned city.' }
            ]
        });
        const handlers1 = new WorksheetExportHandlers(buildDb());
        const handlers2 = new WorksheetExportHandlers(buildDb());
        const exportPath = tempExportPath();

        const first = await handlers1.handleExportBookWorksheetMd({ book_id: 3, export_path: exportPath });
        const firstContent = fs.readFileSync(exportPath, 'utf8');

        const second = await handlers2.handleExportBookWorksheetMd({ book_id: 3, export_path: exportPath });
        const secondContent = fs.readFileSync(exportPath, 'utf8');

        assert.strictEqual(first.bytes_written, second.bytes_written);
        assert.strictEqual(firstContent, secondContent);
    });
});
