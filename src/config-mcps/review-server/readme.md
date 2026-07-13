# Review MCP Server

## Purpose / when to use it

Use this server during the **editing/revision phase**: structural and beat-
placement validation, world-consistency checks, manuscript export, and
writing-goal/productivity tracking. It's a mix of read-only checks and
session/goal bookkeeping — it does not create or update chapters, characters, or
scenes (use `chapter-planning-server`, `character-planning-server`, or
`scene-server` for that).

Composed from handlers in `src/mcps/writing-server`, `src/mcps/timeline-server`,
`src/mcps/world-server`, and `src/mcps/trope-server` — see
[`index.js`](index.js) for the exact aggregation. One shared DB connection.

## Tools

Verified against `getToolHandler()` in `index.js`:

- `validate_chapter_structure`, `validate_beat_placement`, `check_structure_violations` — structural/pacing/continuity checks
- `word_count_tracking` — pacing/chapter-length analysis
- `export_manuscript` — generate full or partial manuscript for review
- `check_world_consistency` — flag world-building contradictions
- `set_writing_goals`, `get_productivity_analytics`, `get_writing_progress` — writing-session goals and analytics
- `get_trope_progress`, `analyze_trope_patterns` — trope tracking/analysis

## Running it

`node src/single-server-runner.js review 3007` (or via the orchestrator,
`node server.js`, which spawns it on port 3007 alongside the other core servers).
