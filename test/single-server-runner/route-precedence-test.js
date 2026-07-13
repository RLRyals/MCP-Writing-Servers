#!/usr/bin/env node
// test/single-server-runner/route-precedence-test.js
// Regression test for bead mws-1783883496459-8-4a224c2b: the literal
// POST /mcp route in src/single-server-runner.js was registered AFTER the
// parameterized POST /:sessionId route, so Express matched /mcp requests
// against :sessionId (sessionId === 'mcp') before they ever reached the
// JSON-RPC handler -- the session lookup failed and the request 404'd
// instead of getting a JSON-RPC response.
//
// This spawns the real single-server-runner.js as a child process (no
// mocking of Express) and hits it over real HTTP, same "spawn + PASS/FAIL
// check() harness" pattern used by test/kanban-server/smoke-test.js. It
// does NOT touch a live database: DatabaseManager's `pg.Pool` connects
// lazily, so a syntactically-valid-but-unreachable DATABASE_URL is enough
// to boot the server and exercise routing without ever opening a real
// connection (nothing exercised here -- tools/list, initialize, unknown
// session lookup -- touches the DB).
//
// Run: node test/single-server-runner/route-precedence-test.js

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const runnerPath = path.join(repoRoot, 'src', 'single-server-runner.js');

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

function postJson(port, urlPath, body) {
    return fetch(`http://127.0.0.1:${port}${urlPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

async function waitForServer(port, child, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`Server process exited early with code ${child.exitCode}`);
        }
        try {
            const res = await fetch(`http://127.0.0.1:${port}/info`);
            if (res.ok) return;
        } catch {
            // Not up yet -- keep polling.
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Server did not become ready on port ${port} within ${timeoutMs}ms`);
}

async function main() {
    const port = 40000 + Math.floor(Math.random() * 5000);

    // A syntactically valid connection string that is never actually
    // dialed by anything this test exercises (pg.Pool connects lazily).
    const child = spawn(process.execPath, [runnerPath, 'book-planning', String(port)], {
        cwd: repoRoot,
        env: {
            ...process.env,
            DATABASE_URL: 'postgresql://user:pass@127.0.0.1:1/route_precedence_test_unused',
            NODE_ENV: 'test'
        },
        stdio: ['ignore', 'ignore', 'ignore']
    });

    let serverStartFailed = false;
    child.on('error', () => { serverStartFailed = true; });

    try {
        await waitForServer(port, child);

        // --- POST /mcp: literal route must win over /:sessionId ---
        const toolsListRes = await postJson(port, '/mcp', {
            jsonrpc: '2.0', id: 1, method: 'tools/list'
        });
        const toolsListBody = await toolsListRes.json();
        check(
            'POST /mcp tools/list reaches the JSON-RPC handler (HTTP 200)',
            toolsListRes.status === 200,
            `got HTTP ${toolsListRes.status}`
        );
        check(
            'POST /mcp tools/list returns a JSON-RPC result with a tools array',
            Array.isArray(toolsListBody?.result?.tools),
            `body: ${JSON.stringify(toolsListBody)}`
        );
        check(
            'POST /mcp tools/list is NOT the session-not-found shape',
            toolsListBody?.message !== 'No active session with id: mcp'
        );

        const initRes = await postJson(port, '/mcp', {
            jsonrpc: '2.0', id: 2, method: 'initialize'
        });
        const initBody = await initRes.json();
        check(
            'POST /mcp initialize returns a JSON-RPC result with protocolVersion',
            typeof initBody?.result?.protocolVersion === 'string',
            `body: ${JSON.stringify(initBody)}`
        );

        // --- POST /:sessionId: real (non-"mcp") session ids must still hit ---
        // --- the session handler, not the JSON-RPC handler.               ---
        const bogusSessionId = 'not-a-real-session-12345';
        const sessionRes = await postJson(port, `/${bogusSessionId}`, {});
        const sessionBody = await sessionRes.json();
        check(
            'POST /:sessionId for an unknown session still 404s via the session handler',
            sessionRes.status === 404,
            `got HTTP ${sessionRes.status}`
        );
        check(
            'POST /:sessionId 404 body identifies the missing session (not JSON-RPC shaped)',
            sessionBody?.error === 'Session not found' && sessionBody?.message?.includes(bogusSessionId),
            `body: ${JSON.stringify(sessionBody)}`
        );

    } finally {
        await new Promise((resolve) => {
            child.once('exit', resolve);
            child.kill();
            // Belt-and-suspenders in case the process ignores the signal.
            setTimeout(resolve, 3000);
        });
    }

    check('Server process started without spawn error', !serverStartFailed);

    console.log(`\n${passCount} passed, ${failCount} failed`);
    // Intentionally NOT calling process.exit() here: forcing exit while an
    // undici fetch() and a just-killed child_process handle are both still
    // settling triggers a libuv assertion crash on Windows (unrelated to
    // this repo's code -- reproduced with a single fetch + child.kill()).
    // Setting exitCode and letting the event loop drain naturally avoids it.
    process.exitCode = failCount > 0 ? 1 : 0;
}

main().catch((error) => {
    console.error('Test run failed:', error);
    process.exitCode = 1;
});
