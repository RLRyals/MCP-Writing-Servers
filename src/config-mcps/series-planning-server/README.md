# Series Planning MCP Server

## Purpose / when to use it

Use this server when standing up or maintaining a **series**: the series record
itself, series-level genres, series-scoped world-building (locations,
organizations, world elements), a world "system" definition (magic system, tech
level, etc.), and defining a trope at the series level. It's the top-of-the-tree
write path — book-level structure lives in `book-planning-server`, chapter-level
in `chapter-planning-server`. Reading series-scoped world data back during
drafting/continuity checks goes through `core-continuity-server`, not this
server.

Composed from handlers in `src/mcps/series-server`, `src/mcps/metadata-server`,
`src/mcps/world-server`, `src/mcps/plot-server` (genre extensions only), and
`src/mcps/trope-server` — see [`index.js`](index.js) for the exact aggregation.
One shared DB connection.

## Tools

Verified against `getToolHandler()` in `index.js` — note this list previously
drifted from the code (a stale prefixed set like `series_create_series`,
`world_create_location`); the names below are the actual, currently callable
tool names:

- `list_series`, `create_series`, `get_series`, `update_series` — series CRUD
- `assign_series_genres` — attach genres to a series
- `create_location`, `get_locations` — series-scoped locations
- `create_organization`, `get_organizations` — series-scoped organizations
- `create_world_element`, `get_world_elements` — series-scoped world elements
- `define_world_system` — define a world system (magic/tech/rules) for the series
- `create_trope` — define a trope at the series level (trope *instances* are created per-book in `book-planning-server`; trope lookups are read-only in `core-continuity-server`)

## Running it

`node src/single-server-runner.js series-planning 3002` (or via the orchestrator,
`node server.js`, which spawns it on port 3002 alongside the other core servers).
