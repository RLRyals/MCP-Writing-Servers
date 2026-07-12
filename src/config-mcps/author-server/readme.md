# Author MCP Server

## Purpose / when to use it

Use this server to create or maintain **author** records — the top-level entity
a series belongs to. There's no series/book-specific logic here; it's a small,
self-contained CRUD surface for author metadata (name, bio, etc.), and unlike
generic CRUD it's whitelisted to exactly this table with a stable, documented
interface.

This is a thin wrapper: it imports `AuthorHandlers` from
[`src/mcps/author-server`](../../mcps/author-server) directly rather than
duplicating logic — see [`index.js`](index.js). One shared DB connection.

## Tools

Verified against `getToolHandler()` in `index.js`:

- `list_authors` — list author records
- `get_author` — get a single author by id
- `create_author` — create an author record
- `update_author` — update an author record

## Running it

`node src/single-server-runner.js author 3009` (or via the orchestrator,
`node server.js`, which spawns it on port 3009 alongside the other core servers).
