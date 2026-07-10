#!/usr/bin/env node
// test/kanban-server/card-search-test.js
// Exercises the free-text `q` param on list_cards (GH issue #66) against the
// LIVE database, over the real stdio transport -- same pattern as
// test/kanban-server/smoke-test.js (connection setup, check() harness,
// pass/fail summary, process.exit).
//
// Two kinds of coverage:
//  - Read-only assertions against REAL production data (dev-backlog,
//    broadquill-business, ffa-system-gaps) for cross-board search, AND-
//    composition, injection safety, and title-vs-body ranking. These never
//    write anything.
//  - One ephemeral throwaway board (created + torn down here, same as
//    smoke-test.js) for the comment-only-match case, since we don't want to
//    depend on the exact wording of a real production comment.
//
// Run: node test/kanban-server/card-search-test.js
// Requires: DATABASE_URL in .env, the 042_kanban_tables.sql migration
// already applied, and the real ffa-system-gaps board's
// "Marketing Foundation Station — per-book positioning bible" card (created
// 2026-07-09) still present with its current title/body.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });

const { Pool } = pg;

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

async function callTool(client, name, args) {
    const result = await client.callTool({ name, arguments: args || {} });
    if (result.isError) {
        throw new Error(`Tool ${name} returned an error: ${result.content?.[0]?.text}`);
    }
    const text = result.content?.[0]?.text;
    return text ? JSON.parse(text) : undefined;
}

async function main() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    // --- Test scaffolding: an ephemeral board, never the real dev-backlog ---
    const testBoardKey = `kanban-search-test-${Date.now()}`;
    const boardResult = await pool.query(
        `INSERT INTO fictionlab.kanban_boards (board_key, name, description)
         VALUES ($1, 'Kanban Search Test', 'Ephemeral board created by test/kanban-server/card-search-test.js')
         RETURNING id`,
        [testBoardKey]
    );
    const testBoardId = boardResult.rows[0].id;

    await pool.query(
        `INSERT INTO fictionlab.kanban_columns (board_id, status_key, name, position, is_agent_pickup)
         VALUES ($1, 'backlog', 'Backlog', 0, FALSE)`,
        [testBoardId]
    );

    console.log(`Created ephemeral test board ${testBoardKey} (${testBoardId})`);

    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [path.join(repoRoot, 'src/mcps/kanban-server/stdio-adapter.js')],
        cwd: repoRoot,
        env: { ...process.env, MCP_STDIO_MODE: 'true' }
    });

    const client = new Client({ name: 'kanban-card-search-test', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);
    console.log('Connected to kanban-server over stdio.\n');

    try {
        // --- 1. Cross-board free-text search against REAL data, no board filter ---
        // "positioning" is a title hit on ffa-system-gaps's Marketing Foundation
        // Station card AND a body-only hit on three other ffa-system-gaps cards
        // (Reader Intelligence Loop, Promise Ledger MCP, Launch & Ads Station).
        // No board_key/board_id is passed -- this must NOT implicitly scope to
        // dev-backlog (GH issue #66 acceptance criterion).
        const positioningRes = await callTool(client, 'list_cards', { q: 'positioning' });

        const titleHit = positioningRes.cards.find((c) => c.title.includes('per-book positioning bible'));
        check(
            'q="positioning" (no board filter) finds the ffa-system-gaps Marketing Foundation card',
            !!titleHit,
            JSON.stringify(positioningRes.cards.map((c) => c.title))
        );
        check(
            'the matched card carries board_key="ffa-system-gaps" (cross-board attribution)',
            titleHit?.board_key === 'ffa-system-gaps',
            titleHit?.board_key
        );
        check(
            'every returned row carries a board_key (not just the title-hit row)',
            positioningRes.cards.every((c) => !!c.board_key)
        );

        const bodyOnlyHits = positioningRes.cards.filter(
            (c) => c.id !== titleHit?.id && ['Reader Intelligence Loop', 'Promise Ledger MCP', 'Launch & Ads Station (propose-only)'].includes(c.title)
        );
        check(
            'q="positioning" also surfaces the three known body-only-match cards on the same board',
            bodyOnlyHits.length === 3,
            JSON.stringify(positioningRes.cards.map((c) => c.title))
        );

        // --- 2. Title-ranks-above-body ordering (real data, not code-inspection-only) ---
        const titleIdx = positioningRes.cards.findIndex((c) => c.id === titleHit?.id);
        const bodyIdxs = bodyOnlyHits.map((hit) => positioningRes.cards.findIndex((c) => c.id === hit.id));
        check(
            'title hit sorts before every body-only hit',
            titleIdx >= 0 && bodyIdxs.every((idx) => idx > titleIdx),
            `titleIdx=${titleIdx} bodyIdxs=${JSON.stringify(bodyIdxs)}`
        );

        // --- 3. AND-composition: q combined with an existing filter (status) ---
        const qPlusMatchingStatus = await callTool(client, 'list_cards', { q: 'positioning', status: 'backlog' });
        check(
            'q + status="backlog" (the real status of the matching cards) still finds the title-hit card',
            qPlusMatchingStatus.cards.some((c) => c.id === titleHit?.id)
        );
        check(
            'q + status="backlog" results are ALL status=backlog (AND, not OR)',
            qPlusMatchingStatus.cards.every((c) => c.status === 'backlog')
        );

        const qPlusNonMatchingStatus = await callTool(client, 'list_cards', { q: 'positioning', status: 'done' });
        check(
            'q + status="done" (no matching card has this status) narrows to zero results',
            qPlusNonMatchingStatus.cards.length === 0,
            `got ${qPlusNonMatchingStatus.cards.length}`
        );

        // --- 4. Injection / quote safety ---
        const totalActiveCardsRes = await pool.query(`SELECT COUNT(*) FROM fictionlab.kanban_cards WHERE status <> 'archived'`);
        const totalActiveCards = parseInt(totalActiveCardsRes.rows[0].count, 10);

        let injectionThrew = false;
        let injectionRes;
        try {
            injectionRes = await callTool(client, 'list_cards', { q: "test' OR '1'='1" });
        } catch (e) {
            injectionThrew = true;
        }
        check('q with SQL metacharacters does not error', !injectionThrew);
        check(
            'q with SQL metacharacters is treated as an inert literal (zero matches, not "return everything")',
            !!injectionRes && injectionRes.cards.length === 0 && injectionRes.cards.length < totalActiveCards,
            `got ${injectionRes?.cards.length} of ${totalActiveCards} total active cards`
        );

        // --- 5. Comment-only match (ephemeral card, cleaned up in finally) ---
        const searchToken = `zzqsearchtoken${Date.now()}`;
        const commentCardRes = await callTool(client, 'create_card', {
            board_id: testBoardId,
            title: 'Card with a comment-only search hit',
            body: 'This body deliberately does not contain the search token.'
        });
        const commentCardId = commentCardRes.card.id;
        await callTool(client, 'comment_card', {
            card_id: commentCardId,
            author: 'claude-code:card-search-test',
            body: `Found it buried in a comment: ${searchToken}`
        });

        const commentSearchRes = await callTool(client, 'list_cards', { q: searchToken });
        check(
            'q matching only a comment body still finds the card (no board filter passed)',
            commentSearchRes.cards.some((c) => c.id === commentCardId),
            JSON.stringify(commentSearchRes.cards.map((c) => c.id))
        );
        check(
            'the comment-only hit carries the ephemeral board\'s board_key',
            commentSearchRes.cards.find((c) => c.id === commentCardId)?.board_key === testBoardKey
        );

        // Sanity: q for a token nobody typed anywhere returns nothing.
        const noHitRes = await callTool(client, 'list_cards', { q: `nonexistent-token-${Date.now()}-zzz` });
        check('q for a token that matches nothing returns an empty array', noHitRes.cards.length === 0);

        // Sanity: list_cards without q behaves exactly as before (no q key at all).
        const noQRes = await callTool(client, 'list_cards', { board_id: testBoardId });
        check(
            'list_cards without q still returns the ephemeral board\'s card (no regression)',
            noQRes.cards.some((c) => c.id === commentCardId)
        );
    } finally {
        await client.close();
        // Cascade-delete the ephemeral test board (columns/cards/comments/links/activity all go with it).
        await pool.query('DELETE FROM fictionlab.kanban_boards WHERE id = $1', [testBoardId]);
        console.log(`\nCleaned up ephemeral test board ${testBoardKey}`);
        await pool.end();
    }

    console.log(`\n${passCount} passed, ${failCount} failed.`);
    process.exit(failCount > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('card-search-test crashed:', error);
    process.exit(1);
});
