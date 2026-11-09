// Tests for delete_location / delete_organization / delete_world_element (bead mws-082).
// DB is a fake; no live database is touched.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { LocationHandlers } from '../../src/mcps/world-server/handlers/location-handlers.js';
import { OrganizationHandlers } from '../../src/mcps/world-server/handlers/organization-handlers.js';
import { WorldElementHandlers } from '../../src/mcps/world-server/handlers/world-element-handlers.js';

function fakeDb({ counts = {}, deleted = [] } = {}) {
    const calls = [];
    return {
        calls,
        async query(sql, params) {
            calls.push({ sql, params });
            if (sql.includes('DELETE FROM')) return { rows: deleted };
            const m = sql.match(/FROM (\w+) WHERE/);
            return { rows: [{ count: m ? (counts[m[1]] || 0) : 0 }] };
        }
    };
}
const noDelete = db => !db.calls.some(c => c.sql.includes('DELETE'));

const cases = [
    { name: 'delete_location', Cls: LocationHandlers, getTools: 'getLocationTools', fn: 'handleDeleteLocation',
      idArg: 'location_id', table: 'locations', refTable: 'organizations', refLabel: /organizations headquartered here \(1\)/ },
    { name: 'delete_organization', Cls: OrganizationHandlers, getTools: 'getOrganizationTools', fn: 'handleDeleteOrganization',
      idArg: 'organization_id', table: 'organizations', refTable: 'world_element_usage', refLabel: /usage records \(1\)/ },
    { name: 'delete_world_element', Cls: WorldElementHandlers, getTools: 'getWorldElementTools', fn: 'handleDeleteWorldElement',
      idArg: 'element_id', table: 'world_elements', refTable: 'outline_scene_events', refLabel: /outline scene events \(1\)/ }
];

for (const c of cases) {
    describe(c.name, () => {
        it('refuses when referenced, lists the references, and runs no DELETE', async () => {
            const db = fakeDb({ counts: { [c.refTable]: 1 } });
            const res = await new c.Cls(db)[c.fn]({ [c.idArg]: 4, confirm: true });
            assert.strictEqual(res.error, 'has_dependents');
            assert.match(res.message, c.refLabel);
            assert.ok(res.dependents.length >= 1);
            assert.ok(noDelete(db));
        });
        it('deletes when unreferenced and returns the removed row', async () => {
            const db = fakeDb({ deleted: [{ id: 4, name: 'Invented Thing' }] });
            const res = await new c.Cls(db)[c.fn]({ [c.idArg]: 4, confirm: true });
            assert.deepStrictEqual(res.deleted, { id: 4, name: 'Invented Thing' });
            const del = db.calls.find(x => x.sql.includes('DELETE'));
            assert.match(del.sql, new RegExp(`DELETE FROM ${c.table} `));
            assert.deepStrictEqual(del.params, [4]);
        });
        it('returns not_found for a missing id', async () => {
            const res = await new c.Cls(fakeDb())[c.fn]({ [c.idArg]: 99, confirm: true });
            assert.strictEqual(res.error, 'not_found');
        });
        it('errors when confirm is missing and touches nothing', async () => {
            const db = fakeDb();
            await assert.rejects(new c.Cls(db)[c.fn]({ [c.idArg]: 4 }), /confirm must be true to delete/);
            assert.strictEqual(db.calls.length, 0);
        });
        it('is exposed in the tool list with required id + confirm', () => {
            const tool = new c.Cls(fakeDb())[c.getTools]().find(t => t.name === c.name);
            assert.deepStrictEqual(tool.inputSchema.required, [c.idArg, 'confirm']);
        });
    });
}

describe('series_id filters on list tools', () => {
    it('get_locations, get_organizations, get_world_elements accept series_id', () => {
        const db = fakeDb();
        for (const [Cls, getTools, name] of [
            [LocationHandlers, 'getLocationTools', 'get_locations'],
            [OrganizationHandlers, 'getOrganizationTools', 'get_organizations'],
            [WorldElementHandlers, 'getWorldElementTools', 'get_world_elements']]) {
            const tool = new Cls(db)[getTools]().find(t => t.name === name);
            assert.ok(tool.inputSchema.properties.series_id, `${name} lacks series_id`);
        }
    });
});
