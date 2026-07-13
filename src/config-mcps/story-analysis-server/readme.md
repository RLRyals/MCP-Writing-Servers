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

Composed from the single handler in `src/mcps/story-analysis-server` — see
[`index.js`](index.js) for the exact aggregation. One shared DB connection.

The four write tools INSERT/UPDATE the `story_analysis`,
`character_throughlines`, `story_appreciations`, and `problem_solutions`
tables. Two of the four handlers (`track_character_throughlines`,
`identify_story_appreciations`) fall back to appending a note into
`story_analysis.analysis_notes` if their dedicated table isn't present in the
target database — see `src/mcps/story-analysis-server/handlers/story-analysis-handlers.js`
for that fallback logic.

## Tools

Verified against `getToolHandler()` in `index.js`:

- `analyze_story_dynamics` — create/update the story-level analysis for a book
- `track_character_throughlines` — create/update a character's throughline for a book
- `identify_story_appreciations` — record a story appreciation with supporting evidence
- `map_problem_solutions` — map a problem to its attempted solution and effectiveness

## Running it

Registered in `src/http-sse-server.js` on port 3016 (multi-port SSE mode). Not
currently added to `single-server-runner.js`'s server map or the `server.js`
orchestrator's default server list (the same gap `npe-server` has) — run it
directly via `node src/config-mcps/story-analysis-server/index.js` (CLI mode)
or `MCP_STDIO_MODE=true node src/config-mcps/story-analysis-server/index.js`
(MCP stdio mode) until it's wired into those runners.
