# Core Continuity MCP Server

## Purpose / when to use it

**Read-only** server for continuity checks while drafting or reviewing: what does
a character know, is a character's state consistent across a chapter range, what
plot threads are open, what does a relationship look like over time, what lookup
values/tropes exist. Run these checks *before* and *after* writing a scene or
chapter to catch contradictions early — that's cheaper than finding them in a
later editing pass. This server does not write anything; for the corresponding
write operations use `character-planning-server`, `chapter-planning-server`, or
`book-planning-server`.

Composed from handlers in `src/mcps/character-server`, `src/mcps/plot-server`,
`src/mcps/relationship-server`, `src/mcps/timeline-server`,
`src/mcps/metadata-server`, and `src/mcps/trope-server` — see
[`index.js`](index.js) for the exact aggregation. One shared DB connection.

## Tools

Verified against `getToolHandler()` in `index.js`:

- `get_character`, `get_character_details` — character lookups
- `check_character_knowledge` — what does this character know
- `check_character_continuity` — validate a character's state/knowledge stays
  consistent across a `from_chapter_id`→`to_chapter_id` range; this is the check
  a raw CRUD read can't give you, because it doesn't know what "consistent" means
- `get_plot_threads` — open plot threads for continuity checking
- `get_relationship_arc`, `get_relationship_timeline` — relationship state/history
- `get_event_mappings` — timeline event ↔ chapter mappings
- `get_available_options` — lookup vocabulary (genres, plot thread types, relationship types, story elements)
- `get_trope`, `list_tropes`, `get_trope_instance`, `list_trope_instances` — trope definitions/instances (read-only; creation lives in `series-planning-server`/`book-planning-server`)

## Running it

`node src/single-server-runner.js core-continuity 3006` (or via the orchestrator,
`node server.js`, which spawns it on port 3006 alongside the other core servers).
