// Tests for AuthorHandlers update_author(email) and delete_author (bead mws-jhj).
// DB is a fake; no live database is touched.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AuthorHandlers } from '../../src/mcps/author-server/handlers/author-handlers.js';
import { authorToolsSchema } from '../../src/mcps/author-server/schemas/author-tools-schema.js';

function fakeDb({ series = [], deleted = [], updated = [] } = {}) {
    const calls = [];
    return {
        calls,
        async query(sql, params) {
            calls.push({ sql, params });
            if (sql.includes('FROM series')) return { rows: series };
            if (sql.includes('DELETE FROM authors')) return { rows: deleted };
            if (sql.includes('UPDATE authors')) return { rows: updated };
            return { rows: [] };
        }
    };
}

describe('update_author email', () => {
    it('builds email = $1 when only email is given', async () => {
        const db = fakeDb({ updated: [{ id: 1, name: 'Test Person', email: 'a@example.test' }] });
        const res = await new AuthorHandlers(db).handleUpdateAuthor({ author_id: 1, email: 'a@example.test' });
        assert.match(db.calls[0].sql, /email = \$1/);
        assert.match(db.calls[0].sql, /WHERE id = \$2/);
        assert.deepStrictEqual(db.calls[0].params, ['a@example.test', 1]);
        assert.strictEqual(res.author.email, 'a@example.test');
    });
    it('schema exposes email and delete_author', () => {
        const upd = authorToolsSchema.find(t => t.name === 'update_author');
        assert.ok(upd.inputSchema.properties.email);
        const del = authorToolsSchema.find(t => t.name === 'delete_author');
        assert.deepStrictEqual(del.inputSchema.required, ['author_id']);
    });
});

describe('delete_author', () => {
    it('refuses when a series references the author and runs no DELETE', async () => {
        const db = fakeDb({ series: [{ id: 7, title: 'Invented Saga' }] });
        const res = await new AuthorHandlers(db).handleDeleteAuthor({ author_id: 3 });
        assert.strictEqual(res.error, 'has_series');
        assert.match(res.message, /7: Invented Saga/);
        assert.deepStrictEqual(res.series, [{ id: 7, title: 'Invented Saga' }]);
        assert.ok(!db.calls.some(c => c.sql.includes('DELETE')));
    });
    it('deletes an unreferenced author', async () => {
        const db = fakeDb({ deleted: [{ id: 3, name: 'Test Person' }] });
        const res = await new AuthorHandlers(db).handleDeleteAuthor({ author_id: 3 });
        assert.deepStrictEqual(res.deleted, { id: 3, name: 'Test Person' });
        assert.deepStrictEqual(db.calls[1].params, [3]);
    });
    it('returns not_found for a missing id', async () => {
        const res = await new AuthorHandlers(fakeDb()).handleDeleteAuthor({ author_id: 99 });
        assert.strictEqual(res.error, 'not_found');
    });
});
