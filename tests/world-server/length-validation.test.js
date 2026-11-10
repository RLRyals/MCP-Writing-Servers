// Handler-path tests for string-length validation (bead mws-1ut).
// DB is a fake; no live database is touched.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { LocationHandlers } from '../../src/mcps/world-server/handlers/location-handlers.js';
import { OrganizationHandlers } from '../../src/mcps/world-server/handlers/organization-handlers.js';
import { WorldElementHandlers } from '../../src/mcps/world-server/handlers/world-element-handlers.js';

function fakeDb() {
    const calls = [];
    return {
        calls,
        async query(sql, params) {
            calls.push({ sql, params });
            return { rows: [{ id: 1, name: 'n', element_type: 't', rarity: 'common', location_type: 't', organization_type: 't', status: 'active', description: 'd', limitations: [], rules: [] }] };
        }
    };
}

const cases = [
    { label: 'create_world_element', Cls: WorldElementHandlers, fn: 'handleCreateWorldElement',
      base: { series_id: 1, name: 'n', element_type: 'magic_system', description: 'd' }, field: 'rarity', limit: 100 },
    { label: 'update_world_element', Cls: WorldElementHandlers, fn: 'handleUpdateWorldElement',
      base: { element_id: 1 }, field: 'element_type', limit: 100 },
    { label: 'create_location', Cls: LocationHandlers, fn: 'handleCreateLocation',
      base: { series_id: 1, name: 'n', location_type: 'city' }, field: 'climate', limit: 100 },
    { label: 'update_location', Cls: LocationHandlers, fn: 'handleUpdateLocation',
      base: { location_id: 1 }, field: 'terrain', limit: 100 },
    { label: 'create_organization', Cls: OrganizationHandlers, fn: 'handleCreateOrganization',
      base: { series_id: 1, name: 'n', organization_type: 'guild', description: 'd' }, field: 'status', limit: 100 },
    { label: 'update_organization', Cls: OrganizationHandlers, fn: 'handleUpdateOrganization',
      base: { organization_id: 1 }, field: 'organization_type', limit: 100 }
];

for (const c of cases) {
    describe(c.label, () => {
        it(`rejects ${c.field} over ${c.limit} characters (field, limit, length) before any SQL`, async () => {
            const db = fakeDb();
            const args = { ...c.base, [c.field]: 'x'.repeat(c.limit + 112) };
            await assert.rejects(
                new c.Cls(db)[c.fn](args),
                err => err.name === 'FieldValidationError'
                    && err.message.includes(`${c.field}: ${c.limit + 112} characters, limit ${c.limit}`)
            );
            assert.strictEqual(db.calls.length, 0, 'no INSERT/UPDATE may run');
        });

        it(`accepts ${c.field} exactly at ${c.limit} characters`, async () => {
            const db = fakeDb();
            await new c.Cls(db)[c.fn]({ ...c.base, [c.field]: 'x'.repeat(c.limit) });
            assert.ok(db.calls.length >= 1, 'query ran');
        });
    });
}

describe('create_world_element', () => {
    it('the reported failure (212-character rarity sentence) is a clear field error', async () => {
        const db = fakeDb();
        await assert.rejects(
            new WorldElementHandlers(db).handleCreateWorldElement({
                series_id: 1, name: 'Ember Rite', element_type: 'magic_system', description: 'd',
                rarity: 'Extremely rare; '.padEnd(212, 'a')
            }),
            /rarity: 212 characters, limit 100/
        );
    });
});
