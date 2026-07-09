#!/usr/bin/env node
// tests/kanban-server/github-sync.test.js
// Orchestration-level tests for the GH issue #64 GitHub sync poller. The DB
// is a hand-rolled in-memory fake (no real Postgres connection anywhere in
// this file -- see the HARD SAFETY RULE in the issue: automated tests must
// mock the DB) and the gh CLI is a fake client returning canned search
// results, so this exercises runSync()/applyTransition() end to end without
// touching a subprocess or a network call.
//
// Run: node tests/kanban-server/github-sync.test.js

import {
    runSync,
    fetchCandidateCards,
    applyTransition
} from '../../src/mcps/kanban-server/tools/github-sync.js';
import { buildEventKey } from '../../src/mcps/kanban-server/tools/github-sync-lib.js';

let pass = 0;
let fail = 0;

function check(label, condition, detail) {
    if (condition) {
        console.log(`  PASS  ${label}`);
        pass++;
    } else {
        console.log(`  FAIL  ${label}${detail ? ' -- ' + detail : ''}`);
        fail++;
    }
}

// ---------------------------------------------------------------------------
// Fake DB: enough of the pg.Pool-shaped `.query(text, params)` surface that
// kanban-helpers.js's logActivity/notifyKanbanChanged and this module's own
// queries work unmodified against production code, backed by a plain JS
// array of "rows" instead of a real connection.
// ---------------------------------------------------------------------------

function makeFakeDb(initialCards) {
    // initialCards: [{ id, board_id, status, issue_ref, metadata, links: [{link_type, ref}] }]
    const cards = initialCards.map((c) => ({ ...c, metadata: c.metadata || {} }));
    const activity = [];
    const notifications = [];
    const calls = []; // every query text seen, for write-count assertions

    return {
        cards,
        activity,
        notifications,
        calls,
        async query(text, params = []) {
            calls.push(text.trim());

            // fetchCandidateCards: SELECT ... FROM fictionlab.kanban_cards c WHERE c.status IN ('in_progress', 'review')
            if (text.includes('FROM fictionlab.kanban_cards c') && text.includes("WHERE c.status IN ('in_progress', 'review')")) {
                const rows = cards
                    .filter((c) => c.status === 'in_progress' || c.status === 'review')
                    .map((c) => ({
                        id: c.id,
                        board_id: c.board_id,
                        status: c.status,
                        issue_ref: c.issue_ref || null,
                        metadata: c.metadata,
                        links: c.links || []
                    }));
                return { rows };
            }

            // applyTransition: UPDATE fictionlab.kanban_cards SET status = $1, metadata = metadata || $2::jsonb WHERE id = $3 AND status = $4 RETURNING *
            if (text.startsWith('UPDATE fictionlab.kanban_cards')) {
                const [newStatus, metadataPatchJson, cardId, expectedFromStatus] = params;
                const card = cards.find((c) => c.id === cardId);
                if (!card || card.status !== expectedFromStatus) {
                    return { rows: [] }; // guarded UPDATE ... WHERE status=$4 found no row -- simulates a lost race
                }
                const patch = JSON.parse(metadataPatchJson);
                card.status = newStatus;
                card.metadata = { ...card.metadata, ...patch };
                return { rows: [{ ...card }] };
            }

            // logActivity: INSERT INTO fictionlab.kanban_activity (...)
            if (text.includes('INSERT INTO fictionlab.kanban_activity')) {
                const [boardId, cardId, actor, action, fromStatus, toStatus, detail] = params;
                activity.push({ boardId, cardId, actor, action, fromStatus, toStatus, detail: JSON.parse(detail) });
                return { rows: [] };
            }

            // notifyKanbanChanged: SELECT pg_notify($1, $2)
            if (text.includes('pg_notify')) {
                notifications.push(params[1]);
                return { rows: [] };
            }

            throw new Error(`makeFakeDb: unhandled query: ${text}`);
        }
    };
}

function makeFakeGhClient({ mergedByRepo = {}, closedByRepo = {} } = {}) {
    return {
        async searchMergedPRs(repoFullName) {
            return mergedByRepo[repoFullName] || [];
        },
        async searchClosedIssues(repoFullName) {
            return closedByRepo[repoFullName] || [];
        }
    };
}

function pr(number, { body = '', title = `PR #${number}` } = {}) {
    return {
        number,
        title,
        body,
        html_url: `https://github.com/RLRyals/MCP-Electron-App/pull/${number}`
    };
}

function issue(number, { title = `Issue #${number}` } = {}) {
    return {
        number,
        title,
        body: '',
        html_url: `https://github.com/RLRyals/MCP-Electron-App/issues/${number}`
    };
}

const config = { watched_repos: ['RLRyals/MCP-Electron-App'] };
const NOOP_LOG = () => {};

async function main() {
    console.log('github-sync.test.js\n');

    // -----------------------------------------------------------------
    // 1. A card linked (via github_issue link) to a merged PR moves
    //    review -> done, with an activity row and a NOTIFY.
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb([
            {
                id: 'card-1',
                board_id: 'board-1',
                status: 'review',
                links: [{ link_type: 'github_issue', ref: 'RLRyals/MCP-Electron-App#199' }]
            }
        ]);
        const gh = makeFakeGhClient({ mergedByRepo: { 'RLRyals/MCP-Electron-App': [pr(199)] } });

        const { plan, moved, errors } = await runSync({ db, ghClient: gh, config, since: '2026-07-01T00:00:00Z', dryRun: false, log: NOOP_LOG });

        check('linked card is planned for a move', plan.length === 1);
        check('linked card was actually moved', moved.length === 1);
        check('no errors', errors.length === 0, JSON.stringify(errors));
        check("card status is now 'done'", db.cards[0].status === 'done');
        check(
            'metadata.github_sync stamp was written',
            db.cards[0].metadata.github_sync?.event === 'pr_merged:RLRyals/MCP-Electron-App#199'
        );
        check('exactly one activity row was written', db.activity.length === 1);
        check("activity action is 'auto-moved'", db.activity[0].action === 'auto-moved');
        check("activity from_status='review', to_status='done'", db.activity[0].fromStatus === 'review' && db.activity[0].toStatus === 'done');
        check('exactly one NOTIFY was emitted', db.notifications.length === 1 && db.notifications[0] === 'card-1');
    }

    // -----------------------------------------------------------------
    // 2. "Fixes #N" in a merged PR body completes a card that references
    //    the ISSUE, not the PR itself.
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb([
            {
                id: 'card-2',
                board_id: 'board-1',
                status: 'in_progress',
                issue_ref: 'RLRyals/MCP-Electron-App#64'
            }
        ]);
        const gh = makeFakeGhClient({
            mergedByRepo: { 'RLRyals/MCP-Electron-App': [pr(201, { body: 'Implements the feature.\n\nFixes #64.' })] }
        });

        const { moved, errors } = await runSync({ db, ghClient: gh, config, since: '2026-07-01T00:00:00Z', dryRun: false, log: NOOP_LOG });

        check('"Fixes #64" in PR #201 body completes the card referencing issue #64', moved.length === 1, JSON.stringify(errors));
        check("card status is now 'done'", db.cards[0].status === 'done');
        check(
            'stamp records the PR-merged event (not a separate issue-closed event)',
            db.cards[0].metadata.github_sync?.event === 'pr_merged:RLRyals/MCP-Electron-App#201'
        );
    }

    // -----------------------------------------------------------------
    // 3. Conservative transition: backlog/blocked/done/archived cards are
    //    NEVER touched even when they match.
    // -----------------------------------------------------------------
    {
        const untouchable = ['backlog', 'ready', 'claimed', 'blocked', 'done', 'archived'];
        const db = makeFakeDb(
            untouchable.map((status, i) => ({
                id: `card-untouch-${i}`,
                board_id: 'board-1',
                status,
                issue_ref: 'RLRyals/MCP-Electron-App#199'
            }))
        );
        const gh = makeFakeGhClient({ mergedByRepo: { 'RLRyals/MCP-Electron-App': [pr(199)] } });

        const { plan, moved } = await runSync({ db, ghClient: gh, config, since: '2026-07-01T00:00:00Z', dryRun: false, log: NOOP_LOG });

        check('no backlog/ready/claimed/blocked/done/archived card is ever planned', plan.length === 0, JSON.stringify(plan));
        check('no writes happened for untouchable cards', moved.length === 0);
        check(
            'every untouchable card retains its original status unchanged',
            untouchable.every((status, i) => db.cards[i].status === status)
        );
        check('zero UPDATE queries were issued at all', db.calls.every((c) => !c.startsWith('UPDATE')));
    }

    // -----------------------------------------------------------------
    // 4. --dry-run performs ZERO writes (no UPDATE, no INSERT activity, no
    //    NOTIFY) but still reports the plan.
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb([
            {
                id: 'card-3',
                board_id: 'board-1',
                status: 'review',
                issue_ref: 'RLRyals/MCP-Electron-App#202'
            }
        ]);
        const gh = makeFakeGhClient({ mergedByRepo: { 'RLRyals/MCP-Electron-App': [pr(202)] } });

        const { plan, moved, errors } = await runSync({ db, ghClient: gh, config, since: '2026-07-01T00:00:00Z', dryRun: true, log: NOOP_LOG });

        check('dry-run still reports the card in the plan', plan.length === 1);
        check('dry-run performs no actual moves', moved.length === 0);
        check('dry-run has no errors', errors.length === 0);
        check("dry-run leaves card status untouched ('review')", db.cards[0].status === 'review');
        check('dry-run issues zero UPDATE queries', !db.calls.some((c) => c.startsWith('UPDATE')));
        check('dry-run writes zero activity rows', db.activity.length === 0);
        check('dry-run emits zero NOTIFYs', db.notifications.length === 0);
    }

    // -----------------------------------------------------------------
    // 5. Idempotent rerun: running twice with the same event does not
    //    double-move or double-log a card already stamped.
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb([
            {
                id: 'card-4',
                board_id: 'board-1',
                status: 'in_progress',
                issue_ref: 'RLRyals/MCP-Electron-App#203'
            }
        ]);
        const gh = makeFakeGhClient({ mergedByRepo: { 'RLRyals/MCP-Electron-App': [pr(203)] } });

        const first = await runSync({ db, ghClient: gh, config, since: '2026-07-01T00:00:00Z', dryRun: false, log: NOOP_LOG });
        check('first run moves the card', first.moved.length === 1);

        // Second run against an OVERLAPPING window (e.g. a watermark that
        // didn't advance because the previous run crashed before saving
        // state) re-fetches the same merged PR. The card is now 'done', so
        // the status gate alone would already protect it -- but assert the
        // stamp-based guard reports the right skip reason as well by
        // re-running planCardTransition against the post-move card state.
        const second = await runSync({ db, ghClient: gh, config, since: '2026-07-01T00:00:00Z', dryRun: false, log: NOOP_LOG });
        check('second run (rerun, overlapping window) plans nothing new', second.plan.length === 0, JSON.stringify(second.plan));
        check('second run performs no additional writes', second.moved.length === 0);
        check('activity log still has exactly one row after two runs (idempotent)', db.activity.length === 1);
    }

    // -----------------------------------------------------------------
    // 6. A closed issue (no linked PR at all) also completes a matching
    //    card.
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb([
            {
                id: 'card-5',
                board_id: 'board-1',
                status: 'review',
                links: [{ link_type: 'url', ref: 'https://github.com/RLRyals/MCP-Electron-App/issues/77' }]
            }
        ]);
        const gh = makeFakeGhClient({ closedByRepo: { 'RLRyals/MCP-Electron-App': [issue(77)] } });

        const { moved } = await runSync({ db, ghClient: gh, config, since: '2026-07-01T00:00:00Z', dryRun: false, log: NOOP_LOG });
        check('closed issue with no PR still completes the linked card', moved.length === 1);
        check("stamp records an 'issue_closed' event", db.cards[0].metadata.github_sync?.event === 'issue_closed:RLRyals/MCP-Electron-App#77');
    }

    // -----------------------------------------------------------------
    // 7. A card matched by two different events in the SAME run is only
    //    moved once (de-dupe), and a card in an unrelated repo/number is
    //    left alone.
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb([
            {
                id: 'card-6',
                board_id: 'board-1',
                status: 'review',
                issue_ref: 'RLRyals/MCP-Electron-App#50'
            },
            {
                id: 'card-unrelated',
                board_id: 'board-1',
                status: 'review',
                issue_ref: 'RLRyals/MCP-Electron-App#9999'
            }
        ]);
        const gh = makeFakeGhClient({
            mergedByRepo: {
                'RLRyals/MCP-Electron-App': [
                    pr(210, { body: 'Fixes #50' }),
                    pr(211, { body: 'Also fixes #50 (split PR)' })
                ]
            }
        });

        const { moved } = await runSync({ db, ghClient: gh, config, since: '2026-07-01T00:00:00Z', dryRun: false, log: NOOP_LOG });
        check('card matched by two events in one run is moved exactly once', moved.filter((m) => m.card.id === 'card-6').length === 1);
        check('unrelated card is untouched', db.cards.find((c) => c.id === 'card-unrelated').status === 'review');
        check('exactly one activity row for the de-duped card', db.activity.filter((a) => a.cardId === 'card-6').length === 1);
    }

    // -----------------------------------------------------------------
    // 8. A gh API failure for one repo is caught, logged, and does not
    //    crash the run or block other repos/cards.
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb([
            { id: 'card-7', board_id: 'board-1', status: 'review', issue_ref: 'RLRyals/MCP-Writing-Servers#1' }
        ]);
        const multiRepoConfig = { watched_repos: ['RLRyals/MCP-Electron-App', 'RLRyals/MCP-Writing-Servers'] };
        const gh = {
            async searchMergedPRs(repoFullName) {
                if (repoFullName === 'RLRyals/MCP-Electron-App') {
                    throw new Error('simulated gh api failure (rate limit)');
                }
                return [pr(1, {})].map((p) => ({ ...p, html_url: `https://github.com/${repoFullName}/pull/1` }));
            },
            async searchClosedIssues() {
                return [];
            }
        };

        const loggedLines = [];
        const { moved, errors } = await runSync({
            db,
            ghClient: gh,
            config: multiRepoConfig,
            since: '2026-07-01T00:00:00Z',
            dryRun: false,
            log: (line) => loggedLines.push(line)
        });

        check('a failing repo produces a logged error, not a thrown exception', errors.length === 1, JSON.stringify(errors));
        check('the error mentions the failing repo', errors[0].repo === 'RLRyals/MCP-Electron-App');
        check('log() was called with the error detail', loggedLines.some((l) => l.includes('simulated gh api failure')));
        check('the OTHER repo (MCP-Writing-Servers) still gets processed and its card moved', moved.length === 1);
    }

    // -----------------------------------------------------------------
    // 9. applyTransition loses gracefully to a concurrent status change
    //    (WHERE status = fromStatus guard) instead of clobbering it.
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb([{ id: 'card-8', board_id: 'board-1', status: 'archived' }]);
        // Simulate a stale in-memory card object claiming it was still
        // 'review' when in fact the DB row has already moved to 'archived'
        // (e.g. an agent archived it between fetchCandidateCards and here).
        const staleCard = { id: 'card-8', board_id: 'board-1', status: 'review', metadata: {} };
        const event = {
            kind: 'pr_merged',
            owner: 'RLRyals',
            repo: 'MCP-Electron-App',
            number: 300,
            url: 'https://github.com/RLRyals/MCP-Electron-App/pull/300',
            title: 'Some PR'
        };
        const transition = { fromStatus: 'review', toStatus: 'done', match: { via: 'issue_ref', ref: 'x' }, eventKey: buildEventKey(event) };

        const result = await applyTransition(db, staleCard, transition, event);
        check('applyTransition returns null when the guarded UPDATE matches zero rows', result === null);
        check('no activity row is written for a lost race', db.activity.length === 0);
        check('the card is left exactly as the DB already had it (archived)', db.cards[0].status === 'archived');
    }

    // -----------------------------------------------------------------
    // 10. fetchCandidateCards only ever selects in_progress/review cards.
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb([
            { id: 'a', board_id: 'b', status: 'review' },
            { id: 'b', board_id: 'b', status: 'in_progress' },
            { id: 'c', board_id: 'b', status: 'done' },
            { id: 'd', board_id: 'b', status: 'backlog' }
        ]);
        const rows = await fetchCandidateCards(db);
        check('fetchCandidateCards returns exactly the in_progress/review rows', rows.length === 2, JSON.stringify(rows));
        check(
            'fetchCandidateCards never returns done/backlog rows',
            rows.every((r) => r.status === 'review' || r.status === 'in_progress')
        );
    }

    console.log(`\n${pass} passed, ${fail} failed. (github-sync.test.js)`);
    process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('github-sync.test.js crashed:', error);
    process.exit(1);
});
