# NPE Causality Chain Management MCP Server

This MCP server implements the **Narrative Physics Engine (NPE)** causality tracking specification, allowing AI writing teams to track and validate cause-effect relationships in narratives while ensuring character agency is maintained.

## Overview

The NPE Causality Server provides tools to:
- Create causality chains that track narrative cause-effect relationships
- Add individual causal links (cause → effect) to chains
- Validate chains for NPE compliance (character agency, continuity)
- Retrieve and analyze all causality chains for a book

## Database Tables

This server works with two primary NPE database tables:
- `npe_causality_chains` - Stores causality chain metadata
- `npe_causal_links` - Stores individual cause→effect links within chains

## Tools

### 1. create_causality_chain

Create a new causality chain to track a sequence of cause-effect relationships.

**Required Parameters:**
- `series_id` (integer) - Series ID
- `book_id` (integer) - Book ID
- `chain_name` (string) - Descriptive name for the chain
- `initiating_character_id` (integer) - Character who initiated the chain
- `chain_type` (enum) - Type: 'linear', 'branching', or 'convergent'

**Optional Parameters:**
- `chain_description` (string) - Detailed description
- `initiating_decision_id` (string) - ID of the decision that started the chain
- `start_chapter_id` (integer) - Starting chapter
- `start_scene_id` (integer) - Starting scene

**Returns:** Created chain with generated UUID

**Example:**
```javascript
{
  "series_id": 1,
  "book_id": 3,
  "chain_name": "Sarah's Decision to Leave",
  "initiating_character_id": 42,
  "chain_type": "linear",
  "chain_description": "Tracks the consequences of Sarah leaving her job"
}
```

### 2. add_causal_link

Add a cause→effect link to an existing causality chain.

**Required Parameters:**
- `chain_id` (string) - Chain UUID to add link to
- `cause_description` (string) - Description of the cause event
- `cause_type` (enum) - Type: 'character_decision', 'character_action', or 'consequence'
- `effect_description` (string) - Description of the effect/consequence
- `effect_type` (enum) - Type: 'consequence', 'doorway_of_no_return', or 'escalation'
- `link_type` (enum) - Type: 'direct', 'indirect', or 'delayed'

**Optional Parameters:**
- `cause_chapter_id` (integer) - Chapter where cause occurs
- `cause_scene_id` (integer) - Scene where cause occurs
- `effect_chapter_id` (integer) - Chapter where effect occurs
- `effect_scene_id` (integer) - Scene where effect occurs
- `character_agency` (boolean) - Does this maintain character agency? (default: true)
- `delay_chapters` (integer) - Chapters between cause and effect (default: 0)
- `mediating_factors` (string) - JSON array of intervening events

**Returns:** Created link with validation status

**Example:**
```javascript
{
  "chain_id": "550e8400-e29b-41d4-a716-446655440000",
  "cause_description": "Sarah confronts her boss about unethical practices",
  "cause_type": "character_action",
  "effect_description": "Sarah is fired and blacklisted in the industry",
  "effect_type": "consequence",
  "link_type": "direct",
  "character_agency": true,
  "delay_chapters": 0
}
```

### 3. validate_causality_chain

Validate a causality chain for NPE compliance, checking for:
- Character agency maintenance (NPE Rule #2)
- Continuity (no broken links)
- Completeness

**Required Parameters:**
- `chain_id` (string) - Chain UUID to validate

**Returns:** Validation report with violations and missing links

**Example:**
```javascript
{
  "chain_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 4. get_causality_chains_for_book

Retrieve all causality chains for a specific book.

**Required Parameters:**
- `book_id` (integer) - Book ID

**Optional Parameters:**
- `chain_type` (enum) - Filter by type: 'linear', 'branching', or 'convergent'
- `include_links` (boolean) - Include all causal links in response (default: false)

**Returns:** Array of chains with metadata and optional links

**Example:**
```javascript
{
  "book_id": 3,
  "chain_type": "linear",
  "include_links": true
}
```

## NPE Compliance

This server enforces **Narrative Physics Engine** principles:

1. **Character Agency (NPE Rule #2)** - All links must maintain character agency. The `character_agency` flag tracks this.

2. **Causality Continuity** - Validates that effects connect to subsequent causes (no broken chains).

3. **Chain Types**:
   - **Linear**: A→B→C (single path)
   - **Branching**: A→B,C (one cause, multiple effects)
   - **Convergent**: A,B→C (multiple causes, one effect)

## Usage Example

```javascript
// 1. Create a causality chain
const chain = await create_causality_chain({
  series_id: 1,
  book_id: 3,
  chain_name: "The Heist Gone Wrong",
  initiating_character_id: 15,
  chain_type: "branching"
});

// 2. Add causal links
await add_causal_link({
  chain_id: chain.id,
  cause_description: "Marcus decides to rob the bank without backup",
  cause_type: "character_decision",
  effect_description: "Marcus gets trapped inside when alarm triggers",
  effect_type: "consequence",
  link_type: "direct",
  character_agency: true
});

await add_causal_link({
  chain_id: chain.id,
  cause_description: "Marcus gets trapped inside when alarm triggers",
  cause_type: "consequence",
  effect_description: "Police surround the building",
  effect_type: "escalation",
  link_type: "direct",
  delay_chapters: 1
});

// 3. Validate the chain
const validation = await validate_causality_chain({
  chain_id: chain.id
});

// 4. Get all chains for the book
const allChains = await get_causality_chains_for_book({
  book_id: 3,
  include_links: true
});
```

## File Structure

```
npe-causality-server/
├── index.js                          # Main server class
├── handlers/
│   └── causality-handlers.js         # Tool implementations
├── schemas/
│   └── causality-tools-schema.js     # Tool definitions
└── README.md                         # This file
```

## Database Schema

The server uses these NPE database tables (from migration 024):

### npe_causality_chains
- `id` (TEXT PRIMARY KEY) - UUID
- `series_id`, `book_id` - Foreign keys
- `chain_name`, `chain_description` - Metadata
- `initiating_decision_id`, `initiating_character_id` - Chain start
- `chain_type` - linear/branching/convergent
- `is_complete`, `has_character_agency`, `npe_compliant` - Validation flags

### npe_causal_links
- `id` (TEXT PRIMARY KEY) - UUID
- `chain_id` (FK) - Parent chain
- `cause_event_id`, `cause_type`, `cause_description` - Cause details
- `effect_event_id`, `effect_type`, `effect_description` - Effect details
- `link_type` - direct/indirect/delayed
- `character_agency` - NPE compliance flag
- `delay_chapters` - Temporal distance

## Error Handling

The server provides detailed error messages for:
- Invalid foreign keys (series, book, character, chapter, scene)
- Missing required parameters
- Database constraint violations
- NPE compliance violations

## Integration

This server integrates with:
- **Character Server** - For character validation
- **Book Server** - For book/series validation
- **Timeline Server** - For chapter/scene references
- **NPE Character Server** - For decision tracking

## License

Part of the MCP Writing Servers project.
