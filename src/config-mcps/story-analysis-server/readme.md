# Story Analysis MCP Server

## Purpose / when to use it

Use this server for **narrative-theory-inspired story analysis**: recording the
overall dynamics of a book's story (concern, main/influence character problems,
outcome, judgment, themes), tracking a character's throughline across a book,
identifying story appreciations (evidence-backed narrative observations), and
mapping problems to attempted solutions at the story/character/relationship
level. It is the write path for this analysis layer — not for character
structure itself (see `character-planning-server`) and not for continuity
checks during drafting (see `core-continuity-server`).

Composed from two handlers in `src/mcps/story-analysis-server` — see
[`index.js`](index.js) for the exact aggregation. One shared DB connection.

The four analysis tools INSERT/UPDATE the `story_analysis`,
`character_throughlines`, `story_appreciations`, and `problem_solutions`
tables. Two of the four handlers (`track_character_throughlines`,
`identify_story_appreciations`) fall back to appending a note into
`story_analysis.analysis_notes` if their dedicated table isn't present in the
target database — see `src/mcps/story-analysis-server/handlers/story-analysis-handlers.js`
for that fallback logic.

The three storyform tools are the read/CRUD layer over the `storyforms`
table (migration 046) — one row per series-master storyform (`book_id` NULL)
or per-book storyform. See
`src/mcps/story-analysis-server/handlers/storyform-handlers.js`. Canon-DB
flip 01: `FictIonLab-Downloads/specs/2026-07-10-canon-db-migration/01-storyform-storage.md`.

## Tools

Verified against `getToolHandler()` in `index.js`:

- `analyze_story_dynamics` — create/update the story-level analysis for a book
- `track_character_throughlines` — create/update a character's throughline for a book
- `identify_story_appreciations` — record a story appreciation with supporting evidence
- `map_problem_solutions` — map a problem to its attempted solution and effectiveness
- `create_storyform` — create the storyform-of-record for a series or a specific book
- `update_storyform` — update an existing storyform-of-record
- `get_storyform` — read the storyform-of-record for a series or a specific book

## Running it

Registered in `src/http-sse-server.js` on port 3016 (multi-port SSE mode). Not
currently added to `single-server-runner.js`'s server map or the `server.js`
orchestrator's default server list (the same gap `npe-server` has) — run it
directly via `node src/config-mcps/story-analysis-server/index.js` (CLI mode)
or `MCP_STDIO_MODE=true node src/config-mcps/story-analysis-server/index.js`
(MCP stdio mode) until it's wired into those runners.
