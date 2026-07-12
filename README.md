# MCP Writing Servers

MCP tool servers backing `mcp_writing_db` (the story database) for AI writing-team
agents: series/book/character/scene/continuity data, plus narrative-physics (NPE)
validation and project/kanban tooling.

## The one rule

**Write to the story database through the purpose-built domain servers below —
not through `database-admin-server`'s raw CRUD tools.**

`database-admin-server` (`db_query_records` / `db_insert_record` / `db_update_records`
/ `db_delete_records`, plus batch/schema/backup tools — see
[`src/mcps/database-admin-server/README.md`](src/mcps/database-admin-server/README.md))
talks directly to whitelisted tables. It has no idea a character already knows a
secret, that a chapter's word count should roll up from its scenes, or that a plot
thread needs a `resolved_at`. Writing through it is easy to reach for — the docs
under `docs/` document almost nothing else — but it silently skips every
continuity/knowledge-state/arc invariant the domain servers exist to enforce.

`database-admin-server` is legitimate for: one-off admin fixes, bulk data
repair/migration, and schema introspection. It is **not** the normal authoring
path. If you're about to `db_insert_record` into `chapters`, `characters`,
`scenes`, `plot_threads`, or similar, stop and find the matching tool below first.

## Which server for which task

These are the phase-oriented MCP servers agents actually connect to (per
[`mcp-config/mcp-config.json`](mcp-config/mcp-config.json)). Each aggregates tools
from one or more domain modules in `src/mcps/*` behind a single SSE endpoint — see
each server's own readme for the full tool list and args.

| Task | Server | Config dir | Representative tools |
|---|---|---|---|
| Create/update a series, series-level world (locations, orgs, world elements), assign series genres, define a trope | **series-planning** | [`src/config-mcps/series-planning-server`](src/config-mcps/series-planning-server/readme.md) | `create_series`, `update_series`, `create_location`, `create_organization`, `create_world_element`, `define_world_system`, `create_trope` |
| Create/update a book, open a plot thread, log a timeline event, assign genres | **book-planning** | [`src/config-mcps/book-planning-server`](src/config-mcps/book-planning-server/readme.md) | `create_book`, `update_book`, `create_plot_thread`, `update_plot_thread`, `create_timeline_event` |
| Create/update a chapter, track world/location/org usage in a chapter, map a timeline event to a chapter, log a character-knowledge reveal tied to a chapter, resolve a plot thread | **chapter-planning** | [`src/config-mcps/chapter-planning-server`](src/config-mcps/chapter-planning-server/readme.md) | `book_create_chapter`, `book_update_chapter`, `track_character_presence`, `character_add_character_knowledge_with_chapter`, `resolve_plot_thread` |
| Create/update a character, add book-specific character details, create/update a character arc, create/update a relationship arc | **character-planning** | [`src/config-mcps/character-planning-server`](src/config-mcps/character-planning-server/readme.md) | `create_character`, `update_character`, `add_character_detail`, `create_character_arc`, `create_relationship_arc` |
| Write a scene, track a character's presence/word count in it, validate structure/beats before moving on | **scene** | [`src/config-mcps/scene-server`](src/config-mcps/scene-server/readme.md) | `create_scene`, `update_scene`, `get_characters_in_chapter`, `validate_chapter_structure`, `word_count_tracking`, `log_writing_session` |
| **Read-only** checks while drafting: what does this character know, is this consistent with earlier chapters, what are the open plot threads, what lookup values exist | **core-continuity** | [`src/config-mcps/core-continuity-server`](src/config-mcps/core-continuity-server/readme.md) | `check_character_knowledge`, `check_character_continuity`, `get_plot_threads`, `get_available_options` |
| Editing-pass checks (structure/beats/world consistency), manuscript export, writing goals/productivity | **review** | [`src/config-mcps/review-server`](src/config-mcps/review-server/readme.md) | `check_structure_violations`, `check_world_consistency`, `export_manuscript`, `get_productivity_analytics` |
| Roll up a report across series/book entities | **reporting** | [`src/config-mcps/reporting-server`](src/config-mcps/reporting-server/readme.md) | `generate_report` |
| Manage author records | **author** | [`src/config-mcps/author-server`](src/config-mcps/author-server/readme.md) | `create_author`, `update_author`, `get_author`, `list_authors` |
| Per-scene story-bible: outline tree, facts, promises (setups/payoffs), evidence chain, scene events, scene briefs | **outline** | [`src/config-mcps/outline-server`](src/config-mcps/outline-server/readme.md) | `create_work`, `record_scene_events`, `create_promise`, `create_evidence`, `get_scene_brief`, `what_does_character_know_at` |
| Kanban board / card / claim workflow for agent task coordination | **kanban** | [`src/mcps/kanban-server`](src/mcps/kanban-server/README.md) | `list_cards`, `claim_card`, `comment_card`, `move_card` |
| Admin/migration/bulk-repair CRUD; **not** normal authoring | **database-admin** | [`src/mcps/database-admin-server`](src/mcps/database-admin-server/README.md) | `db_query_records`, `db_insert_record`, `db_update_records`, `db_delete_records` |

Two servers exist in the codebase but are **not** part of the standard
agent-facing deployment above (`mcp-config/mcp-config.json`) as of this writing —
confirm with whoever runs your MCP client config before assuming either is live:

- **npe** ([`src/config-mcps/npe-server`](src/config-mcps/npe-server/README.md)) —
  unified Narrative Physics Engine tools (causality chains, character-decision
  validation, scene/dialogue validation, pacing & stakes analysis). Already has a
  good readme — read it before using any `npe_*`-flavored tool.
- **workflow-manager** (`src/mcps/workflow-manager-server`) — workflow
  definition/execution graph tools.

### `outline` vs `plot_*` tools — don't conflate them

The `outline` server's own tree (`outline_works`, `outline_facts`,
`outline_promises`, `outline_evidence_chain`, scene events) and the
`plot_create_plot_thread` / `plot_update_plot_thread` / `create_information_reveal`
tools folded into `book-planning` and `chapter-planning` are **two different
systems with two different ID spaces** — do not pass an `outline_works.id` where a
plot tool expects a `series_id`/`chapter_id`, or vice versa. A full decision guide
(what each owns, where they overlap, when to use which) is tracked in
[RLRyals/MCP-Writing-Servers#74](https://github.com/RLRyals/MCP-Writing-Servers/issues/74)
and will land at `docs/outline-vs-plot.md`. Until that lands: outline = per-scene
manuscript structure + character-knowledge replay; plot = multi-book arcs,
series-level reveals, and world-systems.

## Everything under `docs/`

Everything in [`docs/`](docs/) — `ARCHITECTURE.md`, `API-REFERENCE.md`,
`USER-GUIDES.md`, `TUTORIALS.md`, `EXAMPLES.md`, `OPERATIONS-GUIDE.md`,
`SECURITY-GUIDE.md` — is the **`database-admin-server` manual**, not general
project documentation. Each of those pages carries a banner pointing back here.
Use them when you're actually doing admin/migration work against
`database-admin-server`; don't use `EXAMPLES.md` as a model for how to write a
chapter or character.

## Running the servers

- `node server.js` — orchestrator; spawns `book-planning`, `series-planning`,
  `chapter-planning`, `character-planning`, `scene`, `core-continuity`, `review`,
  `reporting`, `author`, `database-admin`, and `workflow-manager` as child
  processes (see [`server.js`](server.js)).
- `node src/single-server-runner.js <server-name> <port>` — run one server
  standalone (also how `outline` and `kanban` get run in this deployment; see
  [`src/single-server-runner.js`](src/single-server-runner.js) for the full
  `server-name` → module map).
- [`docker-compose.yml`](docker-compose.yml) — full production stack (Postgres,
  PgBouncer, the 13-port server set, Prometheus, Grafana).

## Docs index

- [`DATABASE-CRUD-SPECIFICATION.md`](DATABASE-CRUD-SPECIFICATION.md) — design spec
  for `database-admin-server` itself (admin/migration layer, not the authoring path).
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — production deployment for the whole
  server ecosystem.
- [`docs/MCP-ELECTRON-INTEGRATION.md`](docs/MCP-ELECTRON-INTEGRATION.md) —
  wiring these servers into the MCP-Electron desktop app.
- `src/config-mcps/*/readme.md` and `src/mcps/*/README.md` — per-server tool
  reference (linked in the table above).
