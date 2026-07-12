# Book Planning MCP Server

## Purpose / when to use it

Use this server when planning or maintaining a **book** inside a series: creating
the book record itself, opening a book- or series-spanning plot thread, logging a
timeline event, or assigning genres. It's the write path for book-level structure
— not for chapters (see `chapter-planning-server`), not for scenes (see
`scene-server`), and not for raw table CRUD (see
[`database-admin-server`](../../mcps/database-admin-server/README.md), which is
admin/migration only).

Composed from handlers in `src/mcps/book-server`, `src/mcps/plot-server`,
`src/mcps/timeline-server`, `src/mcps/metadata-server`, and `src/mcps/trope-server`
— see [`index.js`](index.js) for the exact aggregation. One shared DB connection.

## Tools

Verified against `getToolHandler()` in `index.js`:

- `create_book`, `update_book`, `get_book`, `list_books` — book CRUD
- `create_plot_thread`, `update_plot_thread` — open/update a plot thread scoped to
  this book/series (see the root README's outline-vs-plot note before using —
  don't confuse this with the `outline` server's own tree)
- `create_timeline_event` — log a timeline event
- `assign_book_genres` — attach genres to a book
- `create_trope_instance`, `list_trope_instances`, `get_trope_instance` — trope
  instances scoped to this book

## Running it

`node src/single-server-runner.js book-planning 3001` (or via the orchestrator,
`node server.js`, which spawns it on port 3001 alongside the other core servers).
