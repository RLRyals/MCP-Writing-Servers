# Tool-name prefixing: decision doc

Design decision for `mws-4nn`. No code changes in this doc. Grounded against a
static source survey of `MCP-Writing-Servers` (branch `main`) plus a
cross-repo grep of `C:\github` for consumers, dated 2026-07-28. Live
`GET /tools` on the deployed ports (3001-3016) was not reachable from this
sandbox — the mapping below is derived from each `config-mcps/*/index.js`'s
`buildTools()`/`getToolHandler()` pair, which is the deployed source of truth
when the stack is running unmodified. Anyone re-running this survey against a
live stack should treat a live capture as authoritative over this doc if the
two disagree.

## Context

The original design assumed operators would load a *subset* of phase servers
for a given editing session, so same-named tools across servers (e.g.
`create_chapter` existing on both a book-server and a chapter-planning
aggregator) wouldn't collide in one client's tool list. In practice the full
~15-server stack now runs at once, permanently (`docker-compose.yml`), so that
assumption no longer holds — and the "solution" for the one collision that
was ever addressed (chapter-planning) turned out to be partial and undocumented,
which has already caused two real consumer bugs.

## What's actually deployed today

Only **chapter-planning-server** (port 3003) renames any tools, and it does so
unevenly — five different prefixes applied to some tools, others left bare on
the same server:

| deployed name | source handler | prefix |
|---|---|---|
| `book_create_chapter`, `book_update_chapter`, `book_get_chapter`, `book_list_chapters` | `create_chapter`/`update_chapter`/`get_chapter`/`list_chapters` | `book_` |
| `timeline_map_event_to_chapter` | `map_event_to_chapter` | `timeline_` |
| `world_track_location_usage`, `world_track_element_usage` | `track_location_usage`/`track_element_usage` | `world_` |
| `character_add_character_knowledge_with_chapter`, `character_get_characters_who_know` | same base names | `character_` |
| `plot_create_information_reveal`, `plot_add_reveal_evidence` | `create_information_reveal`/`add_reveal_evidence` | `plot_` |
| `update_timeline_event`, `update_event_mapping`, `update_location`, `update_world_element`, `track_organization_activity`, `update_organization`, `track_character_presence`, `resolve_plot_thread` | (same names) | **none** |

Source: `src/config-mcps/chapter-planning-server/index.js:58-182`,
`readme.md:20-32` (states the original disambiguation rationale, which
predates always-on-together deployment).

Every other deployed server exposes its handlers' source names verbatim
(no-op renames or straight spreads): book-planning (3001), series-planning
(3002), character-planning (3004), scene (3005), core-continuity (3006),
review (3007), reporting (3008), author (3009), database-admin (3010, not
agent-facing), npe (3011, not agent-facing per README), workflow-manager
(3012, not agent-facing), outline (3013), kanban (3015), story-analysis (3016,
undocumented in README, not launchable by `single-server-runner.js` today —
a separate latent gap, noted here but out of scope for this bead).

There is **no shared registry, naming-convention helper, or generator**
anywhere in the codebase. Each server's `buildTools()`/`getToolHandler()` is
hand-written, and the tool name is duplicated as a string literal in both
places per tool. `docs/outline-vs-plot.md` documents a second, independent
ad hoc rename (`config-mcps/chapter-planning-server` also renames two
plot-server tools to `plot_create_information_reveal` /
`plot_add_reveal_evidence`) — same mechanism, same server, already covered in
the table above.

## Confirmed real-world breakage from the current scheme

1. **FictionLab-Online, `modules/fiction.js:44-47`** — the `chapter` server's
   `allow` set and call sites (`fiction.js:307,476,495`) use source names
   (`list_chapters`, `get_chapter`, `update_chapter`) against port 3003,
   which only exposes the `book_`-prefixed versions. Every chapter
   browse/edit call currently returns JSON-RPC `-32601 Tool not found`.
   Tracked live, open, P1: `flo-yam`.
2. **FictIonLab-Downloads, `workflows/manuscript-import/workflow.yaml`** — hit
   the identical bug live (`The_mist`, 30-chapter run), fixed in commit
   `cdefbed8` / PR #34 by switching to the `book_`-prefixed names. The fix
   commit's own header comment flags that `fiction.js` has the same bug,
   "fixed separately."

Both breakages are the *same* server (chapter-planning, port 3003), the *same*
four tools, discovered independently, by two different consumers, months
apart — because the deployed name is discoverable only by reading source
deeply enough to find the rename, or by hitting live `GET /tools`.

Other consumers surveyed and found **not** currently affected:
- `MCP-Electron-App/src/main/plugin-context.ts:287-300` — holds a port map
  only, no tool names; not itself broken, but a candidate location for a
  canonical map (see Option A).
- `fictionlab-workflow`'s canon-binding engine
  (`packages/workflow-runner/src/executor/canon/dispatch.ts` +
  `types/workflow-nodes.ts`) — has no `chapter` entity type at all, so it
  never touches chapter-planning-server's prefixed tools. This is incidental,
  not designed-in safety: whoever adds chapter canon bindings will hit the
  same trap unless this bead's decision lands first.
- Archived markdown-skill docs under `FictIonLab-Downloads/_archived/` —
  reference the prefixed names correctly, but archived/inert.

## Options

### Option A — keep phase prefixes, generate + publish one canonical map

Keep chapter-planning's existing renames (and any future ones) as-is, but stop
hand-maintaining `buildTools()`/`getToolHandler()` as two independent string
lists. Add a small script that boots each `config-mcps/*` module (or parses
its `buildTools()` output) and emits one JSON/markdown file — deployed name →
source handler → server/port — checked into the repo and regenerated in CI
whenever a server's tool list changes. Consumers code against that file
instead of guessing or reverse-engineering source.

- **Migration cost:** Low for MCP-Writing-Servers itself — no renames, just a
  generator script + a CI check that fails if the committed map is stale.
  Zero migration cost for `fiction.js` and `manuscript-import` *if* they're
  already using the deployed names (manuscript-import already is, post-fix;
  `fiction.js` still needs its existing fix in `flo-yam` regardless of which
  option is chosen, since it's currently wrong under the *current* scheme).
  No entity-type work needed in `fictionlab-workflow`'s canon-binding engine
  unless/until chapter support is added there.
- **Downside:** Preserves an inconsistent scheme (5 prefixes on one server,
  bare everywhere else) as permanent, documented behavior rather than fixing
  the inconsistency. New servers/tools can still introduce ad hoc prefixes
  without any convention to follow, only a map that records whatever was
  decided.

### Option B — collapse duplicates, one owner per tool, unprefixed everywhere

Since the full stack always runs together now, the cross-server collision the
prefixes were originally defensive against can be resolved at the source:
each domain tool lives on exactly one server, unprefixed; other servers that
currently re-expose a copy (chapter-planning re-exposing book-server's chapter
CRUD, and plot-server's `create_information_reveal`/`add_reveal_evidence`)
stop doing so and callers hit the owning server directly.

- **Migration cost:** Highest of the three. Requires:
  - Removing chapter CRUD from chapter-planning-server's tool list (or moving
    ownership there and removing it from wherever the "true" source lives —
    needs an ownership call, since `book_create_chapter` et al. currently
    proxy chapter-server-side handlers surfaced through the chapter-planning
    aggregator, not book-planning-server itself; the doc's survey did not
    trace which literal server owns the underlying `create_chapter` table
    writes, only that chapter-planning-server is where the tool is exposed
    today — that ownership question needs an answer before Option B could be
    scoped precisely).
  - Rewriting `fiction.js`'s `SERVERS` map to point chapter operations at
    whichever server keeps them (possibly a *different* port than 3003).
  - Rewriting `manuscript-import/workflow.yaml` again (a second rename in as
    many months for that file).
  - Auditing every other config-mcp for tools it re-exposes from elsewhere
    (this doc only traced chapter-planning's re-exports in detail; a full
    Option-B scope needs the same trace for every server, since any
    aggregator could be doing the same thing undetected).
- **Downside:** Two renames for `fiction.js`/`manuscript-import` in short
  succession (once for `flo-yam`'s existing fix, again if the owning port
  changes) risks looking like churn rather than a stable fix, unless both are
  sequenced as one migration.

### Option C — uniform, mechanically-derived prefix scheme everywhere

Define one deterministic rule (e.g. every deployed tool name is always
`<phase>_<source_name>`, no exceptions, no server left unprefixed) and apply
it across all ~15 servers, replacing chapter-planning's current five ad hoc
prefixes with the same single rule everyone else also gets.

- **Migration cost:** Highest breadth (touches every server's tool list, not
  just one), but each individual rename is mechanical (prepend
  `<phase>_` to every tool a server exposes) and could be code-generated
  rather than hand-edited, unlike Option B's per-tool ownership decisions.
  Every current consumer of every currently-unprefixed tool name would need
  updating in the same pass: `fiction.js`'s `author`/`series`/`book`/`scene`
  entries (currently correct because those servers don't prefix today),
  `fictionlab-workflow`'s per-entity client files (`world-client.ts`,
  `character-client.ts`, `plot-client.ts`, `timeline-client.ts`,
  `relationship-client.ts`, `storyform-client.ts` — all currently call bare
  source names against series-planning/book-planning/character-planning/
  core-continuity), and `manuscript-import`'s already-fixed chapter tools
  (which would need a *third* naming pass, this time to a different prefix
  form if the mechanical rule doesn't happen to match `book_`).
- **Downside:** By far the largest one-time consumer migration of the three
  options — every consumer of every unprefixed tool (the overwhelming
  majority of tools in the stack today) needs a coordinated update, not just
  the two already-broken chapter callers. Highest risk of a new round of
  `flo-yam`/`cdefbed`-style breakage during the transition unless every
  consumer repo is updated in lockstep.

## Consumers named, for migration planning under any option

| Consumer | File | Current state |
|---|---|---|
| FictionLab-Online | `modules/fiction.js:31-52,307,476,495` | Broken today (wrong names for chapter); bead `flo-yam` open |
| FictIonLab-Downloads | `workflows/manuscript-import/workflow.yaml` | Fixed (commit `cdefbed8`, PR #34) — uses `book_`-prefixed names |
| MCP-Electron-App | `src/main/plugin-context.ts:287-300` | Port map only, no hardcoded tool names — not broken, but where a canonical map (Option A) could be surfaced to plugin authors |
| fictionlab-workflow | `packages/workflow-runner/src/executor/canon/dispatch.ts`, `types/workflow-nodes.ts:180-,272-`, `world-client.ts`, `character-client.ts`, `plot-client.ts`, `timeline-client.ts`, `relationship-client.ts`, `storyform-client.ts` | Not broken today (no `chapter` entity type in the canon-binding union) — latent trap if chapter canon bindings are ever added; all current clients call unprefixed names against non-prefixing servers |
| run-workflow skill/executor (FictIonLab-Downloads) | `.claude/skills/run-workflow/` | Generic executor, no hardcoded tool names — inherits whatever the YAML it's given specifies |
| Archived series-writing-orchestrator docs (FictIonLab-Downloads `_archived/`) | `_archived/series-writing-orchestrator/...` | Inert, not a live consumer |

## Recommendation

**Option A.** It fixes the actual, demonstrated failure mode (deployed names
being undiscoverable except by reading source or hitting live `GET /tools`)
at the lowest migration cost and lowest risk of introducing a new round of
consumer breakage. Options B and C both require touching every currently-
correct consumer of every currently-unprefixed tool — a strictly larger blast
radius than the two bugs this bead was opened to prevent a third instance of.
Option A also doesn't foreclose B or C later: once a generated canonical map
exists, a future decision to consolidate ownership (B) or apply a uniform
rule (C) can diff against that map instead of re-deriving it from source by
hand, and can be scheduled as its own bead with its own migration plan rather
than folded into fixing today's undiscoverability problem.

Immediate next steps if Option A is ratified (not part of this bead):
1. File a bead for the generator script + committed canonical map + CI
   staleness check.
2. `flo-yam` proceeds independent of this decision — it's fixing existing
   breakage under the *current* (unchanged) naming scheme.
3. File a bead to resolve the chapter-CRUD ownership question flagged under
   Option B, if and when consolidation is later pursued.

Rebecca ratifies the direction before any rename lands, per the bead's
acceptance criteria.
