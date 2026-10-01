// tests/outline-server/promises-notes.test.js
// Bead mws-bn0: promise notes are returned by list/update/create. Mocked db.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PromisesHandlers } from '../../src/mcps/outline-server/handlers/promises-handlers.js';

const mockDb = (rows) => ({ async query() { return { rows }; } });

describe('promise notes readback', () => {
    it('list_promises includes notes, multi-line preserved', async () => {
        const db = mockDb([{ id: 14, label: 'a', status: 'open', notes: 'QA-INTENDED: one\nQA-INTENDED: two' }]);
        const res = await new PromisesHandlers(db).handleListPromises({});
        assert.match(res.content[0].text, /notes: QA-INTENDED: one\n\s+QA-INTENDED: two/);
    });

    it('list_open_promises includes notes', async () => {
        const db = mockDb([{ id: 1, label: 'a', status: 'open', notes: 'n1' }]);
        const res = await new PromisesHandlers(db).handleListOpenPromises({});
        assert.match(res.content[0].text, /notes: n1/);
    });

    it('update_promise and create_promise echo notes', async () => {
        const db = mockDb([{ id: 1, label: 'a', status: 'open', notes: 'n2', carries_to_series: false }]);
        const h = new PromisesHandlers(db);
        assert.match((await h.handleUpdatePromise({ promise_id: 1, notes: 'n2' })).content[0].text, /notes: n2/);
        assert.match((await h.handleCreatePromise({ label: 'a', notes: 'n2' })).content[0].text, /notes: n2/);
    });

    it('omits notes line when empty', async () => {
        const db = mockDb([{ id: 1, label: 'a', status: 'open', notes: null }]);
        const res = await new PromisesHandlers(db).handleListPromises({});
        assert.doesNotMatch(res.content[0].text, /notes:/);
    });
});
