// tests/biz-server/company-handlers.test.js (bead mws-9ht) -- DB fully mocked.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CompanyHandlers } from '../../src/mcps/biz-server/handlers/company-handlers.js';
import { bizToolsSchema } from '../../src/mcps/biz-server/schemas/biz-tools-schema.js';

const mockDb = (fn) => {
    const db = {
        queries: [],
        async query(text, params = []) {
            db.queries.push({ text, params });
            return fn(text, params);
        }
    };
    return db;
};

const dupError = () => {
    const e = new Error('duplicate key');
    e.code = '23505';
    return e;
};

describe('company handlers', () => {
    it('list returns rows', async () => {
        const h = new CompanyHandlers(mockDb(() => ({ rows: [{ id: 1, name: 'A' }] })));
        assert.deepStrictEqual((await h.handleListBizCompanies()).companies, [{ id: 1, name: 'A' }]);
    });

    it('create trims and inserts', async () => {
        const db = mockDb((t, p) => ({ rows: [{ id: 2, name: p[0] }] }));
        const r = await new CompanyHandlers(db).handleCreateBizCompany({ name: '  Acme ' });
        assert.strictEqual(r.company.name, 'Acme');
    });

    it('create requires name', async () => {
        const h = new CompanyHandlers(mockDb(() => ({ rows: [] })));
        await assert.rejects(h.handleCreateBizCompany({}), /name is required/);
    });

    it('create duplicate name gives clean error', async () => {
        const db = mockDb(() => { throw dupError(); });
        await assert.rejects(new CompanyHandlers(db).handleCreateBizCompany({ name: 'Acme' }), /"Acme" already exists/);
    });

    it('closing is an UPDATE status change, never a DELETE', async () => {
        const db = mockDb(() => ({ rows: [{ id: 1, status: 'closed' }] }));
        const r = await new CompanyHandlers(db).handleUpdateBizCompany({ id: 1, status: 'closed' });
        assert.strictEqual(r.company.status, 'closed');
        assert.match(db.queries[0].text, /UPDATE/);
        assert.match(db.queries[0].text, /closed_on = COALESCE/);
        assert.ok(!db.queries.some(q => /DELETE/i.test(q.text)));
    });

    it('reopening clears closed_on', async () => {
        const db = mockDb(() => ({ rows: [{ id: 1 }] }));
        await new CompanyHandlers(db).handleUpdateBizCompany({ id: 1, status: 'active' });
        assert.match(db.queries[0].text, /closed_on = NULL/);
    });

    it('update validates status, id, empty patch, and missing company', async () => {
        const h = new CompanyHandlers(mockDb(() => ({ rows: [] })));
        await assert.rejects(h.handleUpdateBizCompany({ id: 1, status: 'x' }), /status must be/);
        await assert.rejects(h.handleUpdateBizCompany({}), /id is required/);
        await assert.rejects(h.handleUpdateBizCompany({ id: 1 }), /No fields/);
        await assert.rejects(h.handleUpdateBizCompany({ id: 9, name: 'Z' }), /not found/);
    });

    it('update rename duplicate gives clean error', async () => {
        const db = mockDb(() => { throw dupError(); });
        await assert.rejects(new CompanyHandlers(db).handleUpdateBizCompany({ id: 1, name: 'B' }), /"B" already exists/);
    });

    it('tools are in the schema', () => {
        for (const n of ['list_biz_companies', 'create_biz_company', 'update_biz_company']) {
            assert.ok(bizToolsSchema.some(t => t.name === n), n);
        }
    });
});
