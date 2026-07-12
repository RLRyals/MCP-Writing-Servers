# outline-server vs plot-server

Two MCP servers both claim territory that sounds like "the plot." They are not
interchangeable, they do not share a primary-key space, and one word —
`evidence` — means two structurally different things depending on which one
you're talking to. This doc is the disambiguation guide.

Grounded against source as of 2026-07-11 (repo `MCP-Writing-Servers`, branch
`main`). Every tool name, file path, and line reference below was re-verified
by reading the actual handler/schema files, not inferred from naming
conventions. Where the original GH #74 first-pass analysis turned out to be
imprecise, that's called out explicitly in [Corrections to the original
analysis](#corrections-to-the-original-analysis-gh-74).

## TL;DR

- **outline-server** = the bottom-up scene tree for ONE manuscript: series →
  book → act → beat → chapter → scene, plus the facts/promises/evidence/events
  that live at specific nodes in that tree. Everything it owns is keyed off
  its own `outline_works.id`.
- **plot-server** = top-down, multi-book bookkeeping: named plot threads that
  span `start_book..end_book`, information reveals, world-system rules, and
  character power progression. Everything it owns is keyed off `plot_threads`,
  `information_reveals`, etc. — separate tables, separate ID sequences.
- They do not interoperate by ID. An `outline_works.id` is meaningless to
  plot-server; a `plot_threads.id` is meaningless to outline-server. The one
  ID space they genuinely share is the **canonical** `characters.id` (both
  reference the same `characters` table), and, more weakly, `series`/`books`/
  `chapters` (see [Disjoint ID spaces](#disjoint-id-spaces) for the asterisk).
- Both servers have a concept casually called "evidence." They are not the
  same concept, don't share a table, and don't share a tool name — but they
  will absolutely get conflated by anyone skimming both schemas. See
  [The `evidence` collision](#the-evidence-collision).

## At a glance

| | outline-server | plot-server |
|---|---|---|
| Altitude | Bottom-up: per-scene/chapter structure + drafting context | Top-down: multi-book arcs and reveals |
| Spine table | `outline_works` (self-referential tree: `parent_id`) | `plot_threads` (flat, keyed to `series_id`, spans `start_book`/`end_book`) |
| Primary ID | `outline_works.id` (own SERIAL sequence, own tree) | `plot_threads.id`, `information_reveals.id`, `reveal_evidence.id`, `world_systems.id`, `character_system_progression.id` (each its own SERIAL sequence) |
| Tool count | 22 (verified: 9 works + 4 facts + 3 promises + 3 evidence + 2 scene-events + 1 brief) | 8 (verified: 4 plot-thread + 4 genre-extension; a 5th plot-thread tool exists in code but is commented out — see [Dead code](#known-dead-code)) |
| Also owns | facts (atomic truths), promises (clue/setup/payoff ledger), evidence-chain (finding→conversion gap), scene-events (polymorphic event log), `get_scene_brief` (one-call drafting context) | information-reveals, reveal-evidence (child of a reveal), world-systems (magic/tech rules), character-system-progression (power levels) |
| Server class / file | `OutlineMCPServer`, `src/mcps/outline-server/index.js` | `PlotMCPServer`, `src/mcps/plot-server/index.js` |
| Standalone MCP name | `outline-manager` | `plot-management` |

## Tool inventory (verified against source)

### outline-server — 22 tools

Registered in `src/mcps/outline-server/index.js:42-51` (`getTools()`), dispatched
`53-85` (`getToolHandler()`). Schemas: `src/mcps/outline-server/schemas/outline-tools-schema.js`.

| Group | Tools | Handler file |
|---|---|---|
| works (9) | `create_work`, `update_work`, `move_work`, `delete_work`, `get_outline`, `get_ancestry`, `list_series_roots`, `list_works`, `search_works` | `handlers/works-handlers.js` |
| facts (4) | `create_fact`, `list_facts`, `update_fact`, `delete_fact` | `handlers/facts-handlers.js` |
| promises (3) | `create_promise`, `update_promise`, `list_open_promises` | `handlers/promises-handlers.js` |
| evidence (3) | `create_evidence`, `update_evidence`, `list_unconverted_evidence` | `handlers/evidence-handlers.js` |
| scene-events (2) | `record_scene_events`, `what_does_character_know_at` | `handlers/scene-events-handlers.js` |
| brief (1) | `get_scene_brief` | `handlers/brief-handlers.js` |

### plot-server — 8 tools

Registered in `src/mcps/plot-server/index.js:111-131` (`getTools()`), dispatched
`136-157` (`getToolHandler()`). Schemas: `src/mcps/plot-server/schemas/plot-tools-schema.js`.

| Group | Tools | Handler file |
|---|---|---|
| plot-thread (4 live + 1 dead) | `create_plot_thread`, `update_plot_thread`, `get_plot_threads`, `resolve_plot_thread`, ~~`link_plot_threads`~~ (commented out) | `handlers/plot-thread-handlers.js` |
| genre-extension (4) | `create_information_reveal`, `define_world_system`, `add_reveal_evidence`, `track_system_progression` | `handlers/genre-extensions.js` |
| lookup (0) | — `lookupSystemToolsSchema` is an empty array. Lookup vocabulary (thread types, statuses, etc.) now lives in `metadata-server`'s `get_available_options`. | — |

**Note on plot-server's file naming:** the actual, imported file is
`src/mcps/plot-server/handlers/genre-extensions.js` (confirmed via the
`index.js` import and `ls`), even though its internal header comment says
`universal-genre-extensions.js`. That's a stale comment, not a real filename —
don't go looking for a file that doesn't exist.

### Where these tools actually surface to agents

Neither raw server is the only way an agent sees these tools — several
`config-mcps/*` aggregators bundle subsets under a shared DB connection:

- `config-mcps/outline-server` (`outline-phase`) — re-exports **all 22**
  outline tools verbatim, no renaming.
- `config-mcps/series-planning-server` — pulls in exactly one plot-server
  tool, `define_world_system`, from `genreExtensionToolsSchema`. No outline
  tools present.
- `config-mcps/chapter-planning-server` — pulls in `create_information_reveal`
  and `add_reveal_evidence` from plot-server's genre extensions, but
  **renames them** to `plot_create_information_reveal` and
  `plot_add_reveal_evidence`, plus `resolve_plot_thread` (unrenamed). No
  outline-server tools present.
- `config-mcps/core-continuity-server` — pulls in `get_plot_threads`
  (unrenamed) for read-only continuity checks. No outline-server tools
  present.

Practical upshot: **as of this analysis, no aggregator currently exposes an
outline-server tool and a plot-server "evidence" tool side by side under
unprefixed names.** The collision risk documented below is about an agent
holding both the standalone `outline-manager` and `plot-management` servers
(or `outline-phase` + `chapter-planning-phase`) connected at once, or a human
skimming both schema files — not a live MCP tool-name clash today. See
[Corrections](#corrections-to-the-original-analysis-gh-74).

## The `evidence` collision

Both servers have something informally called "evidence." They are **not**
the same tool name (`create_evidence`/`update_evidence`/
`list_unconverted_evidence` vs. `add_reveal_evidence`), so there's no literal
MCP namespace clash — but the *concept* collides hard enough that an agent
(or Rebecca, skimming two schema files six weeks apart) will conflate them.

| | outline-server `create_evidence` | plot-server `add_reveal_evidence` |
|---|---|---|
| Table | `outline_evidence_chain` | `reveal_evidence` |
| What it models | A finding the **protagonist produces but cannot act on directly** — a forensic-tech agency gap. Forces you to name `who_acts_on_it` and the `action_gap_note` (the cost of converting a finding into plot action: off-books, social capital, etc.). | Corroborating detail attached to an **existing information reveal** (`information_reveals.id`) — one piece of support for something already established as "revealed." |
| Key fields | `finding` (text), `who_acts_on_it` (text), `action_gap_note` (text), `converted_work_id` (→ `outline_works.id`), `status` enum `unconverted/converted/off_books/lost` | `reveal_id` (**required**, → `information_reveals.id`), `evidence_type` enum `physical/witness/circumstantial/digital/forensic`, `evidence_description`, `discovered_by` (→ `characters.id`), `discovery_chapter`, `significance` enum `critical/important/supporting/red_herring` |
| Required parent | None — floats free, optionally scoped to `series_root_id` (an `outline_works.id`) | **Must** already have a `reveal_id` — `handleAddRevealEvidence` throws `Information reveal with ID {id} not found` if it doesn't resolve (`src/mcps/plot-server/handlers/genre-extensions.js:341-343`) |
| Lifecycle | `unconverted → converted` (or `off_books`/`lost`), tracked by `list_unconverted_evidence` | No lifecycle/status field at all — it's a permanent corroborating record, not something that gets "resolved" |
| Genre framing | Written for the forensic-tech protagonist premise specifically (see file header comment) | Explicitly genre-agnostic — `evidence_type` enum leans mystery/forensic but the parent `reveal_type` enum also covers `secret`, `backstory`, `world_rule`, `relationship`, `skill` for non-mystery genres |

**The trap in practice:** if you want to track "the finding my forensic-tech
protagonist can't act on yet without burning a favor," that's outline's
`create_evidence` — it has nowhere else to go, and plot-server's
`add_reveal_evidence` will reject you outright (no `finding`/`who_acts_on_it`/
`action_gap_note` fields exist there, and it *requires* a pre-existing
`reveal_id`). Conversely, if you want to attach a corroborating physical/
witness/digital detail to a reveal that's already logged in `plot_threads`,
that's plot's `add_reveal_evidence` — outline's evidence chain has no
`reveal_id` concept and can't express "this corroborates that information
reveal."

There is also a related-but-distinct overlap one level up: outline's
`record_scene_events(event_type='reveals_fact')` and plot's
`create_information_reveal` both model "information becoming known," just
anchored differently (tree-node + fact vs. thread + chapter). See
[Overlap / confusion risks](#overlap--confusion-risks) below.

**No sync layer exists between any of this.** If a project uses both servers
for evidence/reveal tracking, the two records will duplicate and drift with
nothing to reconcile them.

## Disjoint ID spaces

**The core rule: never pass an `outline_works.id` to a plot-server tool
expecting a `series_id`/`thread_id`/`reveal_id`/`chapter_id`, and never pass a
`plot_threads.id` (or any plot-server ID) to an outline-server tool expecting
a `work_id`.** They are different SERIAL sequences in different tables and
nothing validates that you didn't cross the streams — you'll either get a
confusing "not found" error or, worse, silently corrupt an unrelated row if
the ID happens to exist in both tables by coincidence.

Verified from `migrations/037_outline_server_tables.sql` and
`migrations/039_outline_rename_cross_refs.sql`:

- `outline_works.id` — own `SERIAL PRIMARY KEY`, self-referential
  (`parent_id REFERENCES outline_works(id)`). This ID space belongs entirely
  to outline-server; nothing in plot-server ever reads or writes it.
- `plot_threads.id`, `information_reveals.id`, `reveal_evidence.id`,
  `world_systems.id`, `character_system_progression.id` — each its own
  `SERIAL PRIMARY KEY` in plot-server's schema (see
  `src/mcps/plot-server/handlers/genre-extensions.js` and
  `plot-thread-handlers.js` — every `INSERT ... RETURNING id` targets a
  distinct table). Nothing in outline-server ever reads or writes these.

**The one genuinely shared ID space: `characters.id`.** Both servers write
FKs into the same canonical `characters` table — outline's
`pov_character_id` (on `outline_works`) and `character_id` (on
`outline_scene_events`); plot's `related_characters`/`affects_characters`/
`discovered_by`/`character_id` (on `create_plot_thread`,
`create_information_reveal`, `add_reveal_evidence`,
`track_system_progression`). A character ID is safe to pass between the two
— it's the same row in the same table either way.

**The `series`/`books`/`chapters` asterisk — read this before assuming it's
also shared:**

`outline_works` has four optional cross-link columns —
`series_id`, `book_id`, `chapter_id`, `scene_id` — added in migration 037 as
`legacy_series_id` etc. and renamed to their bare form in migration 039
(`ALTER TABLE outline_works RENAME COLUMN legacy_series_id TO series_id`, and
so on). These genuinely reference the same canonical `series`, `books`,
`chapters`, `chapter_scenes` tables that plot-server's `series_id`/
`start_book`/`end_book` arguments also point at. So far, that sounds like a
second shared ID space. In practice it isn't a useful one, because:

- `create_work`'s handler (`works-handlers.js:16-60`) inserts whatever
  integers you pass for `series_id`/`book_id`/`chapter_id`/`scene_id`
  straight into the row with **no existence check** — unlike plot-server,
  which validates `series_id` against the `series` table before every insert
  (`plot-thread-handlers.js:25-32`).
- No outline-server tool ever reads those columns back out. `get_outline`,
  `get_ancestry`, `list_works`, `search_works`, and `get_scene_brief` all
  `SELECT` specific column lists (or `SELECT *` in `get_scene_brief`, but the
  rendered brief text never surfaces `series_id`/`book_id`/`chapter_id`/
  `scene_id` — verified against `brief-handlers.js:158-235`). They're
  write-only bookkeeping today.

So: **don't rely on outline's `series_id`/`book_id`/`chapter_id`/`scene_id`
cross-links to do anything beyond storage.** They're an intentional escape
hatch (per the migration comments: "Cross-link via the optional legacy_*_id
columns if you want to point at existing rows") but no current tool consumes
them. If you need outline-server and plot-server to agree on "which book/
chapter," track that correspondence yourself — don't assume the schema does
it for you.

## Overlap / confusion risks

Beyond the evidence collision, three more places the two servers describe
adjacent-sounding things:

1. **Reveals.** Outline's `record_scene_events(event_type='reveals_fact')`
   logs a fact becoming known to a character at a specific tree node. Plot's
   `create_information_reveal` logs an information reveal against a
   `plot_thread_id` and (optionally) a `revealed_in_chapter`. Both answer
   "when did X become known," anchored to different spines (tree-node+fact
   vs. thread+chapter). No cross-reference exists between an
   `outline_facts.id` and an `information_reveals.id`.
2. **Setup/payoff vs. thread lifecycle.** Outline's `outline_promises`
   (single clue/foreshadow/setup planted at one node, paid off at another,
   status `open/progressing/paid/carried/abandoned`) and plot's
   `plot_threads` (a whole arc spanning `start_book..end_book`, status
   `active/resolved/on_hold/abandoned`) both track "something opened that
   must close" — but at wildly different granularity. A single-scene clue is
   a `promise`; "the mystery of who killed X, spanning book 1-3" is a
   `plot_thread`. Neither tool knows about the other's open items.
3. **World-system knowledge.** `define_world_system` and
   `track_system_progression` (plot-server) have no outline-server
   counterpart — this is exclusively plot's territory, no ambiguity there.

## Decision table

| Task | Use | Tool |
|---|---|---|
| Add a scene / chapter / act to the manuscript structure | outline-server | `create_work` (`work_type='scene'` etc.) |
| Get everything needed to draft a specific scene in one call | outline-server | `get_scene_brief` |
| Register a fact a character can/can't know yet | outline-server | `create_fact` |
| Check what a character knows at a given point in the manuscript | outline-server | `what_does_character_know_at` |
| Plant a clue/foreshadow/setup that must pay off later in *this* book | outline-server | `create_promise` / `update_promise` |
| Find dangling setups with no payoff | outline-server | `list_open_promises` |
| Track a finding the protagonist can't act on yet (forensic-tech agency gap) | outline-server | `create_evidence` / `list_unconverted_evidence` |
| Track a multi-book subplot / mystery arc across the series | plot-server | `create_plot_thread` / `update_plot_thread` |
| Check plot threads active in a given book number | plot-server | `get_plot_threads` (filter `book_number`) |
| Close out a series-spanning thread | plot-server | `resolve_plot_thread` |
| Log an information reveal (evidence, secret, backstory, world-rule) tied to a plot thread | plot-server | `create_information_reveal` |
| Attach corroborating evidence to an already-logged reveal | plot-server | `add_reveal_evidence` (requires existing `reveal_id`) |
| Define a magic/tech/psionics system's rules for the series | plot-server | `define_world_system` |
| Track a character's power-level progression in a world system | plot-server | `track_system_progression` |
| Link two plot threads together (parent/child, causal, etc.) | **neither — dead code**, see below | — |
| Look up valid values for `thread_type`, `plot_thread_statuses`, etc. | neither — use `metadata-server`'s `get_available_options` | — |

## Known dead code

- **`link_plot_threads` does not work.** The tool schema is fully commented
  out (`src/mcps/plot-server/schemas/plot-tools-schema.js:83-107`), the
  handler implementation is fully commented out
  (`src/mcps/plot-server/handlers/plot-thread-handlers.js:403-477`), and the
  dispatch entry is commented out
  (`src/mcps/plot-server/index.js:142`, plus the corresponding bind at line
  72). There is currently **no MCP-exposed way to create a
  `plot_thread_relationships` row.** Tracked upstream in issue #69 — don't
  reintroduce this doc's guidance as if the tool exists; it doesn't, as of
  this analysis.
- **`lookupSystemToolsSchema` (plot-server) is an empty array**
  (`plot-tools-schema.js:317`, comment confirms: "Lookup tools have been
  consolidated in metadata-server to avoid name conflicts"). If you're
  looking for `plot_thread_types`, `plot_thread_statuses`, or similar lookup
  vocabulary, it now lives behind `metadata-server`'s `get_available_options`
  — not in plot-server itself, despite the still-present (empty) export.

## Tool-description guidance

These are recommendations for whoever next touches the schema files — this
doc does not change server behavior or schemas itself (out of scope for this
card).

- **`create_evidence` (outline-server)** — description currently reads
  "Register a finding the protagonist produces but cannot directly act on."
  Consider prefixing with a disambiguator: *"Outline-tree evidence (forensic
  agency-gap tracking). NOT for reveal corroboration — see plot-server's
  `add_reveal_evidence` for that."*
- **`add_reveal_evidence` (plot-server)** — description currently reads "Add
  specific evidence to an information reveal (universal evidence tracking)."
  The phrase "universal evidence tracking" is exactly the kind of language
  that invites conflation with outline's evidence chain. Consider: *"Attach
  corroborating evidence to an EXISTING information reveal (requires
  `reveal_id`). NOT for tracking findings the protagonist can't act on yet —
  see outline-server's `create_evidence` for that."*
- **`create_work` (outline-server)** — the `series_id`/`book_id`/
  `chapter_id`/`scene_id` parameters are documented only as "Optional
  cross-link to X(id)" with no warning that nothing validates them and no
  tool reads them back. Worth an explicit note: *"Write-only bookkeeping;
  not validated against the target table and not surfaced by any
  outline-server query."*
- **`create_plot_thread` / `get_plot_threads` (plot-server)** — already
  reasonably precise (`series_id` is validated, `book_number` filter is
  clear). No change needed.

## Corrections to the original analysis (GH #74)

The GH #74 first-pass table was largely accurate and matched the source on
re-verification (tool counts, file:line references for `index.js` tool
registration/dispatch, the dead `link_plot_threads` code, the empty
`lookupSystemToolsSchema`). Two points needed sharpening:

1. **"Evidence is a name collision" is true at the concept level but not at
   the MCP tool-name level.** The two servers never register a tool with the
   literal same name — outline uses `create_evidence`/`update_evidence`/
   `list_unconverted_evidence`; plot uses only `add_reveal_evidence` (no
   create/update/list siblings, since it's a child record of a reveal, not a
   standalone entity). An MCP client connected to both servers simultaneously
   sees five distinctly-named tools, not a clash. The risk is a human or
   agent skimming schemas and assuming "evidence" means one thing, or reusing
   field vocabulary (`evidence_type`, `finding`) across the wrong tool by
   habit — not a technical collision. Worth stating precisely so nobody
   "fixes" a collision that doesn't exist at the protocol level.
2. **The two ID spaces are not perfectly disjoint — `characters.id` is
   genuinely shared, and outline's `series_id`/`book_id`/`chapter_id`/
   `scene_id` cross-link columns point at the same canonical tables
   plot-server uses (`series`, `books`, `chapters`).** The original
   framing ("Never pass an outline_works.id where a plot tool wants a
   series_id/chapter_id") is correct and remains the operative rule, but a
   reader could infer from "two ID spaces" that *every* ID is
   server-specific, which isn't quite right for `characters.id`. This doc's
   [Disjoint ID spaces](#disjoint-id-spaces) section spells out exactly which
   IDs cross safely (`characters.id`) and which don't (everything else),
   plus the important caveat that outline's canonical cross-link columns are
   currently write-only and unvalidated — a real trap, just a different one
   than "wrong table entirely."

No claim in the original analysis was found to be false; both corrections
above are precision upgrades, not reversals.
