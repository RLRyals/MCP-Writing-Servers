#!/usr/bin/env node
// test/kanban-server/concurrent-claim-test.js
// The load-bearing test (S11 / GH issue #58 acceptance criterion 5): fires
// two claim_card calls in parallel at the SAME ready/unassigned card and
// asserts exactly one wins. Exercises the real ClaimHandlers class (the
// production code, not a re-implementation) directly against the shared
// DatabaseManager pool, so two truly concurrent connections race the atomic
// `UPDATE ... WHERE status='ready' AND ... RETURNING` against Postgres's own
// row-level locking -- no test-side locking of any kind. Repeats 20x per the
// issue's acceptance criterion to shake out races.
//
// Uses its own ephemeral board (never dev-backlog); deletes it at the end
// (ON DELETE CASCADE takes every card/activity row with it).
//
// Identity cleanup (bead mws-1783883496146-1): claim_card auto-registers any
// first-seen claiming agent id as a permanent kind='agent' row in
// fictionlab.kanban_identities (claim-handlers.js). 20 iterations x 2 racing
// agents = 40 ids minted per run. This test:
//   1. Prefixes every minted id with the reserved 'test:' namespace
//      (identity-handlers.js TEST_NAMESPACE_PREFIX) so a stray row is
//      trivially identifiable and list_identities excludes it unconditionally
//      even if cleanup below never ran.
//   2. Deletes every id it minted in a `finally` block, so cleanup runs even
//      if an assertion throws mid-run.
//   3. Snapshots the identity count before the run and asserts it's back to
//      that exact value after cleanup -- a regression guard against this bug
//      recurring (acceptance criteria: run leaves the count unchanged, and
//      the test asserts this itself).
//
// Run: node test/kanban-server/concurrent-claim-test.js
// For a disposable-DB run (recommended for verifying this file's own
// behavior without touching a real dev database), point DATABASE_URL at a
// throwaway postgres with migrations applied -- see .github/workflows/test.yml
// for the postgres-service pattern this repo already uses in CI.

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { DatabaseManager } from '../../src/shared/database.js';
import { ClaimHandlers } from '../../src/mcps/kanban-server/handlers/claim-handlers.js';
import { TEST_NAMESPACE_PREFIX } from '../../src/mcps/kanban-server/handlers/identity-handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const ITERATIONS = 20;

async function main() {
    const db = new DatabaseManager();
    const claimHandlers = new ClaimHandlers(db);

    const mintedAgentIds = new Set();
    let testBoardId;
    let preRunIdentityCount;

    let wins = 0;
    let denials = 0;
    let failures = [];

    try {
        const preRunCountResult = await db.query('SELECT COUNT(*)::int AS count FROM fictionlab.kanban_identities');
        preRunIdentityCount = preRunCountResult.rows[0].count;

        const boardResult = await db.query(
            `INSERT INTO fictionlab.kanban_boards (board_key, name, description)
             VALUES ($1, 'Concurrent Claim Test', 'Ephemeral board created by test/kanban-server/concurrent-claim-test.js')
             RETURNING id`,
            [`kanban-claim-race-test-${Date.now()}`]
        );
        testBoardId = boardResult.rows[0].id;

        for (let iteration = 1; iteration <= ITERATIONS; iteration++) {
            const cardResult = await db.query(
                `INSERT INTO fictionlab.kanban_cards (board_id, title, status, assignee, agent_claimable, created_by)
                 VALUES ($1, $2, 'ready', NULL, TRUE, 'rebecca')
                 RETURNING id`,
                [testBoardId, `Race card #${iteration}`]
            );
            const cardId = cardResult.rows[0].id;

            const agentA = `${TEST_NAMESPACE_PREFIX}claude-code:race-a-${iteration}`;
            const agentB = `${TEST_NAMESPACE_PREFIX}local-qwen3-14b:race-b-${iteration}`;
            mintedAgentIds.add(agentA);
            mintedAgentIds.add(agentB);

            // Fire both claims truly in parallel -- Promise.all schedules both
            // before either resolves, and DatabaseManager.query() checks out a
            // separate pool connection per call, so both UPDATEs can genuinely
            // race at the Postgres engine level.
            const [resultA, resultB] = await Promise.all([
                claimHandlers.handleClaimCard({ card_id: cardId, agent: agentA }),
                claimHandlers.handleClaimCard({ card_id: cardId, agent: agentB })
            ]);

            const claimedResults = [resultA, resultB].filter((r) => r.claimed);
            const deniedResults = [resultA, resultB].filter((r) => !r.claimed);

            const iterationOk =
                claimedResults.length === 1 &&
                deniedResults.length === 1 &&
                deniedResults[0].reason === 'already_claimed';

            if (claimedResults.length === 1) wins++;
            if (deniedResults.length === 1 && deniedResults[0].reason === 'already_claimed') denials++;

            if (!iterationOk) {
                failures.push({ iteration, resultA, resultB });
            } else {
                const winnerAgent = claimedResults[0].card.assignee;
                const finalCard = await db.query('SELECT claimed_by, assignee, status FROM fictionlab.kanban_cards WHERE id = $1', [cardId]);
                const activityRows = await db.query(
                    `SELECT action, COUNT(*) AS count FROM fictionlab.kanban_activity WHERE card_id = $1 GROUP BY action`,
                    [cardId]
                );
                const claimedCount = activityRows.rows.find((r) => r.action === 'claimed')?.count || 0;
                const deniedCount = activityRows.rows.find((r) => r.action === 'claim_denied')?.count || 0;

                if (finalCard.rows[0].claimed_by !== winnerAgent) {
                    failures.push({ iteration, reason: 'claimed_by mismatch', finalCard: finalCard.rows[0], winnerAgent });
                } else if (parseInt(claimedCount, 10) !== 1 || parseInt(deniedCount, 10) !== 1) {
                    failures.push({ iteration, reason: 'activity row count mismatch', claimedCount, deniedCount });
                } else {
                    console.log(`  iteration ${iteration}: OK (winner=${winnerAgent})`);
                }
            }
        }
    } finally {
        // Cleanup runs even if the loop above threw or an assertion failed
        // above -- this test must never leave state behind, win or lose.
        if (testBoardId) {
            // Cascade-delete the ephemeral test board (cards + activity go with it).
            await db.query('DELETE FROM fictionlab.kanban_boards WHERE id = $1', [testBoardId]);
        }
        if (mintedAgentIds.size > 0) {
            await db.query('DELETE FROM fictionlab.kanban_identities WHERE id = ANY($1::text[])', [
                Array.from(mintedAgentIds)
            ]);
        }
    }

    const postRunCountResult = await db.query('SELECT COUNT(*)::int AS count FROM fictionlab.kanban_identities');
    const postRunIdentityCount = postRunCountResult.rows[0].count;
    await db.close();

    console.log(`\n${ITERATIONS} iterations: ${wins} exactly-one-winner, ${denials} exactly-one-already_claimed-denial.`);
    console.log(`Identity count: ${preRunIdentityCount} before -> ${postRunIdentityCount} after cleanup (minted ${mintedAgentIds.size} throwaway ids).`);

    if (postRunIdentityCount !== preRunIdentityCount) {
        failures.push({
            reason: 'identity_count_regression',
            preRunIdentityCount,
            postRunIdentityCount,
            detail: 'concurrent-claim-test.js must leave fictionlab.kanban_identities exactly as it found it -- see bead mws-1783883496146-1'
        });
    }

    if (failures.length > 0) {
        console.log(`\n${failures.length} FAILURE(S):`);
        for (const f of failures) {
            console.log(JSON.stringify(f, null, 2));
        }
        process.exit(1);
    }

    console.log('All 20 iterations: exactly one winner, one denial, one claimed_by match, one claimed + one claim_denied activity row. Identity registry left unchanged.');
    process.exit(0);
}

main().catch((error) => {
    console.error('Concurrent claim test crashed:', error);
    process.exit(1);
});
