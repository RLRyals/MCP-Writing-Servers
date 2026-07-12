# Outline MCP Server

## Purpose / when to use it

Use this server to build and query the **per-scene story bible**: a
series→book→act→beat→chapter→scene outline tree, the facts established along
the way, promises (setups that must pay off), an evidence chain (findings a
character can't act on yet), a batched log of what happened in a scene, and a
"what does this character know as of this point" query. This is the
bottom-up, manuscript-structure counterpart to the top-down, multi-book
`plot_*` tools folded into `book-planning-server`/`chapter-planning-server`
(open plot threads, series-level reveals, world systems) — **the two use
separate ID spaces and are not interchangeable.** See the root README's
"outline vs plot_* tools" section, and the fuller decision guide at
[`docs/outline-vs-plot.md`](../../../docs/outline-vs-plot.md) (tracked in
[#74](https://github.com/RLRyals/MCP-Writing-Servers/issues/74)), before
assuming a tool from one accepts an id from the other.

Owns the `outline_*` tables. Composed from handlers in
[`src/mcps/outline-server`](../../mcps/outline-server) — see
[`index.js`](index.js) for the exact aggregation. One shared DB connection.

## Tools

Verified against `getToolHandler()` in `index.js` (21 tools):

- `create_work`, `update_work`, `move_work`, `delete_work` — outline tree nodes (series/book/act/beat/chapter/scene)
- `get_outline`, `get_ancestry`, `list_series_roots`, `list_works`, `search_works` — read the tree
- `create_fact`, `list_facts`, `update_fact`, `delete_fact` — facts established in the story
- `create_promise`, `update_promise`, `list_open_promises` — setups that must pay off
- `create_evidence`, `update_evidence`, `list_unconverted_evidence` — findings a character can't act on yet
- `record_scene_events` — batch-log what a scene does (event_type + entity id); this is the source-of-truth tool for scene content, not a raw insert into an events table
- `what_does_character_know_at` — replay a character's knowledge state as of a given tree node
- `get_scene_brief` — pull the staged brief for a scene

## Running it

`node src/single-server-runner.js outline 3013`. Not currently spawned by the
`server.js` orchestrator's default 11-server list — run standalone via
`single-server-runner.js`, or confirm with your deployment operator how it's
started in this environment. It is registered in agent-facing
[`mcp-config/mcp-config.json`](../../../mcp-config/mcp-config.json).
