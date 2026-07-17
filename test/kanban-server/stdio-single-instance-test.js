#!/usr/bin/env node
// test/kanban-server/stdio-single-instance-test.js
// Regression test for bead mws-xi7: src/mcps/kanban-server/index.js has a
// top-level `if (process.env.MCP_STDIO_MODE) { new KanbanMCPServer(); ... }`
// block that used to run at IMPORT TIME whenever MCP_STDIO_MODE was truthy --
// which is always true by the time stdio-adapter.js's own `import { KanbanMCPServer }
// from './index.js'` executes, since stdio-adapter.js sets that env var BEFORE
// the import. That meant every stdio-mode launch silently created TWO
// KanbanMCPServer instances, each attaching its own StdioServerTransport to
// the SAME stdin/stdout, so every tool call executed twice (see mws-xi7 for
// the live create_card double-row reproduction).
//
// This spawns the real stdio-adapter.js as a child process (no mocking) with
// an unreachable-but-valid DATABASE_URL (pg.Pool connects lazily -- see
// test/single-server-runner/route-precedence-test.js -- so no live DB is
// needed for a tools/list round trip) and counts how many times the
// KanbanMCPServer constructor's log line appears on stderr. It must appear
// exactly once per process.
//
// Run: node test/kanban-server/stdio-single-instance-test.js

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const adapterPath = path.join(repoRoot, 'src/mcps/kanban-server/stdio-adapter.js');

let passCount = 0;
let failCount = 0;

function check(label, condition, detail) {
    if (condition) {
        console.log(`  PASS  ${label}`);
        passCount++;
    } else {
        console.log(`  FAIL  ${label}${detail ? ' -- ' + detail : ''}`);
        failCount++;
    }
}

async function main() {
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [adapterPath],
        cwd: repoRoot,
        env: {
            ...process.env,
            MCP_STDIO_MODE: 'true',
            DATABASE_URL: 'postgresql://user:pass@127.0.0.1:1/stdio_single_instance_test_unused'
        },
        stderr: 'pipe'
    });

    let stderrOutput = '';
    transport.stderr?.on('data', (chunk) => {
        stderrOutput += chunk.toString();
    });

    const client = new Client({ name: 'kanban-stdio-single-instance-test', version: '1.0.0' }, { capabilities: {} });

    try {
        await client.connect(transport);

        const toolsRes = await client.listTools();
        check('tools/list succeeds over the stdio transport', Array.isArray(toolsRes.tools) && toolsRes.tools.length > 0);

        // Give the (buggy, pre-fix) second instance's async constructor work
        // a moment to flush its log line before we count occurrences.
        await new Promise((resolve) => setTimeout(resolve, 500));

        const constructorStarts = (stderrOutput.match(/\[KANBAN\] Constructor starting\.\.\./g) || []).length;
        check(
            'KanbanMCPServer constructor runs exactly once per stdio-adapter launch (not twice)',
            constructorStarts === 1,
            `saw ${constructorStarts} occurrences in stderr`
        );

        const stdioModeStarts = (stderrOutput.match(/\[KANBAN\] Running in MCP stdio mode - starting server\.\.\./g) || []).length;
        check(
            "index.js's own top-level auto-run block does not also fire (stdio-adapter.js owns startup)",
            stdioModeStarts === 0,
            `saw ${stdioModeStarts} occurrences in stderr`
        );
    } finally {
        await client.close();
    }

    console.log(`\n${passCount} passed, ${failCount} failed.`);
    process.exitCode = failCount > 0 ? 1 : 0;
}

main().catch((error) => {
    console.error('Test run failed:', error);
    process.exitCode = 1;
});
