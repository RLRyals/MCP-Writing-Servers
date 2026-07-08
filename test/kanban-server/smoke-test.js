#!/usr/bin/env node
// test/kanban-server/smoke-test.js
// Exercises every kanban-server tool once against the LIVE database, over the
// real stdio transport (the same path Claude Code / agents use per S11
// decision 6). Creates its own throwaway test board (never touches the real
// dev-backlog board), then deletes that board at the end — ON DELETE CASCADE
// takes its columns/cards/comments/links/activity rows with it, so this test
// leaves nothing behind.
//
// Run: node test/kanban-server/smoke-test.js
// Requires: DATABASE_URL in .env (see src/shared/database.js), the
// 042_kanban_tables.sql migration already applied.

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

    // Safety-net pre-clean: the quick-add sub-test below lands a card on the
    // REAL dev-backlog board (that's the point of the test — no board given
    // -> resolves to dev-backlog). If a prior run of this script was
    // interrupted before its own cleanup ran, sweep any stragglers by title
    // pattern before we start, so dev-backlog never accumulates test junk.
    await pool.query(`DELETE FROM fictionlab.kanban_cards WHERE title LIKE 'Quick-add smoke test %'`);
    // Same for the test-only identities registered by the GH issue #62
    // identities-model block below (plus the two claiming-agent ids this
    // script uses, which claim_card auto-registers as kind='agent' the
    // first time they're ever seen -- see claim-handlers.js), in case a
    // prior run was interrupted before its own cleanup ran.
    await pool.query(
        `DELETE FROM fictionlab.kanban_identities
         WHERE id IN ('smoke-test-mom', 'smoke-test-persona', 'claude-code:smoke-test', 'claude-code:other-session')`
    );

    // --- Test scaffolding: an ephemeral board, never the real dev-backlog ---
    const testBoardKey = `kanban-smoke-test-${Date.now()}`;
    const boardResult = await pool.query(
        `INSERT INTO fictionlab.kanban_boards (board_key, name, description)
         VALUES ($1, 'Kanban Smoke Test', 'Ephemeral board created by test/kanban-server/smoke-test.js')
         RETURNING id`,
        [testBoardKey]
    );
    const testBoardId = boardResult.rows[0].id;

    await pool.query(
        `INSERT INTO fictionlab.kanban_columns (board_id, status_key, name, position, is_agent_pickup)
         VALUES
            ($1, 'backlog', 'Backlog', 0, FALSE),
            ($1, 'ready', 'Ready to work', 1, TRUE),
            ($1, 'in_progress', 'In progress', 2, FALSE),
            ($1, 'review', 'In review', 3, FALSE),
            ($1, 'blocked', 'Blocked', 4, FALSE),
            ($1, 'done', 'Done', 5, FALSE),
            ($1, 'archived', 'Archived', 6, FALSE),
            ($1, 'claimed', 'Claimed', 7, FALSE)`,
        [testBoardId]
    );

    console.log(`Created ephemeral test board ${testBoardKey} (${testBoardId})`);

    const devBacklogResult = await pool.query(
        `SELECT id FROM fictionlab.kanban_boards WHERE board_key = 'dev-backlog'`
    );
    const devBacklogId = devBacklogResult.rows[0]?.id;

    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [path.join(repoRoot, 'src/mcps/kanban-server/stdio-adapter.js')],
        cwd: repoRoot,
        env: { ...process.env, MCP_STDIO_MODE: 'true' }
    });

    const client = new Client({ name: 'kanban-smoke-test', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);
    console.log('Connected to kanban-server over stdio.\n');

    try {
        // 1. list_boards
        const boardsRes = await callTool(client, 'list_boards', {});
        check('list_boards returns our test board', boardsRes.boards.some((b) => b.id === testBoardId));

        // 2. get_board
        const getBoardRes = await callTool(client, 'get_board', { board_id: testBoardId });
        check('get_board returns 8 columns', getBoardRes.columns.length === 8, `got ${getBoardRes.columns.length}`);
        check(
            'get_board ready column is_agent_pickup=true',
            getBoardRes.columns.find((c) => c.status_key === 'ready')?.is_agent_pickup === true
        );

        // 3. create_card (full form)
        const createRes = await callTool(client, 'create_card', {
            board_id: testBoardId,
            title: 'Smoke test card',
            body: 'Body text for the smoke test card.',
            labels: ['test'],
            priority: 'high'
        });
        const cardId = createRes.card.id;
        check('create_card returns a card id', !!cardId);
        check("create_card default status is 'ready'", createRes.card.status === 'ready');
        check("create_card created_by defaults to 'rebecca'", createRes.card.created_by === 'rebecca');
        check(
            "create_card review_policy defaults to 'review-required' (no doc/spec signal)",
            createRes.card.review_policy === 'review-required'
        );

        // 3b. create_card quick-add (title only, no board given -> dev-backlog)
        const quickAddRes = await callTool(client, 'create_card', { title: `Quick-add smoke test ${Date.now()}` });
        check('create_card quick-add succeeds with title only', !!quickAddRes.card.id);
        check(
            'create_card quick-add resolves to dev-backlog',
            quickAddRes.card.board_id === devBacklogId
        );
        // Clean up the quick-add card immediately (it landed on the REAL dev-backlog board).
        // Belt-and-suspenders: delete by id AND by the same title pattern the
        // pre-clean sweep uses, in case anything else produced a stray row.
        await pool.query('DELETE FROM fictionlab.kanban_cards WHERE id = $1', [quickAddRes.card.id]);
        await pool.query(`DELETE FROM fictionlab.kanban_cards WHERE title LIKE 'Quick-add smoke test %'`);

        // 4. list_cards filters
        const unassignedRes = await callTool(client, 'list_cards', { board_id: testBoardId, assignee: '__unassigned__' });
        check('list_cards __unassigned__ finds the new card', unassignedRes.cards.some((c) => c.id === cardId));

        const claimableRes = await callTool(client, 'list_cards', { board_id: testBoardId, agent_claimable_only: true });
        check('list_cards agent_claimable_only finds the new card', claimableRes.cards.some((c) => c.id === cardId));

        const labelRes = await callTool(client, 'list_cards', { board_id: testBoardId, label: 'test' });
        check('list_cards label filter finds the new card', labelRes.cards.some((c) => c.id === cardId));

        // 5. update_card (partial patch)
        const updateRes = await callTool(client, 'update_card', {
            card_id: cardId,
            priority: 'urgent',
            labels: ['test', 'updated']
        });
        check("update_card applied priority='urgent'", updateRes.card.priority === 'urgent');
        check('update_card applied labels patch', JSON.stringify(updateRes.card.labels.sort()) === JSON.stringify(['test', 'updated']));
        check('update_card left title untouched (partial patch)', updateRes.card.title === 'Smoke test card');

        // 5b. update_card review_policy — escalate-only guard (S11 §11.5 decision 5)
        const docsCardRes = await callTool(client, 'create_card', {
            board_id: testBoardId,
            title: 'Docs-only smoke test card',
            body: 'This is a docs-only change, no code touched.'
        });
        const docsCardId = docsCardRes.card.id;
        check("create_card infers review_policy='auto-done' for a docs-only card", docsCardRes.card.review_policy === 'auto-done');

        const escalateRes = await callTool(client, 'update_card', { card_id: docsCardId, review_policy: 'review-required' });
        check("update_card allows escalating auto-done -> review-required", escalateRes.card.review_policy === 'review-required');

        let downgradeRejected = false;
        try {
            await callTool(client, 'update_card', { card_id: docsCardId, review_policy: 'auto-done' });
        } catch (e) {
            downgradeRejected = /downgrad/i.test(e.message);
        }
        check('update_card rejects downgrading review-required -> auto-done', downgradeRejected);

        // 6. claim_card (win)
        const claimRes = await callTool(client, 'claim_card', { card_id: cardId, agent: 'claude-code:smoke-test' });
        check('claim_card wins the claim', claimRes.claimed === true);
        check("claim_card sets status='claimed'", claimRes.card?.status === 'claimed');
        check('claim_card sets assignee to the claiming agent', claimRes.card?.assignee === 'claude-code:smoke-test');

        // 6b. claim_card (second attempt on an already-claimed card)
        const reClaimRes = await callTool(client, 'claim_card', { card_id: cardId, agent: 'claude-code:other-session' });
        check('claim_card second attempt is denied', reClaimRes.claimed === false);
        check("claim_card second attempt reason='already_claimed'", reClaimRes.reason === 'already_claimed', reClaimRes.reason);

        // 7. move_card -> review (review-required card should auto-reassign to rebecca)
        const moveRes = await callTool(client, 'move_card', { card_id: cardId, to_status: 'review', actor: 'claude-code:smoke-test' });
        check("move_card sets status='review'", moveRes.card.status === 'review');
        check(
            "move_card auto-reassigns review-required card to 'rebecca'",
            moveRes.card.assignee === 'rebecca'
        );

        // 8. comment_card
        const commentRes = await callTool(client, 'comment_card', {
            card_id: cardId,
            author: 'claude-code:smoke-test',
            body: 'Finished the smoke test scenario.'
        });
        check('comment_card returns a comment id', !!commentRes.comment.id);

        // 9. add_card_link
        const linkRes = await callTool(client, 'add_card_link', {
            card_id: cardId,
            link_type: 'github_issue',
            ref: 'RLRyals/MCP-Writing-Servers#58',
            label: 'Implementation issue'
        });
        check('add_card_link returns a link id', !!linkRes.link.id);

        // 10. get_card (detail-drawer call)
        const detailRes = await callTool(client, 'get_card', { card_id: cardId });
        check('get_card returns the card', detailRes.card.id === cardId);
        check('get_card returns >=1 comment', detailRes.comments.length >= 1);
        check('get_card returns >=1 link', detailRes.links.length >= 1);
        check('get_card returns activity rows', detailRes.activity.length > 0);
        const actions = detailRes.activity.map((a) => a.action).sort();
        check(
            'get_card activity includes created/claimed/moved/commented/linked',
            ['claim_denied', 'claimed', 'commented', 'created', 'linked', 'moved', 'updated'].every((a) => actions.includes(a)),
            JSON.stringify(actions)
        );

        // 11. archive_card
        const archiveRes = await callTool(client, 'archive_card', { card_id: cardId, actor: 'rebecca' });
        check("archive_card sets status='archived'", archiveRes.card.status === 'archived');

        const excludesArchivedRes = await callTool(client, 'list_cards', { board_id: testBoardId });
        check('list_cards default excludes archived card', !excludesArchivedRes.cards.some((c) => c.id === cardId));

        const includesArchivedRes = await callTool(client, 'list_cards', { board_id: testBoardId, include_archived: true });
        check('list_cards include_archived:true finds the archived card', includesArchivedRes.cards.some((c) => c.id === cardId));

        // --- Human-reserve guard ---
        const humanCardRes = await callTool(client, 'create_card', {
            board_id: testBoardId,
            title: "Rebecca's card",
            assignee: 'rebecca'
        });
        const humanCardId = humanCardRes.card.id;
        check(
            'create_card with assignee=rebecca sets agent_claimable=false (trigger)',
            humanCardRes.card.agent_claimable === false
        );

        const humanClaimRes = await callTool(client, 'claim_card', {
            card_id: humanCardId,
            agent: 'claude-code:smoke-test',
            expected_status: humanCardRes.card.status
        });
        check('claim_card on a rebecca-assigned card is denied', humanClaimRes.claimed === false);
        check(
            "claim_card on a rebecca-assigned card reason='reserved_for_human'",
            humanClaimRes.reason === 'reserved_for_human',
            humanClaimRes.reason
        );

        const humanCardAfter = await pool.query('SELECT assignee, status FROM fictionlab.kanban_cards WHERE id = $1', [humanCardId]);
        check(
            'claim_card denial caused no state change on the rebecca card',
            humanCardAfter.rows[0].assignee === 'rebecca'
        );

        // claim_card must reject agent:'rebecca' outright
        let rejectedRebeccaAgent = false;
        try {
            await callTool(client, 'claim_card', { card_id: humanCardId, agent: 'rebecca' });
        } catch (e) {
            rejectedRebeccaAgent = /rebecca/i.test(e.message);
        }
        check("claim_card rejects agent:'rebecca' outright", rejectedRebeccaAgent);

        // --- S14 fold-in minimum: due_at + due_filter + assignee='rebecca' ---
        // (assignee='rebecca' filtering already exercised implicitly above via
        // humanCardRes/humanCardAfter; this block adds explicit due-date coverage.)
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const overdueCardRes = await callTool(client, 'create_card', {
            board_id: testBoardId,
            title: "Rebecca's overdue card",
            assignee: 'rebecca',
            due_at: yesterday
        });
        const overdueCardId = overdueCardRes.card.id;
        check('create_card accepts due_at', overdueCardRes.card.due_at !== null && overdueCardRes.card.due_at !== undefined);

        const upcomingCardRes = await callTool(client, 'create_card', {
            board_id: testBoardId,
            title: 'Upcoming-deadline card',
            due_at: nextWeek
        });
        const upcomingCardId = upcomingCardRes.card.id;

        const noDeadlineCardRes = await callTool(client, 'create_card', {
            board_id: testBoardId,
            title: 'No-deadline card'
        });
        const noDeadlineCardId = noDeadlineCardRes.card.id;
        check('create_card without due_at leaves due_at null', noDeadlineCardRes.card.due_at === null);

        const overdueListRes = await callTool(client, 'list_cards', { board_id: testBoardId, due_filter: 'overdue' });
        check('list_cards due_filter=overdue finds the overdue card', overdueListRes.cards.some((c) => c.id === overdueCardId));
        check('list_cards due_filter=overdue excludes the upcoming card', !overdueListRes.cards.some((c) => c.id === upcomingCardId));
        check('list_cards due_filter=overdue excludes the no-deadline card', !overdueListRes.cards.some((c) => c.id === noDeadlineCardId));

        const upcomingListRes = await callTool(client, 'list_cards', { board_id: testBoardId, due_filter: 'upcoming' });
        check('list_cards due_filter=upcoming finds the upcoming card', upcomingListRes.cards.some((c) => c.id === upcomingCardId));
        check('list_cards due_filter=upcoming excludes the overdue card', !upcomingListRes.cards.some((c) => c.id === overdueCardId));

        const rebeccaQueueRes = await callTool(client, 'list_cards', { board_id: testBoardId, assignee: 'rebecca' });
        check(
            "list_cards assignee='rebecca' finds her overdue card ('assigned to Rebecca' filter minimum)",
            rebeccaQueueRes.cards.some((c) => c.id === overdueCardId)
        );
        check(
            "list_cards assignee='rebecca' excludes the unassigned upcoming card",
            !rebeccaQueueRes.cards.some((c) => c.id === upcomingCardId)
        );

        // --- GH issue #62: identities model (replaces the hardcoded 'rebecca' human-gate) ---

        // list_identities: seed 'rebecca' (human) is present before we add anything.
        const seedIdentitiesRes = await callTool(client, 'list_identities', {});
        check(
            "list_identities returns the seeded 'rebecca' identity (kind=human)",
            seedIdentitiesRes.identities.some((idn) => idn.id === 'rebecca' && idn.kind === 'human')
        );

        // Register a second human (her mother) and a persona (pen name).
        const humanIdentityId = 'smoke-test-mom';
        const personaIdentityId = 'smoke-test-persona';
        const upsertHumanRes = await callTool(client, 'upsert_identity', {
            id: humanIdentityId,
            display_name: 'Smoke Test Mom',
            kind: 'human'
        });
        check("upsert_identity registers a second human identity", upsertHumanRes.identity.kind === 'human');

        const upsertPersonaRes = await callTool(client, 'upsert_identity', {
            id: personaIdentityId,
            display_name: 'Smoke Test Persona',
            kind: 'persona'
        });
        check("upsert_identity registers a persona identity", upsertPersonaRes.identity.kind === 'persona');

        const afterAddIdentitiesRes = await callTool(client, 'list_identities', {});
        check(
            'list_identities returns seeds plus additions',
            [humanIdentityId, personaIdentityId, 'rebecca'].every(
                (id) => afterAddIdentitiesRes.identities.some((idn) => idn.id === id)
            )
        );

        // upsert_identity is idempotent (update-in-place, not a duplicate row).
        const upsertAgainRes = await callTool(client, 'upsert_identity', {
            id: humanIdentityId,
            display_name: 'Smoke Test Mom (renamed)',
            kind: 'human'
        });
        check(
            'upsert_identity updates in place on a repeat call',
            upsertAgainRes.identity.display_name === 'Smoke Test Mom (renamed)'
        );

        // create_card assigned to the second human: agent_claimable must be
        // FALSE exactly like 'rebecca' -- the gate is identity-kind-driven,
        // not name-driven.
        const momCardRes = await callTool(client, 'create_card', {
            board_id: testBoardId,
            title: "Mom's card",
            assignee: humanIdentityId
        });
        const momCardId = momCardRes.card.id;
        check(
            'create_card assigned to a second human identity sets agent_claimable=false (not just rebecca)',
            momCardRes.card.agent_claimable === false
        );

        const momClaimRes = await callTool(client, 'claim_card', {
            card_id: momCardId,
            agent: 'claude-code:smoke-test',
            expected_status: momCardRes.card.status
        });
        check("claim_card on a second-human-assigned card is denied", momClaimRes.claimed === false);
        check(
            "claim_card on a second-human-assigned card reason='reserved_for_human'",
            momClaimRes.reason === 'reserved_for_human',
            momClaimRes.reason
        );

        // claim_card must also reject agent:<second human id> outright, same
        // as it rejects agent:'rebecca'.
        let rejectedMomAgent = false;
        try {
            await callTool(client, 'claim_card', { card_id: momCardId, agent: humanIdentityId });
        } catch (e) {
            rejectedMomAgent = /human identity/i.test(e.message);
        }
        check("claim_card rejects agent:<second human identity> outright", rejectedMomAgent);

        // create_card assigned to a persona: agent_claimable stays TRUE (a
        // persona/pen-name card may be executed by an agent acting as that
        // persona), and an agent may claim it using the persona's own id.
        const personaCardRes = await callTool(client, 'create_card', {
            board_id: testBoardId,
            title: 'Post to socials as the persona',
            assignee: personaIdentityId
        });
        const personaCardId = personaCardRes.card.id;
        check(
            'create_card assigned to a persona leaves agent_claimable=true',
            personaCardRes.card.agent_claimable === true
        );

        const personaClaimRes = await callTool(client, 'claim_card', {
            card_id: personaCardId,
            agent: personaIdentityId,
            expected_status: personaCardRes.card.status
        });
        check(
            'claim_card succeeds claiming a persona-assigned card as that persona',
            personaClaimRes.claimed === true
        );
        check(
            "claim_card on a persona card leaves it agent-claimable in principle (kind unaffected)",
            personaClaimRes.card?.assignee === personaIdentityId
        );

        // Unknown assignee cannot be written via tools -- create_card and
        // update_card must reject it (no silent auto-create).
        let createRejectedUnknown = false;
        try {
            await callTool(client, 'create_card', {
                board_id: testBoardId,
                title: 'Card for an unregistered assignee',
                assignee: 'smoke-test-unknown-nobody'
            });
        } catch (e) {
            createRejectedUnknown = /unknown assignee/i.test(e.message);
        }
        check('create_card rejects an unknown assignee id', createRejectedUnknown);

        let updateRejectedUnknown = false;
        try {
            await callTool(client, 'update_card', {
                card_id: personaCardId,
                assignee: 'smoke-test-unknown-nobody'
            });
        } catch (e) {
            updateRejectedUnknown = /unknown assignee/i.test(e.message);
        }
        check('update_card rejects an unknown assignee id', updateRejectedUnknown);

        // Fail-safe: if an unrecognized assignee reaches the table anyway
        // (bypassing tool validation via raw SQL), the trigger must still
        // treat it as human -- agent_claimable forced FALSE.
        const bypassCardResult = await pool.query(
            `INSERT INTO fictionlab.kanban_cards (board_id, title, assignee)
             VALUES ($1, 'Bypassed unknown-assignee card', 'smoke-test-unknown-nobody')
             RETURNING agent_claimable`,
            [testBoardId]
        );
        check(
            'DB trigger fail-safe treats an unrecognized assignee (reaching the table directly) as human',
            bypassCardResult.rows[0].agent_claimable === false
        );

        // update_card due_at patch + '__clear__' sentinel
        const setDueRes = await callTool(client, 'update_card', { card_id: noDeadlineCardId, due_at: nextWeek });
        check('update_card sets due_at', !!setDueRes.card.due_at);

        const clearDueRes = await callTool(client, 'update_card', { card_id: noDeadlineCardId, due_at: '__clear__' });
        check("update_card due_at:'__clear__' removes the deadline", clearDueRes.card.due_at === null);

        // A done card with a past due_at must never surface as overdue.
        await callTool(client, 'move_card', { card_id: overdueCardId, to_status: 'done', actor: 'rebecca' });
        const overdueAfterDoneRes = await callTool(client, 'list_cards', { board_id: testBoardId, due_filter: 'overdue' });
        check(
            'list_cards due_filter=overdue excludes a done card even with a past due_at',
            !overdueAfterDoneRes.cards.some((c) => c.id === overdueCardId)
        );
    } finally {
        await client.close();
        // Cascade-delete the ephemeral test board (columns/cards/comments/links/activity all go with it).
        await pool.query('DELETE FROM fictionlab.kanban_boards WHERE id = $1', [testBoardId]);
        // Clean up the test-only identities registered above (GH issue #62),
        // plus the two claiming-agent ids auto-registered as kind='agent' by
        // claim_card -- this smoke test leaves nothing behind, same as the board.
        await pool.query(
            `DELETE FROM fictionlab.kanban_identities
             WHERE id IN ('smoke-test-mom', 'smoke-test-persona', 'claude-code:smoke-test', 'claude-code:other-session')`
        );
        console.log(`\nCleaned up ephemeral test board ${testBoardKey}`);
        await pool.end();
    }

    console.log(`\n${passCount} passed, ${failCount} failed.`);
    process.exit(failCount > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('Smoke test crashed:', error);
    process.exit(1);
});
