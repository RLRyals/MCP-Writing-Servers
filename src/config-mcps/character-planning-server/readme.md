# Character Planning MCP Server

## Purpose / when to use it

Use this server when creating or maintaining a **character**: the character
record itself, book-specific character details, a character arc for a given book,
or a relationship arc between two characters. It's the write path for character
structure — not for character knowledge/continuity state during drafting (that's
read-only in `core-continuity-server`; write-with-chapter-context lives in
`chapter-planning-server`'s `character_add_character_knowledge_with_chapter`), and
not for raw table CRUD (see
[`database-admin-server`](../../mcps/database-admin-server/README.md), which is
admin/migration only). Writing `characters` rows through raw CRUD skips this
server's arc/relationship/knowledge wiring — a raw insert won't be visible to
continuity or knowledge-timing checks until something resyncs it.

Composed from handlers in `src/mcps/character-server` and
`src/mcps/relationship-server` — see [`index.js`](index.js) for the exact
aggregation. One shared DB connection.

## Tools

Verified against `getToolHandler()` in `index.js`:

- `list_characters`, `create_character`, `get_character`, `update_character` — character CRUD
- `add_character_detail`, `update_character_detail` — book-specific character details
- `check_character_knowledge` — check what a character knows (read-only guard against plot holes)
- `create_character_arc`, `update_character_arc`, `delete_character_arc`, `list_character_arcs` — character arc for a book
- `create_relationship_arc`, `update_relationship_arc`, `track_relationship_dynamics`, `list_relationship_arcs` — relationship arcs between characters

## Running it

`node src/single-server-runner.js character-planning 3004` (or via the
orchestrator, `node server.js`, which spawns it on port 3004 alongside the other
core servers).
