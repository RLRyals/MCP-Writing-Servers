# Kanban MCP Server

MCP tool server for the FictionLab kanban boards (dev-backlog, broadquill-business,
ffa-system-gaps, …) — S11 kanban plugin, GH issue #58. This is the **server** layer
only — the board UI ships separately (see "The three layers" below).

Tools live in `handlers/` (board/card/claim/comment/identity), schema in
`schemas/kanban-tools-schema.js`, and shared helpers (activity log, NOTIFY,
review-policy inference, identity validation) in `handlers/kanban-helpers.js`.

## The three layers

| Layer | Where | What it does |
|-------|-------|--------------|
| Server (this dir) | `MCP-Writing-Servers/src/mcps/kanban-server/` | MCP tools over the Postgres tables; all reads/writes go through here |
| Plugin | `fictionlab-workflow` repo, `packages/kanban-plugin/` | FictionLab plugin: main-process IPC handlers + Postgres LISTEN refresh |
| Board view | `MCP-Electron-App/src/renderer/views/KanbanViewReact.tsx` + `components/kanban/` | React board UI (v1 lives in the app; slated to move into the plugin's renderer bundle) |

## Data

- Database: `mcp_writing_db` in the `fictionlab-postgres` Docker container, schema `fictionlab`.
- Tables: `kanban_boards`, `kanban_columns`, `kanban_cards`, `kanban_comments`,
  `kanban_card_links`, `kanban_activity`, `identities` — created by migration
  `042_kanban_tables.sql`, extended by `043_kanban_cards_add_due_at.sql` and
  `044_kanban_identities.sql`.

## Tools (13)

Read: `list_boards`, `get_board`, `list_cards` (the workhorse — filters by board, assignee,
agent, status, label, priority, claimability, due_filter), `get_card`, `list_identities`.

Write: `create_card` (title-only quick-add is valid; board defaults to `dev-backlog`),
`update_card`, `move_card`, `comment_card`, `add_card_link`, `archive_card`,
`claim_card` (agent claim with human fail-safe), `upsert_identity`.

Full input schemas: `schemas/kanban-tools-schema.js`.

## Identity / claim model

`identities` rows have a `kind` (human vs agent/persona). Humans are **never**
agent-claimable: `claim_card` and the `agent_claimable_only` filter exclude cards assigned
to an active human identity. Assignee filtering matches identity ids exactly
(e.g. `rebecca`); `__unassigned__` selects cards with no assignee.

## GitHub Sync (GH issue #64)

`tools/github-sync.js` is a standalone poller (not part of the MCP server
process) that closes the loop between GitHub and the board: when a merged PR
or a closed issue matches a card's link, the card auto-moves
`in_progress`/`review` -> `done`.

**Why a local poller and not a webhook/GitHub Action:** the `fictionlab`
schema only exists in the local Docker Postgres (`fictionlab-postgres`) --
GitHub-hosted runners can't reach it, and a webhook would require exposing a
public endpoint. A local script using the same `gh` CLI auth already present
on the machine needs neither. This follows the existing pattern:
daemons/pollers are standalone Scheduled-Task scripts that write to Postgres;
interactive surfaces are the Electron app.

### How matching works

For every watched repo, each poll looks up merged PRs and closed issues since
the last watermark (`gh api search/issues`), then for each event builds a set
of "match targets": the PR/issue itself, plus -- for a merged PR -- every
issue its body closes via a GitHub closing keyword (`Fixes #64`,
`Closes RLRyals/other-repo#12`, `Resolves <url>`, etc; see
`extractClosingReferences` in `tools/github-sync-lib.js`).

A card matches an event if ANY of the following resolve to the same
owner/repo/number as a match target:
- the card's own `issue_ref` field (`owner/repo#N` shorthand), or
- a `kanban_card_links` row of `link_type` `'url'` or `'github_issue'`.

Only cards currently `in_progress` or `review` are ever touched --
`backlog`/`ready`/`claimed`/`blocked`/`done`/`archived` are never modified and
a card never moves backwards. A move is stamped into
`metadata.github_sync = { event, url, at }`; a rerun that would produce the
same stamp is skipped (idempotent), on top of the status gate itself. Every
move also writes a `fictionlab.kanban_activity` row via the same
`logActivity()`/`notifyKanbanChanged()` helpers every other kanban-server
tool uses (action `'auto-moved'`), so it shows up in the board's activity
feed identically to a manual `move_card` call.

### Config

`tools/github-sync.config.json` (checked into git -- edit and commit changes):

```json
{
    "watched_repos": ["RLRyals/MCP-Electron-App", "RLRyals/MCP-Writing-Servers", "RLRyals/fictionlab-workflow"],
    "dry_run_default": false,
    "initial_lookback_hours": 24
}
```

DB connection reuses the same `DATABASE_URL`/`.env` convention as the rest of
kanban-server (`shared/database.js`'s `DatabaseManager`) -- nothing extra to
configure there.

### Running it

```
node src/mcps/kanban-server/tools/github-sync.js --dry-run
node src/mcps/kanban-server/tools/github-sync.js
```

Flags: `--dry-run` (zero writes -- prints the plan, does not advance the
watermark), `--config <path>`, `--state <path>`, `--log <path>`,
`--since <ISO8601>` (override the stored watermark, e.g. for a manual
re-scan), `--verbose` (print per-error detail).

State (`tools/github-sync.state.json`, gitignored) tracks `last_run_at`; on
first run (no state file) it looks back `initial_lookback_hours` (default
24h). Errors (a failed `gh api` call, a DB hiccup) are caught per repo/card,
logged to `tools/github-sync.log` (gitignored), and never crash the run.

### Registering the Scheduled Task

**Not registered automatically.** It is enabled deliberately by running
(PowerShell or cmd, one time, substituting your clone path):

```
schtasks /create /tn "Kanban GitHub Sync" /tr "node <path-to-clone>\src\mcps\kanban-server\tools\github-sync.js" /sc minute /mo 15 /f
```

This runs every 15 minutes as the current Windows user (so it inherits the
same `gh auth login` session already on the machine) and only fires while
that user is logged on. Verify / manage it with:

```
schtasks /query /tn "Kanban GitHub Sync" /v /fo LIST   # inspect
schtasks /run /tn "Kanban GitHub Sync"                 # run once, right now
schtasks /delete /tn "Kanban GitHub Sync" /f           # remove it
```

### Tests

```
node tests/kanban-server/github-sync-lib.test.js   # pure parsing/matching/transition logic
node tests/kanban-server/github-sync.test.js       # orchestration, DB + gh both mocked
```

Both are wired into CI (`.github/workflows/test.yml`, job
`kanban-github-sync-tests`) and require no live database or `gh` auth.

## Free-text card search (GH issue #66)

`list_cards` accepts an optional `q` (string) parameter that does a
case-insensitive free-text search across card `title`, card `body`, and every
`fictionlab.kanban_comments` row for that card (parameterized `ILIKE`, never
string-interpolated). `q` combines with AND against every other `list_cards`
filter (`board_key`/`board_id`, `assignee`, `status`, `label`, `priority`,
etc.).

When `q` is set and neither `board_key` nor `board_id` is given, the search
runs across **all** boards (it does not implicitly narrow to `dev-backlog`),
and each returned card includes `board_key` so a hit is attributable to its
board. Results are ranked title hits first, then body-only hits, then
comment-only hits, before falling back to the tool's normal ordering
(due-date, priority/position, etc.) within each rank.

`ILIKE` is sufficient at current scale (hundreds of cards). If the boards grow
large enough that this gets slow, the upgrade path is `pg_trgm` or Postgres
full-text search (`tsvector`/`tsquery`) on `title`/`body`/comment `body` — no
new migration is needed for the current `q` implementation.

## Conventions

- One card per GitHub issue. Batch/summary cards get **no** `issue_ref`/GitHub links —
  the poller auto-completes any card whose linked PR says "Fixes #N", and a batch card
  would be closed by its first sub-issue. (Poller currently ships disabled.)
- Never set `due_at` unless the human board owner stated the date herself; suggested
  dates go in the card body.
- `dev-backlog` is the active working board.

## Running / testing

The server is wired into `mcp-config/mcp-config.json` and runs under
`single-server-runner.js` / `http-sse-server.js` like the other servers; `stdio-adapter.js`
provides stdio transport.

- Live-DB integration scripts (ephemeral throwaway board, real gh/DB): `test/kanban-server/`,
  including `smoke-test.js` and `concurrent-claim-test.js`.
- Mocked-DB unit tests (CI-safe): `tests/kanban-server/`.
