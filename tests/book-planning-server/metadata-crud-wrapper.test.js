// tests/book-planning-server/metadata-crud-wrapper.test.js
// Covers bead mws-a91: expose the generic metadata CRUD tools
// (list/get/create/update/delete_metadata) -- previously implemented only
// as direct methods on the stdio-only MetadataMCPServer
// (src/mcps/metadata-server/index.js) with no HTTP-reachable server wiring
// them in -- on book-planning-server (port 3001), the same way
// assign_book_genres is already wired there.
//
// No live DB writes are exercised here -- pg.Pool connects lazily so no
// postgres service is required to run it.

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { BookPlanningMCPServer } from '../../src/config-mcps/book-planning-server/index.js';

describe('book-planning-server metadata CRUD tool visibility (mws-a91)', () => {
    let server;

    after(async () => {
        if (server && server.db && server.db.pool) {
            await server.db.pool.end();
        }
    });

    it('exposes list/get/create/update/delete_metadata alongside assign_book_genres', () => {
        server = new BookPlanningMCPServer();
        const toolNames = server.tools.map(t => t.name);

        assert.ok(toolNames.includes('assign_book_genres'), 'wrapper should still expose assign_book_genres');

        const metadataTools = ['list_metadata', 'get_metadata', 'create_metadata', 'update_metadata', 'delete_metadata'];
        metadataTools.forEach(name => {
            assert.ok(toolNames.includes(name), `wrapper should expose ${name}`);
            assert.strictEqual(typeof server.getToolHandler(name), 'function', `${name} should have a handler`);
        });
    });

    it('create_metadata requires metadata_key, metadata_value, and metadata_type', () => {
        const createMetadata = server.tools.find(t => t.name === 'create_metadata');
        assert.deepStrictEqual(createMetadata.inputSchema.required, ['metadata_key', 'metadata_value', 'metadata_type']);
    });
});
