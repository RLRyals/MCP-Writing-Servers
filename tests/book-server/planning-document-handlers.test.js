// tests/book-server/planning-document-handlers.test.js
// Tests for PlanningDocumentHandlers (bead mws-0zk): DB-first storage for
// per-book worksheet sections and book parameters, plus the .md export
// projection. DB is mocked for the CRUD paths, matching the pattern used in
// tests/book-server/editing-notes-handlers.test.js. The export tool is
// exercised against a real temp file since it does real filesystem I/O.

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PlanningDocumentHandlers } from '../../src/mcps/book-server/handlers/planning-document-handlers.js';

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

describe('PlanningDocumentHandlers.handleUpsertWorksheetSection', () => {
    it('inserts a section and returns it', async () => {
        const mockDb = new MockDatabase();
        mockDb.setQueryResult('INSERT INTO book_worksheet_sections', [{
            id: 1, book_id: 7, section_key: 'premise', section_title: 'Premise',
            content: 'A quiet town hides a loud secret.', status: 'draft', sort_order: 1
        }]);
        const handlers = new PlanningDocumentHandlers(mockDb);

        const result = await handlers.handleUpsertWorksheetSection({
            book_id: 7, section_key: 'premise', section_title: 'Premise',
            content: 'A quiet town hides a loud secret.', sort_order: 1
        });

        assert.strictEqual(result.section.section_key, 'premise');
        assert.strictEqual(result.section.content, 'A quiet town hides a loud secret.');
    });

    it('reports the foreign-key violation as an invalid book_id', async () => {
        const mockDb = new MockDatabase();
        mockDb.query = async () => {
            const err = new Error('violates foreign key constraint');
            err.code = '23503';
            throw err;
        };
        const handlers = new PlanningDocumentHandlers(mockDb);

        await assert.rejects(
            () => handlers.handleUpsertWorksheetSection({ book_id: 999, section_key: 'premise' }),
            /Invalid book_id: Book 999 not found/
        );
    });
});

describe('PlanningDocumentHandlers.handleGetWorksheetSection / handleListWorksheetSections', () => {
    it('returns not_found for a missing section', async () => {
        const mockDb = new MockDatabase();
        const handlers = new PlanningDocumentHandlers(mockDb);

        const result = await handlers.handleGetWorksheetSection({ book_id: 7, section_key: 'ghost' });

        assert.strictEqual(result.error, 'not_found');
    });

    it('lists sections for a book', async () => {
        const mockDb = new MockDatabase();
        mockDb.setQueryResult('FROM book_worksheet_sections', [
            { id: 1, book_id: 7, section_key: 'premise', sort_order: 0 },
            { id: 2, book_id: 7, section_key: 'protagonist', sort_order: 1 }
        ]);
        const handlers = new PlanningDocumentHandlers(mockDb);

        const result = await handlers.handleListWorksheetSections({ book_id: 7 });

        assert.strictEqual(result.sections.length, 2);
    });
});

describe('PlanningDocumentHandlers book parameters', () => {
    it('round-trips book parameters through upsert and get', async () => {
        const mockDb = new MockDatabase();
        mockDb.setQueryResult('INSERT INTO book_parameters', [{
            book_id: 7, genre: 'Mystery', target_chapters: 24, act_structure: '9 Act Structure',
            pov: 'First Person', narrative_tense: 'Past', target_words_per_chapter: 2500
        }]);
        const handlers = new PlanningDocumentHandlers(mockDb);

        const upserted = await handlers.handleUpsertBookParameters({
            book_id: 7, genre: 'Mystery', target_chapters: 24, act_structure: '9 Act Structure',
            pov: 'First Person', narrative_tense: 'Past', target_words_per_chapter: 2500
        });

        assert.strictEqual(upserted.parameters.genre, 'Mystery');
        assert.strictEqual(upserted.parameters.target_chapters, 24);

        mockDb.setQueryResult('FROM book_parameters', [upserted.parameters]);
        const fetched = await handlers.handleGetBookParameters({ book_id: 7 });

        assert.deepStrictEqual(fetched.parameters, upserted.parameters);
    });

    it('returns not_found when no parameters exist yet', async () => {
        const mockDb = new MockDatabase();
        const handlers = new PlanningDocumentHandlers(mockDb);

        const result = await handlers.handleGetBookParameters({ book_id: 42 });

        assert.strictEqual(result.error, 'not_found');
    });
});

describe('PlanningDocumentHandlers.handleExportBookWorksheetMd', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mws-0zk-export-'));
    const exportPath = path.join(tmpDir, 'nested', 'Story_Dossier_Worksheet.md');

    after(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('rejects a non-absolute export_path', async () => {
        const mockDb = new MockDatabase();
        const handlers = new PlanningDocumentHandlers(mockDb);

        await assert.rejects(
            () => handlers.handleExportBookWorksheetMd({ book_id: 7, export_path: 'relative/path.md' }),
            /export_path must be an absolute path/
        );
    });

    it('writes sections to disk, creating parent directories, and is idempotent', async () => {
        const mockDb = new MockDatabase();
        mockDb.setQueryResult('FROM books', [{ id: 7, title: 'Arcane Protocol' }]);
        mockDb.setQueryResult('FROM book_worksheet_sections', [
            { section_key: 'premise', section_title: 'Premise', content: 'A quiet town hides a loud secret.', status: 'approved' },
            { section_key: 'protagonist', section_title: 'Protagonist', content: null, status: 'draft' }
        ]);
        const handlers = new PlanningDocumentHandlers(mockDb);

        const first = await handlers.handleExportBookWorksheetMd({ book_id: 7, export_path: exportPath });
        const firstBytes = fs.readFileSync(exportPath, 'utf8');

        assert.strictEqual(first.section_count, 2);
        assert.match(firstBytes, /# Arcane Protocol — Story Dossier Worksheet/);
        assert.match(firstBytes, /## Premise/);
        assert.match(firstBytes, /A quiet town hides a loud secret\./);
        assert.match(firstBytes, /## Protagonist/);
        assert.match(firstBytes, /_\(empty\)_/);

        const second = await handlers.handleExportBookWorksheetMd({ book_id: 7, export_path: exportPath });
        const secondBytes = fs.readFileSync(exportPath, 'utf8');

        assert.strictEqual(secondBytes, firstBytes, 're-export of unchanged data must be byte-identical');
        assert.strictEqual(second.bytes_written, first.bytes_written);
    });

    it('returns not_found for a missing book', async () => {
        const mockDb = new MockDatabase();
        const handlers = new PlanningDocumentHandlers(mockDb);

        const result = await handlers.handleExportBookWorksheetMd({
            book_id: 999,
            export_path: path.join(tmpDir, 'missing-book.md')
        });

        assert.strictEqual(result.error, 'not_found');
    });
});
