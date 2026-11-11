// mws-1ys: every server that exposes create_X together with a list/get-by-series tool for X
// must also expose update_X. Prevents the series-planning gap where apply-canon found a place
// with get_locations but update_location returned 404. No database is touched: the pool is lazy.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
process.env.MCP_STDIO_MODE = ''; // never auto-start a server on import
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:1/none'; // placeholder; pool is lazy, never connected

// Known pre-existing gaps outside mws-1ys scope (no update_X handler exists or is not yet
// registered there). Each is a follow-up, not a decision that the record is immutable;
// remove an entry when its update_X is added. Do not add new entries without a reason.
const ALLOW_NO_UPDATE = {
    'mcps/biz-server': ['biz_account', 'biz_asset'],
    'mcps/kanban-server': ['board'],
    'mcps/workflow-manager-server': ['workflow_version'],
    'config-mcps/book-planning-server': ['timeline_event', 'trope_instance']
};

const plural = x => (x.endsWith('y') ? x.slice(0, -1) + 'ies' : x.endsWith('s') ? x + 'es' : x + 's');

async function loadServers() {
    const out = [];
    for (const dir of ['mcps', 'config-mcps']) {
        for (const name of readdirSync(join(srcRoot, dir))) {
            const file = join(srcRoot, dir, name, 'index.js');
            if (!existsSync(file)) continue;
            const mod = await import(pathToFileURL(file).href);
            const Cls = Object.values(mod).find(v => typeof v === 'function' && /Server$/.test(v.name));
            if (!Cls) continue;
            let tools;
            try { tools = new Cls().tools; } catch { continue; }
            if (Array.isArray(tools)) out.push({ id: `${dir}/${name}`, tools: tools.map(t => t.name) });
        }
    }
    return out;
}

describe('create_X + list_X servers also expose update_X', () => {
    it('has no missing update_ twins', async () => {
        const servers = await loadServers();
        assert.ok(servers.length >= 10, `only ${servers.length} servers loaded`);
        const gaps = [];
        for (const { id, tools } of servers) {
            const set = new Set(tools);
            for (const t of tools) {
                const m = t.match(/^create_(.+)$/);
                if (!m) continue;
                const x = m[1];
                const lists = set.has(`get_${plural(x)}`) || set.has(`list_${plural(x)}`);
                if (lists && !set.has(`update_${x}`) && !(ALLOW_NO_UPDATE[id] || []).includes(x)) {
                    gaps.push(`${id}: create_${x} + list but no update_${x}`);
                }
            }
        }
        assert.deepStrictEqual(gaps, []);
    });

    it('series-planning exposes update_ and get-by-id tools for places, organizations, world elements', async () => {
        const { SeriesPlanningMCPServer } = await import(pathToFileURL(join(srcRoot, 'config-mcps/series-planning-server/index.js')).href);
        const server = new SeriesPlanningMCPServer();
        const names = server.tools.map(t => t.name);
        for (const n of ['update_location', 'get_location', 'update_organization', 'update_world_element']) {
            assert.ok(names.includes(n), `${n} not in tool list`);
            assert.ok(typeof server.getToolHandler(n) === 'function', `${n} has no handler`);
        }
        const upd = server.tools.find(t => t.name === 'update_location');
        assert.ok(upd.inputSchema.properties.location_id, 'update_location keeps location_id arg');
    });
});
