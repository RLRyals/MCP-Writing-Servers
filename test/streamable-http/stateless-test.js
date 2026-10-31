#!/usr/bin/env node
// test/streamable-http/stateless-test.js
// Proves the stateless streamable-HTTP endpoint (bead mws-10c): a real SDK client talks to
// /mcp, the "server" is torn down and rebuilt on the same port (= container restart), and
// the SAME client keeps working with no reconnect. No database needed.
//
// Run: node test/streamable-http/stateless-test.js
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { handleStreamableHttpPost, methodNotAllowed } from '../../src/shared/streamable-http.js';

let fail = 0;
function check(label, ok, detail) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ' -- ' + detail}`);
    if (!ok) fail++;
}

const fakeServer = {
    serverName: 'fake',
    serverVersion: '1.0.0',
    tools: [{ name: 'echo', description: 'echo', inputSchema: { type: 'object', properties: {} } }],
    getToolHandler: (n) => (n === 'echo' ? async (a) => ({ echoed: a.msg }) : null),
    formatSuccess: (d) => ({ content: [{ type: 'text', text: JSON.stringify(d) }] }),
    formatError: (n, e) => ({ isError: true, content: [{ type: 'text', text: e.message }] })
};

function listen(port) {
    const app = express();
    app.post('/mcp', express.json(), (req, res) => handleStreamableHttpPost(fakeServer, req, res));
    app.get('/mcp', methodNotAllowed);
    return new Promise((resolve) => {
        const s = app.listen(port, () => resolve(s));
    });
}
const close = (s) => new Promise((r) => { s.closeAllConnections?.(); s.close(r); });

const port = 39000 + Math.floor(Math.random() * 500);
let srv = await listen(port);
const client = new Client({ name: 't', version: '1' });
await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));

const tools = await client.listTools();
check('lists tools', tools.tools.length === 1 && tools.tools[0].name === 'echo');
const r1 = await client.callTool({ name: 'echo', arguments: { msg: 'a' } });
check('calls tool', JSON.parse(r1.content[0].text).echoed === 'a');
const bad = await client.callTool({ name: 'nope', arguments: {} });
check('unknown tool -> isError', bad.isError === true);

await close(srv);
srv = await listen(port);
// The first request after a restart may hit the dead keep-alive socket (ECONNRESET) --
// that is the "dropped request the client retries"; the retry must succeed on the same client.
let r2;
for (let i = 0; i < 3 && !r2; i++) {
    try { r2 = await client.callTool({ name: 'echo', arguments: { msg: 'b' } }); } catch { /* retry */ }
}
check('same client works after server restart', r2 && JSON.parse(r2.content[0].text).echoed === 'b');

const g = await fetch(`http://127.0.0.1:${port}/mcp`);
check('GET -> 405', g.status === 405);

await client.close();
await close(srv);
console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
