// tests/outline-server/promises-weight.test.js
// Bead mws-2o3: weight field on outline_promises + brief ordering. Mocked db.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { PromisesHandlers } from '../../src/mcps/outline-server/handlers/promises-handlers.js';
import { BriefHandlers } from '../../src/mcps/outline-server/handlers/brief-handlers.js';

function mockDb(resolver) {
    const queries = [];
    return { queries, async query(text, params = []) { queries.push({ text, params }); return resolver ? resolver(text, params) : { rows: [] }; } };
}

describe('promise weight', () => {
    it('create_promise round-trips weight', async () => {
        const db = mockDb((t, p) => ({ rows: [{ id: 1, label: p[2], status: 'open', weight: p[7], carries_to_series: false }] }));
        const res = await new PromisesHandlers(db).handleCreatePromise({ label: 'x', weight: 'critical' });
        assert.equal(db.queries[0].params[7], 'critical');
        assert.match(res.content[0].text, /Weight: critical/);
    });

    it('rejects invalid weight on create and update', async () => {
        const h = new PromisesHandlers(mockDb());
        await assert.rejects(h.handleCreatePromise({ label: 'x', weight: 'huge' }), /weight must be one of/);
        await assert.rejects(h.handleUpdatePromise({ promise_id: 1, weight: 'huge' }), /weight must be one of/);
    });

    it('update_promise sets weight', async () => {
        const db = mockDb(() => ({ rows: [{ id: 1, status: 'open', weight: 'high' }] }));
        await new PromisesHandlers(db).handleUpdatePromise({ promise_id: 1, weight: 'high' });
        assert.match(db.queries[0].text, /weight = \$1/);
        assert.deepEqual(db.queries[0].params, ['high', 1]);
    });

    it('list_open_promises filters by min_weight and orders by weight', async () => {
        const db = mockDb(() => ({ rows: [] }));
        await new PromisesHandlers(db).handleListOpenPromises({ min_weight: 'high' });
        const q = db.queries[0];
        assert.match(q.text, /p\.weight = ANY/);
        assert.deepEqual(q.params[0], ['high', 'critical']);
        assert.match(q.text, /ORDER BY CASE p\.weight WHEN 'critical' THEN 0/);
    });

    it('brief orders connected promises critical-first, nulls last', async () => {
        const db = mockDb((t) => {
            if (t.includes('FROM outline_promises p') && t.includes('ANY($1::int[])')) {
                return { rows: [{ id: 1, label: 'a', weight: 'critical' }] };
            }
            if (t.includes('FROM outline_works WHERE id = $1') || t.includes('FROM up')) return { rows: [{ id: 1, work_type: 'scene', title: 'S' }] };
            return { rows: [] };
        });
        try { await new BriefHandlers(db).handleGetSceneBrief({ work_id: 1 }); } catch { /* mock too thin to finish */ }
        const q = db.queries.find(x => x.text.includes('ANY($2::int[])'));
        assert.ok(q, 'promise query ran');
        assert.match(q.text, /ORDER BY CASE p\.weight WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, p\.id/);
    });

    it('migration adds a nullable weight column with CHECK', () => {
        const sql = readFileSync(new URL('../../migrations/057_outline_promises_weight.sql', import.meta.url), 'utf8');
        assert.match(sql, /ADD COLUMN IF NOT EXISTS weight VARCHAR/);
        assert.match(sql, /weight IS NULL OR weight IN \('low','medium','high','critical'\)/);
    });
});
