#!/usr/bin/env node
// tests/kanban-server/github-sync-lib.test.js
// Unit tests for the GH issue #64 GitHub sync poller's pure logic: URL /
// "owner/repo#N" parsing, "Fixes #N"-style closing-keyword extraction, card
// <-> event matching, and the conservative status-transition rule. No DB, no
// gh CLI, no network -- see src/mcps/kanban-server/tools/github-sync-lib.js.
//
// Style note: this repo's tests/ dir uses a global describe/it runner
// (tests/database-admin-server/run-tests.js) that does NOT await test
// bodies, which would silently mis-report any async assertion. Everything
// in github-sync-lib.js is synchronous/pure, so that's not an issue here,
// but this file follows the simpler PASS/FAIL counter convention already
// established by test/kanban-server/smoke-test.js (this repo's other
// self-contained pass/fail script) for consistency with the sibling
// orchestration-level test file (github-sync.test.js), which IS async.
//
// Run: node tests/kanban-server/github-sync-lib.test.js

import {
    parseGithubRef,
    extractClosingReferences,
    refersToSameTarget,
    cardMatchesTargets,
    buildEventKey,
    planCardTransition,
    ELIGIBLE_STATUSES
} from '../../src/mcps/kanban-server/tools/github-sync-lib.js';

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

console.log('github-sync-lib.test.js\n');

// ---------------------------------------------------------------------------
// parseGithubRef
// ---------------------------------------------------------------------------
console.log('parseGithubRef');

{
    const r = parseGithubRef('RLRyals/MCP-Writing-Servers#64');
    check('shorthand owner/repo#N parses', !!r);
    check('shorthand owner', r?.owner === 'RLRyals');
    check('shorthand repo', r?.repo === 'MCP-Writing-Servers');
    check('shorthand number is an integer', r?.number === 64);
    check('shorthand kind is null (ambiguous by design)', r?.kind === null);
}

{
    const r = parseGithubRef('https://github.com/RLRyals/MCP-Electron-App/pull/199');
    check('PR URL parses', !!r);
    check('PR URL owner/repo', r?.owner === 'RLRyals' && r?.repo === 'MCP-Electron-App');
    check('PR URL number', r?.number === 199);
    check("PR URL kind='pr'", r?.kind === 'pr');
}

{
    const r = parseGithubRef('https://github.com/RLRyals/MCP-Electron-App/issues/42');
    check('issue URL parses', !!r);
    check("issue URL kind='issue'", r?.kind === 'issue');
    check('issue URL number', r?.number === 42);
}

{
    const r = parseGithubRef('https://github.com/RLRyals/MCP-Electron-App/pull/199#issuecomment-12345');
    check('PR URL with trailing #fragment still parses', !!r && r.number === 199);
}

{
    const r = parseGithubRef('https://github.com/RLRyals/MCP-Electron-App/pull/199/files');
    check('PR URL with trailing /files still parses', !!r && r.number === 199);
}

{
    const r = parseGithubRef('github.com/RLRyals/MCP-Electron-App/issues/7');
    check('bare github.com/... (no scheme) still parses', !!r && r.number === 7);
}

check('null ref returns null', parseGithubRef(null) === null);
check('empty string returns null', parseGithubRef('') === null);
check('unrelated URL returns null', parseGithubRef('https://example.com/foo/bar') === null);
check('plain prose returns null', parseGithubRef('see the spec doc') === null);
check('bare #123 (no owner/repo) returns null -- ambiguous, not our convention', parseGithubRef('#123') === null);

// ---------------------------------------------------------------------------
// extractClosingReferences ("Fixes #N" etc in a PR body)
// ---------------------------------------------------------------------------
console.log('\nextractClosingReferences');

{
    const refs = extractClosingReferences('This PR does the thing.\n\nFixes #64.', {
        owner: 'RLRyals',
        repo: 'MCP-Writing-Servers'
    });
    check('"Fixes #64." extracts one ref (trailing period stripped)', refs.length === 1, JSON.stringify(refs));
    check('extracted ref defaults to context owner/repo', refs[0]?.owner === 'RLRyals' && refs[0]?.repo === 'MCP-Writing-Servers');
    check('extracted ref number', refs[0]?.number === 64);
}

{
    const cases = ['Closes #5', 'closed #5', 'Fix #5', 'fixes #5', 'FIXED #5', 'Resolve #5', 'resolves #5', 'Resolved #5'];
    for (const body of cases) {
        const refs = extractClosingReferences(body, { owner: 'o', repo: 'r' });
        check(`keyword variant "${body}" extracts #5`, refs.length === 1 && refs[0].number === 5, JSON.stringify(refs));
    }
}

{
    const refs = extractClosingReferences('Closes: #12', { owner: 'o', repo: 'r' });
    check('keyword with colon ("Closes: #12") still extracts', refs.length === 1 && refs[0].number === 12);
}

{
    const refs = extractClosingReferences('Fixes owner2/repo2#99 while here', { owner: 'o', repo: 'r' });
    check('cross-repo shorthand "Fixes owner2/repo2#99" overrides context', refs.length === 1);
    check('cross-repo owner/repo captured, not context', refs[0]?.owner === 'owner2' && refs[0]?.repo === 'repo2');
}

{
    const refs = extractClosingReferences('Resolves https://github.com/o2/r2/issues/8 (see thread)', {
        owner: 'o',
        repo: 'r'
    });
    check('closing keyword followed by a full URL extracts that target', refs.length === 1 && refs[0].number === 8, JSON.stringify(refs));
    check('URL-form closing ref owner/repo taken from the URL, not context', refs[0]?.owner === 'o2' && refs[0]?.repo === 'r2');
}

{
    // Matches GitHub's own behavior: only the token immediately after the
    // keyword is a real closing reference -- "Closes #12, #13" only closes
    // #12 on GitHub itself.
    const refs = extractClosingReferences('Closes #12, #13 and #14', { owner: 'o', repo: 'r' });
    check('comma-separated list only captures the token right after the keyword', refs.length === 1 && refs[0].number === 12, JSON.stringify(refs));
}

{
    const refs = extractClosingReferences('Fixes #9 and also fixes #9 again', { owner: 'o', repo: 'r' });
    check('duplicate refs are deduped', refs.length === 1);
}

{
    const refs = extractClosingReferences('Fixes #1. Also closes #2!', { owner: 'o', repo: 'r' });
    check('multiple distinct keyword occurrences all extracted', refs.length === 2, JSON.stringify(refs));
    check('both numbers present', refs.some((r) => r.number === 1) && refs.some((r) => r.number === 2));
}

check('empty body returns []', extractClosingReferences('', { owner: 'o', repo: 'r' }).length === 0);
check('null body returns []', extractClosingReferences(null, { owner: 'o', repo: 'r' }).length === 0);
check(
    'body with no closing keywords returns []',
    extractClosingReferences('Just a description, no linkage here.', { owner: 'o', repo: 'r' }).length === 0
);
check(
    'a bare #N with no owner/repo context is dropped (never guesses a repo)',
    extractClosingReferences('Fixes #64', {}).length === 0
);

// ---------------------------------------------------------------------------
// refersToSameTarget
// ---------------------------------------------------------------------------
console.log('\nrefersToSameTarget');

check(
    'same owner/repo/number (different case) matches -- repo slugs are case-insensitive',
    refersToSameTarget(
        { owner: 'RLRyals', repo: 'MCP-Electron-App', number: 199 },
        { owner: 'rlryals', repo: 'mcp-electron-app', number: 199 }
    )
);
check(
    'different number does not match',
    !refersToSameTarget({ owner: 'o', repo: 'r', number: 1 }, { owner: 'o', repo: 'r', number: 2 })
);
check(
    'different repo does not match',
    !refersToSameTarget({ owner: 'o', repo: 'r1', number: 1 }, { owner: 'o', repo: 'r2', number: 1 })
);
check('null parsedRef never matches', !refersToSameTarget(null, { owner: 'o', repo: 'r', number: 1 }));

// ---------------------------------------------------------------------------
// cardMatchesTargets
// ---------------------------------------------------------------------------
console.log('\ncardMatchesTargets');

{
    const targets = [{ owner: 'RLRyals', repo: 'MCP-Electron-App', number: 199 }];

    const viaIssueRef = cardMatchesTargets({ issue_ref: 'RLRyals/MCP-Electron-App#199', links: [] }, targets);
    check("matches via card's own issue_ref shorthand", viaIssueRef?.via === 'issue_ref');

    const viaGithubIssueLink = cardMatchesTargets(
        { links: [{ link_type: 'github_issue', ref: 'RLRyals/MCP-Electron-App#199' }] },
        targets
    );
    check("matches via a 'github_issue' link", viaGithubIssueLink?.via === 'github_issue');

    const viaUrlLink = cardMatchesTargets(
        { links: [{ link_type: 'url', ref: 'https://github.com/RLRyals/MCP-Electron-App/pull/199' }] },
        targets
    );
    check("matches via a 'url' link", viaUrlLink?.via === 'url');

    const viaSpecLink = cardMatchesTargets(
        { links: [{ link_type: 'spec', ref: 'RLRyals/MCP-Electron-App#199' }] },
        targets
    );
    check("a 'spec' link_type is NOT considered a GitHub sync source", viaSpecLink === null);

    const noMatch = cardMatchesTargets({ issue_ref: 'RLRyals/MCP-Electron-App#1' }, targets);
    check('no match returns null', noMatch === null);

    const noTargets = cardMatchesTargets({ issue_ref: 'RLRyals/MCP-Electron-App#199' }, []);
    check('empty targets array returns null', noTargets === null);
}

{
    // Issue #64 acceptance criterion: "A PR whose body says 'Fixes #N' also
    // completes cards that reference issue N."
    const targets = [
        { owner: 'RLRyals', repo: 'MCP-Writing-Servers', number: 71 }, // the PR itself
        { owner: 'RLRyals', repo: 'MCP-Writing-Servers', number: 64 } // "Fixes #64" in its body
    ];
    const cardOnTheIssue = cardMatchesTargets({ issue_ref: 'RLRyals/MCP-Writing-Servers#64' }, targets);
    check('a card linked to the closed ISSUE matches a PR event via its "Fixes #N" target', cardOnTheIssue?.via === 'issue_ref');
}

// ---------------------------------------------------------------------------
// buildEventKey / planCardTransition
// ---------------------------------------------------------------------------
console.log('\nplanCardTransition');

check(
    'buildEventKey is stable and includes kind/owner/repo/number',
    buildEventKey({ kind: 'pr_merged', owner: 'RLRyals', repo: 'MCP-Electron-App', number: 199 }) ===
        'pr_merged:RLRyals/MCP-Electron-App#199'
);

const matchingEvent = {
    kind: 'pr_merged',
    owner: 'RLRyals',
    repo: 'MCP-Electron-App',
    number: 199,
    matchTargets: [{ owner: 'RLRyals', repo: 'MCP-Electron-App', number: 199 }]
};

for (const status of ELIGIBLE_STATUSES) {
    const card = { status, issue_ref: 'RLRyals/MCP-Electron-App#199', metadata: {} };
    const plan = planCardTransition(card, matchingEvent);
    check(`status='${status}' + a match -> action='move'`, plan.action === 'move', JSON.stringify(plan));
    check(`status='${status}' move sets toStatus='done'`, plan.toStatus === 'done');
    check(`status='${status}' move preserves fromStatus`, plan.fromStatus === status);
}

for (const status of ['backlog', 'ready', 'claimed', 'blocked', 'done', 'archived']) {
    const card = { status, issue_ref: 'RLRyals/MCP-Electron-App#199', metadata: {} };
    const plan = planCardTransition(card, matchingEvent);
    check(
        `status='${status}' is NEVER touched even with a match (conservative rule)`,
        plan.action === 'skip' && plan.reason === 'ineligible_status',
        JSON.stringify(plan)
    );
}

{
    const card = { status: 'in_progress', issue_ref: 'RLRyals/MCP-Electron-App#1', metadata: {} };
    const plan = planCardTransition(card, matchingEvent);
    check('eligible status but no matching ref -> skip/no_match', plan.action === 'skip' && plan.reason === 'no_match');
}

{
    // Idempotency: a card already stamped with this exact event must be
    // skipped even though its status is still eligible (belt-and-suspenders
    // on top of the status gate itself, per issue #64 spec item 4).
    const eventKey = buildEventKey(matchingEvent);
    const card = {
        status: 'review',
        issue_ref: 'RLRyals/MCP-Electron-App#199',
        metadata: { github_sync: { event: eventKey, url: 'https://github.com/RLRyals/MCP-Electron-App/pull/199', at: '2026-07-08T00:00:00Z' } }
    };
    const plan = planCardTransition(card, matchingEvent);
    check('already-stamped card with the SAME event is skipped (idempotent rerun)', plan.action === 'skip' && plan.reason === 'already_stamped', JSON.stringify(plan));
}

{
    // A DIFFERENT event should still be evaluated on its own merits even if
    // the card carries a stamp from a prior, different event -- but since a
    // card only carries a "review"/"in_progress" status while unresolved,
    // and moving to done for event A makes status ineligible for event B,
    // this mostly matters for two events landing on the same card within a
    // single run (see github-sync.test.js's de-dupe-in-one-run coverage).
    // Here we assert the stamp comparison itself is event-specific.
    const otherEvent = { ...matchingEvent, number: 200, matchTargets: [{ owner: 'RLRyals', repo: 'MCP-Electron-App', number: 200 }] };
    const card = {
        status: 'review',
        links: [{ link_type: 'github_issue', ref: 'RLRyals/MCP-Electron-App#200' }],
        metadata: { github_sync: { event: buildEventKey(matchingEvent), url: 'x', at: 'y' } }
    };
    const plan = planCardTransition(card, otherEvent);
    check('a stamp from a DIFFERENT event does not block a new, distinct match', plan.action === 'move', JSON.stringify(plan));
}

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed. (github-sync-lib.test.js)`);
process.exit(fail > 0 ? 1 : 0);
