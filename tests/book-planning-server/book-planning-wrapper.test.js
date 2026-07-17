// tests/book-planning-server/book-planning-wrapper.test.js
// Covers bead mws-bpu acceptance criterion: expose the timeline read/delete
// tools that already existed on the unwrapped
// src/mcps/timeline-server/handlers/timeline-event-handlers.js but were
// never registered on any config-mcps phase wrapper.
//
// The book-planning-server config-mcp (port 3001) already exposed
// create_timeline_event; this checks that list_timeline_events and
// delete_timeline_event (siblings from the same TimelineEventHandlers
// instance) are now exposed through buildTools()/getToolHandler() too.
//
// No live DB writes are exercised here -- pg.Pool connects lazily so no
// postgres service is required to run it.

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { BookPlanningMCPServer } from '../../src/config-mcps/book-planning-server/index.js';

describe('book-planning-server wrapper tool visibility (mws-bpu)', () => {
    let server;

    after(async () => {
        if (server && server.db && server.db.pool) {
            await server.db.pool.end();
        }
    });

    it('exposes list_timeline_events and delete_timeline_event alongside create_timeline_event', () => {
        server = new BookPlanningMCPServer();
        const toolNames = server.tools.map(t => t.name);

        assert.ok(toolNames.includes('create_timeline_event'), 'wrapper should still expose create_timeline_event');
        assert.ok(toolNames.includes('list_timeline_events'), 'wrapper should expose list_timeline_events');
        assert.ok(toolNames.includes('delete_timeline_event'), 'wrapper should expose delete_timeline_event');

        assert.strictEqual(typeof server.getToolHandler('list_timeline_events'), 'function');
        assert.strictEqual(typeof server.getToolHandler('delete_timeline_event'), 'function');
    });

    it('delete_timeline_event requires a confirmation flag', () => {
        const deleteEvent = server.tools.find(t => t.name === 'delete_timeline_event');
        assert.deepStrictEqual(deleteEvent.inputSchema.required, ['event_id', 'confirm_deletion']);
    });
});
