# Chapter Planning MCP Server

## Purpose / when to use it

Use this server when planning or writing a **chapter**: creating/updating the
chapter record, tracking which locations/world-elements/organizations get used in
it, mapping a timeline event to it, logging a character-knowledge reveal tied to
it, tracking a character's presence in it, or resolving a plot thread it closes
out. It's the write path for chapter-level structure and chapter-scoped
continuity bookkeeping — not for the book record itself (see
`book-planning-server`), not for scene prose/word-count (see `scene-server`), and
not for raw table CRUD (see
[`database-admin-server`](../../mcps/database-admin-server/README.md), which is
admin/migration only).

Composed from handlers in `src/mcps/book-server` (chapters), `src/mcps/timeline-server`,
`src/mcps/world-server`, `src/mcps/character-server`, and `src/mcps/plot-server`
— see [`index.js`](index.js) for the exact aggregation. One shared DB connection.

## Tools

Verified against `getToolHandler()` in `index.js`. Note several tools are exposed
under a prefixed alias here (e.g. `create_chapter` → `book_create_chapter`) to
disambiguate from same-named tools in other servers:

- `book_create_chapter`, `book_update_chapter`, `book_get_chapter`, `book_list_chapters` — chapter CRUD
- `timeline_map_event_to_chapter`, `update_timeline_event`, `update_event_mapping` — timeline↔chapter mapping
- `world_track_location_usage`, `world_track_element_usage`, `update_location`, `update_world_element` — world-building usage tracking for this chapter
- `track_organization_activity`, `update_organization` — organization activity tracking
- `character_add_character_knowledge_with_chapter`, `character_get_characters_who_know`, `track_character_presence` — character knowledge/presence tied to this chapter (use `track_character_presence` rather than a raw insert into `character_timeline_events` so knowledge-timing checks stay valid)
- `plot_create_information_reveal`, `plot_add_reveal_evidence` — mystery/reveal tracking scoped to this chapter
- `resolve_plot_thread` — close out a plot thread from this chapter

## Running it

`node src/single-server-runner.js chapter-planning 3003` (or via the orchestrator,
`node server.js`, which spawns it on port 3003 alongside the other core servers).
