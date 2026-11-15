// Bead mws-rw5: create_fact requires series_root_id; list_facts shows it per row. Mocked db.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FactsHandlers } from '../../src/mcps/outline-server/handlers/facts-handlers.js';
import { factsToolsSchema } from '../../src/mcps/outline-server/schemas/outline-tools-schema.js';

const mockDb = (rows) => {
    const calls = [];
    return { calls, async query(sql, params) { calls.push({ sql, params }); return { rows }; } };
};

describe('facts series_root_id (mws-rw5)', () => {
    it('create_fact rejects missing/null root without touching the db', async () => {
        const db = mockDb([{ id: 1, statement: 's' }]);
        const h = new FactsHandlers(db);
        for (const args of [{ statement: 's' }, { series_root_id: null, statement: 's' }]) {
            await assert.rejects(() => h.handleCreateFact(args), /series_root_id is required/);
        }
        assert.strictEqual(db.calls.length, 0);
    });

    it('create_fact inserts the root when given', async () => {
        const db = mockDb([{ id: 1, statement: 's' }]);
        await new FactsHandlers(db).handleCreateFact({ series_root_id: 7, statement: 's' });
        assert.strictEqual(db.calls[0].params[0], 7);
    });

    it('schema requires series_root_id', () => {
        const t = factsToolsSchema.find(x => x.name === 'create_fact');
        assert.ok(t.inputSchema.required.includes('series_root_id'));
    });

    it('update_fact never touches series_root_id', async () => {
        const db = mockDb([{ id: 1, statement: 's' }]);
        await new FactsHandlers(db).handleUpdateFact({ fact_id: 1, statement: 'x' });
        assert.ok(!/series_root_id/.test(db.calls[0].sql));
    });

    it('list_facts prints series_root_id per row, NONE when orphaned', async () => {
        const db = mockDb([
            { id: 1, fact_type: 'w', statement: 'a', series_root_id: 4 },
            { id: 2, fact_type: null, statement: 'b', series_root_id: null }
        ]);
        const text = (await new FactsHandlers(db).handleListFacts({})).content[0].text;
        assert.match(text, /#1 \[w\] \(series_root_id: 4\) a/);
        assert.match(text, /#2 \[untyped\] \(series_root_id: NONE\) b/);
    });
});
