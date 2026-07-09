#!/usr/bin/env node
// src/mcps/kanban-server/tools/github-sync.js
// GitHub sync poller (GH issue #64): when a watched repo's PR merges or its
// issue closes, auto-move the matching kanban card review/in_progress ->
// done. A LOCAL scheduled-task script (not a server) -- see the issue body
// for the architecture rationale (the fictionlab schema is local-only;
// webhooks would need a public endpoint; this reuses the existing `gh` CLI
// auth instead). Run on demand (`node github-sync.js --dry-run`) or every
// 10-15 min via a Windows Scheduled Task -- see README.md "GitHub Sync"
// section for the exact (NOT auto-registered) schtasks command.
//
// Reuses kanban-server's own conventions on purpose:
//   - DB access: shared/database.js's DatabaseManager (same DATABASE_URL /
//     .env convention as every other kanban-server entry point).
//   - Activity log + NOTIFY: handlers/kanban-helpers.js's logActivity /
//     notifyKanbanChanged -- the exact same functions every mutation tool
//     uses, so this poller's moves show up in the activity feed identically
//     to an agent's move_card call.
//   - Matching/parsing/transition rules: pure logic in ./github-sync-lib.js
//     (unit tested with a mocked DB in tests/kanban-server/).
//
// Safety: --dry-run performs ZERO writes (no UPDATE, no INSERT, no watermark
// advance) and prints the plan. Any error (a bad `gh` call, a malformed PR
// body, a DB hiccup) is caught per-repo/per-card, logged to
// github-sync.log next to this script, and the run continues -- this must
// never crash a scheduled task silently.

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { DatabaseManager } from '../../../shared/database.js';
import { logActivity, notifyKanbanChanged } from '../handlers/kanban-helpers.js';
import { extractClosingReferences, planCardTransition } from './github-sync-lib.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Defensive: load .env by absolute path so this still works when a
// Scheduled Task invokes `node` from an arbitrary working directory (the
// same reasoning as test/kanban-server/concurrent-claim-test.js).
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const DEFAULT_CONFIG_PATH = path.join(__dirname, 'github-sync.config.json');
const DEFAULT_STATE_PATH = path.join(__dirname, 'github-sync.state.json');
const DEFAULT_LOG_PATH = path.join(__dirname, 'github-sync.log');

// ---------------------------------------------------------------------------
// Config / state / logging (file I/O -- kept separate from the pure lib so
// the lib stays trivially unit-testable).
// ---------------------------------------------------------------------------

export function loadConfig(configPath) {
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found: ${configPath}`);
    }
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!Array.isArray(parsed.watched_repos) || parsed.watched_repos.length === 0) {
        throw new Error('Config watched_repos must be a non-empty array of "owner/repo" strings');
    }
    return {
        watched_repos: parsed.watched_repos,
        dry_run_default: parsed.dry_run_default === true,
        initial_lookback_hours: Number.isFinite(parsed.initial_lookback_hours) ? parsed.initial_lookback_hours : 24
    };
}

export function loadState(statePath) {
    if (!fs.existsSync(statePath)) {
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch {
        return {};
    }
}

export function saveState(statePath, state) {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export function appendLog(logPath, line) {
    const stamped = `[${new Date().toISOString()}] ${line}\n`;
    try {
        fs.appendFileSync(logPath, stamped, 'utf8');
    } catch {
        // Logging must never be the thing that crashes the poller.
        process.stderr.write(stamped);
    }
}

function computeInitialSince(hours) {
    return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// GitHub side: `gh api search/issues` (works for both PRs and issues -- the
// search API treats a PR as an issue with a `pull_request` sub-object).
// Wrapped behind a small client object so tests can inject a fake one with
// zero subprocess/network dependency.
// ---------------------------------------------------------------------------

async function runGhSearch(query) {
    const items = [];
    const perPage = 100;
    for (let page = 1; page <= 5; page++) {
        // --method GET is required: gh api defaults to POST whenever -f/-F
        // params are present, and search/issues is GET-only (a bare `gh api
        // search/issues -f q=...` 404s -- discovered during the live
        // --dry-run verification for this issue).
        const { stdout } = await execFileAsync(
            'gh',
            [
                'api',
                'search/issues',
                '--method',
                'GET',
                '-f',
                `q=${query}`,
                '-F',
                `per_page=${perPage}`,
                '-F',
                `page=${page}`
            ],
            { maxBuffer: 10 * 1024 * 1024 }
        );
        const parsed = JSON.parse(stdout);
        const pageItems = parsed.items || [];
        items.push(...pageItems);
        if (pageItems.length < perPage) {
            break;
        }
    }
    return items;
}

export function createGhClient() {
    return {
        async searchMergedPRs(repoFullName, since) {
            return runGhSearch(`repo:${repoFullName} is:pr is:merged merged:>${since}`);
        },
        async searchClosedIssues(repoFullName, since) {
            return runGhSearch(`repo:${repoFullName} is:issue is:closed closed:>${since}`);
        }
    };
}

function toEvents(items, repoFullName, kind) {
    const [owner, repo] = repoFullName.split('/');
    return items.map((item) => {
        const matchTargets = [{ owner, repo, number: item.number }];
        if (kind === 'pr_merged') {
            for (const ref of extractClosingReferences(item.body || '', { owner, repo })) {
                matchTargets.push(ref);
            }
        }
        return {
            kind,
            owner,
            repo,
            number: item.number,
            url: item.html_url,
            title: item.title,
            matchTargets
        };
    });
}

// ---------------------------------------------------------------------------
// DB side: fetch candidate cards (only in_progress/review are ever eligible
// -- see github-sync-lib.js ELIGIBLE_STATUSES), and apply a planned move.
// ---------------------------------------------------------------------------

export async function fetchCandidateCards(db) {
    const result = await db.query(
        `SELECT c.id, c.board_id, c.status, c.issue_ref, c.metadata,
                COALESCE(
                    (SELECT json_agg(json_build_object('link_type', l.link_type, 'ref', l.ref))
                     FROM fictionlab.kanban_card_links l
                     WHERE l.card_id = c.id AND l.link_type IN ('url', 'github_issue')),
                    '[]'
                ) AS links
         FROM fictionlab.kanban_cards c
         WHERE c.status IN ('in_progress', 'review')`
    );
    return result.rows.map((row) => ({
        ...row,
        links: typeof row.links === 'string' ? JSON.parse(row.links) : row.links || [],
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {}
    }));
}

/**
 * Apply one planned move: UPDATE guarded by WHERE status = fromStatus (loses
 * gracefully to any concurrent change instead of clobbering it -- returns
 * null rather than throwing), stamp metadata.github_sync for idempotency,
 * write the kanban_activity row via the SAME logActivity() every other
 * kanban-server tool uses, and NOTIFY like every other mutation.
 */
export async function applyTransition(db, card, transition, event, { actor = 'github-sync' } = {}) {
    const stamp = { event: transition.eventKey, url: event.url, at: new Date().toISOString() };

    const result = await db.query(
        `UPDATE fictionlab.kanban_cards
            SET status = $1,
                metadata = metadata || $2::jsonb
         WHERE id = $3 AND status = $4
         RETURNING *`,
        ['done', JSON.stringify({ github_sync: stamp }), card.id, transition.fromStatus]
    );

    if (result.rows.length === 0) {
        // Card's status changed between fetch and write (e.g. an agent moved
        // it in the meantime) -- do nothing, this is not our race to win.
        return null;
    }

    const updated = result.rows[0];
    const eventNoun = event.kind === 'pr_merged' ? 'PR' : 'issue';
    const eventVerb = event.kind === 'pr_merged' ? 'merged' : 'closed';

    await logActivity(db, {
        boardId: updated.board_id,
        cardId: updated.id,
        actor,
        action: 'auto-moved',
        fromStatus: transition.fromStatus,
        toStatus: 'done',
        detail: {
            reason: `${eventNoun} #${event.number} ${eventVerb}`,
            event: transition.eventKey,
            url: event.url,
            title: event.title,
            matched_via: transition.match.via,
            matched_ref: transition.match.ref
        }
    });
    await notifyKanbanChanged(db, updated.id);

    return updated;
}

// ---------------------------------------------------------------------------
// Orchestration -- injectable db/ghClient so this is unit-testable with a
// fully mocked DB and a canned gh response (see
// tests/kanban-server/github-sync.test.js). dryRun performs the exact same
// matching/plan-building but skips the write loop entirely.
// ---------------------------------------------------------------------------

export async function runSync({ db, ghClient, config, since, dryRun, log = () => {} }) {
    const cards = await fetchCandidateCards(db);
    const planned = [];
    const errors = [];

    for (const repoFullName of config.watched_repos) {
        try {
            const mergedItems = await ghClient.searchMergedPRs(repoFullName, since);
            for (const event of toEvents(mergedItems, repoFullName, 'pr_merged')) {
                for (const card of cards) {
                    const transition = planCardTransition(card, event);
                    if (transition.action === 'move') {
                        planned.push({ card, event, transition });
                    }
                }
            }
        } catch (error) {
            errors.push({ repo: repoFullName, phase: 'merged_prs', error: error.message });
            log(`ERROR searching merged PRs for ${repoFullName}: ${error.message}`);
        }

        try {
            const closedItems = await ghClient.searchClosedIssues(repoFullName, since);
            for (const event of toEvents(closedItems, repoFullName, 'issue_closed')) {
                for (const card of cards) {
                    const transition = planCardTransition(card, event);
                    if (transition.action === 'move') {
                        planned.push({ card, event, transition });
                    }
                }
            }
        } catch (error) {
            errors.push({ repo: repoFullName, phase: 'closed_issues', error: error.message });
            log(`ERROR searching closed issues for ${repoFullName}: ${error.message}`);
        }
    }

    // A card can match more than one event in the same run (its own PR
    // merges AND a different merged PR's "Fixes #N" hits the same linked
    // issue) -- only move it once per run; first match wins.
    const seenCardIds = new Set();
    const plan = [];
    for (const item of planned) {
        if (seenCardIds.has(item.card.id)) {
            continue;
        }
        seenCardIds.add(item.card.id);
        plan.push(item);
    }

    const moved = [];
    if (!dryRun) {
        for (const item of plan) {
            try {
                const updated = await applyTransition(db, item.card, item.transition, item.event);
                if (updated) {
                    moved.push({ ...item, updated });
                }
            } catch (error) {
                errors.push({ card_id: item.card.id, phase: 'apply_transition', error: error.message });
                log(`ERROR applying transition for card ${item.card.id}: ${error.message}`);
            }
        }
    }

    return { plan, moved, errors };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function parseArgs(argv) {
    const args = { dryRun: false, verbose: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dry-run') args.dryRun = true;
        else if (a === '--verbose') args.verbose = true;
        else if (a === '--config') args.config = argv[++i];
        else if (a === '--state') args.state = argv[++i];
        else if (a === '--log') args.log = argv[++i];
        else if (a === '--since') args.since = argv[++i];
    }
    return args;
}

function describePlanItem(item, dryRun, moved) {
    const wasMoved = moved.some((m) => m.card.id === item.card.id);
    const verb = dryRun ? 'WOULD MOVE' : wasMoved ? 'MOVED' : 'SKIPPED (race)';
    const eventNoun = item.event.kind === 'pr_merged' ? 'PR' : 'issue';
    const eventVerb = item.event.kind === 'pr_merged' ? 'merged' : 'closed';
    return (
        `  [${verb}] card ${item.card.id} (${item.transition.fromStatus} -> done) ` +
        `via ${item.transition.match.via}=${item.transition.match.ref} -- ` +
        `${eventNoun} #${item.event.number} ${eventVerb} in ${item.event.owner}/${item.event.repo} (${item.event.url})`
    );
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const configPath = args.config || DEFAULT_CONFIG_PATH;
    const statePath = args.state || DEFAULT_STATE_PATH;
    const logPath = args.log || DEFAULT_LOG_PATH;
    const log = (line) => appendLog(logPath, line);

    let db;
    try {
        const config = loadConfig(configPath);
        const dryRun = args.dryRun || config.dry_run_default;
        const state = loadState(statePath);
        const since = args.since || state.last_run_at || computeInitialSince(config.initial_lookback_hours);
        const runStartedAt = new Date().toISOString();

        db = new DatabaseManager();
        const ghClient = createGhClient();

        const { plan, moved, errors } = await runSync({ db, ghClient, config, since, dryRun, log });

        console.log(
            `github-sync: since=${since} dryRun=${dryRun} watched_repos=[${config.watched_repos.join(', ')}]`
        );
        console.log(`github-sync: ${plan.length} card(s) matched an eligible transition.`);
        for (const item of plan) {
            console.log(describePlanItem(item, dryRun, moved));
        }
        if (errors.length > 0) {
            console.log(`github-sync: ${errors.length} error(s) occurred -- see ${logPath}`);
            if (args.verbose) {
                for (const e of errors) console.log(`  ERROR: ${JSON.stringify(e)}`);
            }
        }

        if (dryRun) {
            console.log('github-sync: --dry-run, watermark NOT advanced, zero writes performed.');
        } else {
            saveState(statePath, { last_run_at: runStartedAt, last_run_completed_at: new Date().toISOString() });
            console.log(`github-sync: watermark advanced to ${runStartedAt}`);
        }
    } catch (error) {
        log(`FATAL: ${error.stack || error.message}`);
        console.error(`github-sync: fatal error (logged to ${logPath}): ${error.message}`);
        process.exitCode = 1;
    } finally {
        if (db) {
            await db.close().catch(() => {});
        }
    }
}

// Cross-platform (Windows file:// URL) direct-execution guard -- same
// pattern as src/mcps/kanban-server/index.js, so this also behaves when
// imported (by tests) vs run directly (by a Scheduled Task or the CLI).
const normalizePath = (p) => {
    if (!p) return '';
    let normalized = p.replace(/\\/g, '/');
    if (!normalized.startsWith('file:')) {
        normalized = process.platform === 'win32' ? `file:///${normalized}` : `file://${normalized}`;
    }
    return normalized.replace(/^file:\/+/, 'file:///');
};

const normalizedScriptPath = normalizePath(process.argv[1]);
const normalizedModuleUrl = import.meta.url.replace(/\/{3,}/g, '///').replace(/^file:\/([^\/])/, 'file:///$1');
const isDirectExecution =
    normalizedModuleUrl === normalizedScriptPath || decodeURIComponent(normalizedModuleUrl) === normalizedScriptPath;

if (isDirectExecution) {
    main();
}
