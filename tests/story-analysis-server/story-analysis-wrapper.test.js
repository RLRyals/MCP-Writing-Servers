// tests/story-analysis-server/story-analysis-wrapper.test.js
// Covers bead mws-1783883496278-4-e2749385 acceptance criterion:
// "config-mcps: add phase-based story-analysis wrapper (reference handlers,
// don't copy)."
//
// The story-analysis-server config-mcp (port 3016) is a phase-scoped wrapper
// around the StoryAnalysisHandlers class in
// src/mcps/story-analysis-server/handlers/story-analysis-handlers.js -- see
// src/config-mcps/story-analysis-server/index.js. This checks that the
// wrapper registers/exposes the four analysis tools through its
// buildTools()/getToolHandler(), without re-declaring the tool schemas.
//
// No live DB writes are exercised here (the prerequisite migration for
// story_analysis / character_throughlines / story_appreciations /
// problem_solutions merged in PR #84, but this test only checks wrapper
// wiring/tool visibility -- pg.Pool connects lazily so no postgres service
// is required to run it).

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { StoryAnalysisMCPServer } from '../../src/config-mcps/story-analysis-server/index.js';
import { storyAnalysisToolsSchema } from '../../src/mcps/story-analysis-server/schemas/story-analysis-tools-schema.js';

describe('story-analysis-server wrapper tool visibility (mws-4)', () => {
    let server;

    after(async () => {
        if (server && server.db && server.db.pool) {
            await server.db.pool.end();
        }
    });

    it('exposes the four story-analysis tools', () => {
        server = new StoryAnalysisMCPServer();
        const toolNames = server.tools.map(t => t.name);

        assert.ok(toolNames.includes('analyze_story_dynamics'));
        assert.ok(toolNames.includes('track_character_throughlines'));
        assert.ok(toolNames.includes('identify_story_appreciations'));
        assert.ok(toolNames.includes('map_problem_solutions'));
        assert.strictEqual(server.tools.length, 4, 'wrapper should expose exactly the 4 story-analysis tools, no more/no less');
    });

    it('maps each tool to a callable handler function', () => {
        assert.strictEqual(typeof server.getToolHandler('analyze_story_dynamics'), 'function');
        assert.strictEqual(typeof server.getToolHandler('track_character_throughlines'), 'function');
        assert.strictEqual(typeof server.getToolHandler('identify_story_appreciations'), 'function');
        assert.strictEqual(typeof server.getToolHandler('map_problem_solutions'), 'function');
        assert.strictEqual(server.getToolHandler('not_a_real_tool'), null);
    });

    it('references (does not copy) the source schema -- inputSchema matches the handler-owned schema', () => {
        for (const sourceTool of storyAnalysisToolsSchema) {
            const wrapperTool = server.tools.find(t => t.name === sourceTool.name);
            assert.ok(wrapperTool, `wrapper should expose ${sourceTool.name}`);
            assert.deepStrictEqual(
                wrapperTool.inputSchema,
                sourceTool.inputSchema,
                `${sourceTool.name} inputSchema should be spread from the handler's schema, not redeclared`
            );
        }
    });

    it('routes tool calls to the single shared StoryAnalysisHandlers instance (not a copy)', async () => {
        assert.ok(server.storyAnalysisHandlers, 'wrapper should hold a storyAnalysisHandlers instance');

        const sentinel = { content: [{ type: 'text', text: 'spy-called' }] };
        const original = server.storyAnalysisHandlers.handleAnalyzeStoryDynamics;
        let calledWith = null;
        server.storyAnalysisHandlers.handleAnalyzeStoryDynamics = async (args) => {
            calledWith = args;
            return sentinel;
        };

        try {
            const result = await server.getToolHandler('analyze_story_dynamics')({ book_id: 1 });
            assert.deepStrictEqual(calledWith, { book_id: 1 }, 'wrapper should pass args through unchanged');
            assert.strictEqual(result, sentinel, 'wrapper handler map should delegate to the shared handler instance');
        } finally {
            server.storyAnalysisHandlers.handleAnalyzeStoryDynamics = original;
        }
    });
});
