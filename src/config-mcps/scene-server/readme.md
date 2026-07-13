# Scene Writing MCP Server

## Purpose / when to use it

Use this server while actively **drafting a scene**: create/update the scene
record, check who's supposed to appear in the chapter, validate structure/beats
as you go, track word count, and log the writing session. This is the write path
for scene-level prose bookkeeping — not for the chapter record itself (see
`chapter-planning-server`), and not for raw table CRUD (see
[`database-admin-server`](../../mcps/database-admin-server/README.md), which is
admin/migration only).

Composed from handlers in `src/mcps/book-server` (scenes), `src/mcps/character-server`,
`src/mcps/writing-server`, and `src/mcps/trope-server` — see
[`index.js`](index.js) for the exact aggregation. One shared DB connection.

## Tools

Verified against `getToolHandler()` in `index.js`:

- `create_scene`, `update_scene`, `get_scene`, `list_scenes` — scene CRUD (create as scenes are written; update with word counts/status)
- `get_character_details`, `get_characters_in_chapter` — check who's present before/while writing
- `check_character_continuity` — validate this scene's character state against earlier chapters
- `validate_chapter_structure`, `validate_beat_placement`, `check_structure_violations` — structural/pacing checks
- `word_count_tracking` — track word-count progress
- `log_writing_session` — log a writing session
- `implement_trope_scene`, `get_trope_scenes` — trope implementation tied to this scene

## Running it

`node src/single-server-runner.js scene 3005` (or via the orchestrator,
`node server.js`, which spawns it on port 3005 alongside the other core servers).
