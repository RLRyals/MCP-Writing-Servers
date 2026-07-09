// src/mcps/kanban-server/tools/github-sync-lib.js
// Pure, dependency-free logic for the GitHub sync poller (GH issue #64):
// URL / "owner/repo#N" parsing, "Fixes #N"-style closing-keyword extraction,
// card <-> event matching, and the conservative status-transition rule.
//
// Deliberately has NO gh CLI calls and NO database access -- everything here
// is a pure function over plain objects so it can be unit tested without
// mocking a subprocess or a Postgres connection (see
// tests/kanban-server/github-sync-lib.test.js). The orchestration that wires
// this up to `gh api` and the shared DatabaseManager lives in
// ./github-sync.js.

// Card statuses eligible to auto-complete. Conservative by design (S11 /
// issue #64 spec): backlog/blocked/done/archived/claimed/ready are NEVER
// touched by this poller, and a card never moves backwards.
export const ELIGIBLE_STATUSES = ['in_progress', 'review'];

// GitHub's own closing-keyword set (see "Linking a pull request to an issue"
// docs): close, closes, closed, fix, fixes, fixed, resolve, resolves,
// resolved. Matched case-insensitively.
const CLOSE_KEYWORD_RE = /\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+([^\s,;]+)/gi;

/**
 * Parse a single GitHub reference string into { owner, repo, number, kind }.
 * Accepts:
 *   - Full URLs: https://github.com/owner/repo/issues/123 (with optional
 *     trailing slash, query string, or #fragment; http or https; a bare
 *     "github.com/..." with no scheme also matches).
 *   - Shorthand: "owner/repo#123" (the convention used by kanban_cards.
 *     issue_ref and kanban_card_links rows of link_type 'github_issue').
 * `kind` is 'pr' | 'issue' for a URL match (the path segment tells us),
 * or null for the shorthand form (ambiguous by design -- matching doesn't
 * care whether the target is a PR or an issue, only that the number+repo
 * agree, per issue #64 spec item 3).
 * Returns null if the string isn't a recognizable GitHub ref at all (e.g. a
 * 'spec' or 'file' link_type's ref, or plain prose).
 */
export function parseGithubRef(raw) {
    if (!raw || typeof raw !== 'string') {
        return null;
    }
    const str = raw.trim();

    const urlMatch = str.match(
        /github\.com\/([^\/\s]+)\/([^\/\s]+?)(?:\.git)?\/(issues|pull)\/(\d+)(?:[\/?#].*)?$/i
    );
    if (urlMatch) {
        return {
            owner: urlMatch[1],
            repo: urlMatch[2],
            number: parseInt(urlMatch[4], 10),
            kind: urlMatch[3].toLowerCase() === 'pull' ? 'pr' : 'issue'
        };
    }

    const shortMatch = str.match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/);
    if (shortMatch) {
        return {
            owner: shortMatch[1],
            repo: shortMatch[2],
            number: parseInt(shortMatch[3], 10),
            kind: null
        };
    }

    return null;
}

/**
 * Extract every "Fixes #N" / "Closes owner/repo#N" / "Resolves <url>"-style
 * reference from a PR body, defaulting the owner/repo to the PR's own repo
 * (context) when the token is a bare "#N". Dedupes by owner/repo#number.
 * Only the token immediately following a closing keyword is captured --
 * matches GitHub's own auto-close behavior (a comma-separated list like
 * "Closes #12, #13" only auto-closes #12; #13 needs its own keyword), so
 * this poller never over-claims a match GitHub itself wouldn't have made.
 */
export function extractClosingReferences(body, context = {}) {
    if (!body || typeof body !== 'string') {
        return [];
    }

    const results = [];
    const seen = new Set();
    CLOSE_KEYWORD_RE.lastIndex = 0;

    let match;
    while ((match = CLOSE_KEYWORD_RE.exec(body)) !== null) {
        const token = match[2].replace(/[)\]>,.;!]+$/, '');
        let ref = null;

        if (/^#\d+$/.test(token)) {
            if (context.owner && context.repo) {
                ref = { owner: context.owner, repo: context.repo, number: parseInt(token.slice(1), 10) };
            }
        } else {
            const parsed = parseGithubRef(token);
            if (parsed) {
                ref = { owner: parsed.owner, repo: parsed.repo, number: parsed.number };
            }
        }

        if (ref) {
            const key = `${ref.owner}/${ref.repo}#${ref.number}`.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                results.push(ref);
            }
        }
    }

    return results;
}

/** owner/repo comparison is case-insensitive (GitHub repo slugs are). */
export function refersToSameTarget(parsedRef, target) {
    if (!parsedRef || !target) {
        return false;
    }
    return (
        parsedRef.owner.toLowerCase() === target.owner.toLowerCase() &&
        parsedRef.repo.toLowerCase() === target.repo.toLowerCase() &&
        parsedRef.number === target.number
    );
}

/**
 * Does this card reference ANY of the event's match targets? Checks, in
 * order: the card's own issue_ref shorthand field, then its
 * kanban_card_links rows of link_type 'url' or 'github_issue' (issue #64
 * spec item 3a/3b). Returns the first match as
 * { via: 'issue_ref'|'url'|'github_issue', ref, target } or null.
 */
export function cardMatchesTargets(card, targets) {
    if (!Array.isArray(targets) || targets.length === 0) {
        return null;
    }

    if (card.issue_ref) {
        const parsed = parseGithubRef(card.issue_ref);
        for (const target of targets) {
            if (refersToSameTarget(parsed, target)) {
                return { via: 'issue_ref', ref: card.issue_ref, target };
            }
        }
    }

    for (const link of card.links || []) {
        if (link.link_type !== 'url' && link.link_type !== 'github_issue') {
            continue;
        }
        const parsed = parseGithubRef(link.ref);
        for (const target of targets) {
            if (refersToSameTarget(parsed, target)) {
                return { via: link.link_type, ref: link.ref, target };
            }
        }
    }

    return null;
}

/** Stable idempotency key for an event, stamped into metadata.github_sync. */
export function buildEventKey(event) {
    return `${event.kind}:${event.owner}/${event.repo}#${event.number}`;
}

/**
 * Decide what (if anything) should happen to a card for a given event.
 * card: { status, issue_ref, links: [{link_type, ref}], metadata }
 * event: { kind: 'pr_merged'|'issue_closed', owner, repo, number, matchTargets }
 *
 * Returns one of:
 *   { action: 'skip', reason: 'ineligible_status' }  -- backlog/blocked/done/
 *       archived/claimed/ready are NEVER touched, regardless of match.
 *   { action: 'skip', reason: 'no_match' }
 *   { action: 'skip', reason: 'already_stamped', match }  -- idempotent rerun
 *       guard: metadata.github_sync.event already equals this event's key.
 *   { action: 'move', fromStatus, toStatus: 'done', match, eventKey }
 */
export function planCardTransition(card, event) {
    if (!ELIGIBLE_STATUSES.includes(card.status)) {
        return { action: 'skip', reason: 'ineligible_status' };
    }

    const match = cardMatchesTargets(card, event.matchTargets);
    if (!match) {
        return { action: 'skip', reason: 'no_match' };
    }

    const eventKey = buildEventKey(event);
    const existingStamp = card.metadata && card.metadata.github_sync;
    if (existingStamp && existingStamp.event === eventKey) {
        return { action: 'skip', reason: 'already_stamped', match };
    }

    return {
        action: 'move',
        fromStatus: card.status,
        toStatus: 'done',
        match,
        eventKey
    };
}
