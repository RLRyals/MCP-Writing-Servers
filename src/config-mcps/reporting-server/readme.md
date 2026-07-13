# Reporting MCP Server

## Purpose / when to use it

Use this server to generate a rolled-up **report** across series/book entities
— an organized summary rather than raw row data. It's read-only and has a
single tool; for the underlying entity data itself, use the domain server that
owns it (`series-planning-server`, `book-planning-server`, etc.) or
`core-continuity-server` for continuity-focused reads.

Composed from `ReportingHandlers` in [`handlers/reporting-handlers.js`](handlers/reporting-handlers.js)
— see [`index.js`](index.js). One shared DB connection.

## Tools

Verified against `getToolHandler()` in `index.js`:

- `generate_report` — generate a report of series/book entities with organized lists

## Running it

`node src/single-server-runner.js reporting 3008` (or via the orchestrator,
`node server.js`, which spawns it on port 3008 alongside the other core servers).
