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
// Run: node test/kanban-server/concurrent-claim-test.js

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { DatabaseManager } from '../../src/shared/database.js';
import { ClaimHandlers } from '../../src/mcps/kanban-server/handlers/claim-handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const ITERATIONS = 20;

async function main() {
    const db = new DatabaseManager();
    const claimHandlers = new ClaimHandlers(db);

    const boardResult = await db.query(
        `INSERT INTO fictionlab.kanban_boards (board_key, name, description)
         VALUES ($1, 'Concurrent Claim Test', 'Ephemeral board created by test/kanban-server/concurrent-claim-test.js')
         RETURNING id`,
        [`kanban-claim-race-test-${Date.now()}`]
    );
    const testBoardId = boardResult.rows[0].id;

    let wins = 0;
    let denials = 0;
    let failures = [];

    for (let iteration = 1; iteration <= ITERATIONS; iteration++) {
        const cardResult = await db.query(
            `INSERT INTO fictionlab.kanban_cards (board_id, title, status, assignee, agent_claimable, created_by)
             VALUES ($1, $2, 'ready', NULL, TRUE, 'rebecca')
             RETURNING id`,
            [testBoardId, `Race card #${iteration}`]
        );
        const cardId = cardResult.rows[0].id;

        const agentA = `claude-code:race-a-${iteration}`;
        const agentB = `local-qwen3-14b:race-b-${iteration}`;

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

    // Cascade-delete the ephemeral test board (cards + activity go with it).
    await db.query('DELETE FROM fictionlab.kanban_boards WHERE id = $1', [testBoardId]);
    await db.close();

    console.log(`\n${ITERATIONS} iterations: ${wins} exactly-one-winner, ${denials} exactly-one-already_claimed-denial.`);

    if (failures.length > 0) {
        console.log(`\n${failures.length} FAILURE(S):`);
        for (const f of failures) {
            console.log(JSON.stringify(f, null, 2));
        }
        process.exit(1);
    }

    console.log('All 20 iterations: exactly one winner, one denial, one claimed_by match, one claimed + one claim_denied activity row.');
    process.exit(0);
}

main().catch((error) => {
    console.error('Concurrent claim test crashed:', error);
    process.exit(1);
});
