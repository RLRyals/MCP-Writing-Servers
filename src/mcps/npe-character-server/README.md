# NPE Character Decision Tracking MCP Server

This MCP server provides tools for tracking and validating character decisions according to Narrative Physics Engine (NPE) principles. It ensures that character decisions are consistent with their established traits, goals, fears, and wounds.

## Overview

The NPE Character Decision Tracking server helps writers maintain character consistency by:
- Logging character decisions with NPE alignment checks
- Validating decisions against character traits
- Tracking decision alternatives (must be 2-3 plausible options)
- Retrieving all decisions within a scene

## Tools

### 1. log_character_decision

Logs a character decision with NPE alignment validation.

**Required Parameters:**
- `character_id` (integer) - Character making the decision
- `book_id` (integer) - Book where decision occurs
- `scene_id` (integer) - Scene where decision occurs
- `decision_description` (string) - Description of the decision
- `character_version` (string) - Character version (V1, V2, V3, or V4)
- `alternatives` (array) - 2-3 plausible alternative choices
- `aligned_with_goals` (boolean) - Decision aligns with character goals?
- `aligned_with_fears` (boolean) - Decision aligns with character fears?
- `aligned_with_wounds` (boolean) - Decision aligns with character wounds?
- `operating_on_incomplete_info` (boolean) - Character has incomplete information?

**Optional Parameters:**
- `why_this_choice` (string) - Explanation of why character chose this option
- `context_state` (string) - Character state: baseline, mild_stress, or extreme_stress
- `immediate_consequence` (string) - Immediate consequence of the decision

**Validation:**
- Alternatives count must be exactly 2 or 3
- Generates UUID for decision ID automatically
- Verifies character and book exist in database

**Returns:**
Created decision record with alignment details

**Example:**
```json
{
  "character_id": 42,
  "book_id": 1,
  "scene_id": 105,
  "decision_description": "Sarah decides to confront her father about the family secret",
  "character_version": "V2",
  "alternatives": [
    "Continue avoiding her father and keep the peace",
    "Tell her mother first and let her handle it"
  ],
  "aligned_with_goals": true,
  "aligned_with_fears": false,
  "aligned_with_wounds": true,
  "operating_on_incomplete_info": true,
  "why_this_choice": "Despite her fear of conflict, Sarah's need for truth (V2 goal) outweighs her wound of family rejection",
  "context_state": "mild_stress",
  "immediate_consequence": "Father becomes defensive and refuses to discuss it"
}
```

### 2. validate_character_decision

Validates that a decision aligns with character traits and NPE principles.

**Required Parameters:**
- `decision_id` (string) - UUID of the decision to validate

**Returns:**
Validation results including:
- `compliant` (boolean) - NPE compliance status
- `alignment_scores` (object) - Scores for goals, fears, wounds (0.0 - 1.0)
- `violations` (array) - List of NPE violations if any

**Compliance Criteria:**
- Requires at least 2 out of 3 alignments (goals, fears, wounds)
- Overall score must be ≥ 0.67 (67%)
- Alternatives count must be 2-3

**Example:**
```json
{
  "decision_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```
NPE COMPLIANCE: ✓ COMPLIANT
Overall Score: 67%

Alignment Scores:
  - Goals: 1.0 ✓
  - Fears: 0.0 ✗
  - Wounds: 1.0 ✓

Violations:
  - Decision does not align with character fears
```

### 3. get_character_decisions_in_scene

Retrieves all character decisions made within a specific scene.

**Required Parameters:**
- `scene_id` (integer) - Scene ID

**Returns:**
Array of all decisions in the scene with:
- Decision details
- Character information
- NPE alignment status
- Alternatives considered
- Consequences

**Example:**
```json
{
  "scene_id": 105
}
```

**Response:**
```
Character Decisions in Scene 105:
Found 2 decision(s)

1. Sarah - Decides to confront her father about the family secret
   Decision ID: 550e8400-e29b-41d4-a716-446655440000
   Book: The Family Truth
   Chapter: 12 - Breaking Point
   Character Version: V2
   NPE Alignment: Goals=✓, Fears=✗, Wounds=✓
   Alternatives (2):
     1. Continue avoiding her father and keep the peace
     2. Tell her mother first and let her handle it
   Consequence: Father becomes defensive and refuses to discuss it
   NPE Compliant: ✓ Yes

2. Father - Chooses to deflect and change the subject
   ...
```

## Database Schema

The server uses the `npe_character_decisions` table:

```sql
CREATE TABLE npe_character_decisions (
    id TEXT PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id),
    book_id INTEGER NOT NULL REFERENCES books(id),
    chapter_id INTEGER REFERENCES chapters(id),
    scene_id INTEGER REFERENCES chapter_scenes(id),
    decision_description TEXT NOT NULL,
    character_version TEXT CHECK(character_version IN ('V1', 'V2', 'V3', 'V4')),
    alternatives_count INTEGER CHECK(alternatives_count BETWEEN 2 AND 3),
    alternatives TEXT,  -- JSON array
    aligned_with_goals BOOLEAN,
    aligned_with_fears BOOLEAN,
    aligned_with_wounds BOOLEAN,
    operating_on_incomplete_info BOOLEAN DEFAULT TRUE,
    why_this_choice TEXT,
    context_state TEXT CHECK(context_state IN ('baseline', 'mild_stress', 'extreme_stress')),
    immediate_consequence TEXT,
    npe_compliant BOOLEAN,
    violations TEXT,  -- JSON array
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## NPE Principles

### Character Versions
- **V1**: Character at story start (baseline traits)
- **V2**: First major shift (new goal or realization)
- **V3**: Deepening complexity (conflicting desires)
- **V4**: Transformed character (integrated growth)

### Context States
- **baseline**: Character's normal operating mode
- **mild_stress**: Elevated pressure, some trait exaggeration
- **extreme_stress**: High pressure, defensive behaviors activated

### NPE Alignment Requirements
1. **Goals**: Decision should logically connect to character's current objectives
2. **Fears**: Decision may oppose fears (courage) or succumb to them (avoidance)
3. **Wounds**: Past trauma influences decision-making patterns

### Alternatives Requirement
NPE requires 2-3 plausible alternatives to demonstrate:
- Character agency (chose among real options)
- Narrative causality (choice matters)
- Reader understanding (why this choice over others)

## Error Handling

The server provides detailed error messages for:
- Invalid alternatives count (must be 2-3)
- Missing character or book references
- Invalid character version or context state
- Database constraint violations
- Foreign key violations

## Usage Examples

### Logging a Decision
```javascript
await callTool('log_character_decision', {
  character_id: 42,
  book_id: 1,
  scene_id: 105,
  decision_description: "Sarah confronts her father",
  character_version: "V2",
  alternatives: [
    "Avoid confrontation",
    "Tell mother instead"
  ],
  aligned_with_goals: true,
  aligned_with_fears: false,
  aligned_with_wounds: true,
  operating_on_incomplete_info: true
});
```

### Validating a Decision
```javascript
await callTool('validate_character_decision', {
  decision_id: "550e8400-e29b-41d4-a716-446655440000"
});
```

### Getting Scene Decisions
```javascript
await callTool('get_character_decisions_in_scene', {
  scene_id: 105
});
```

## Related Servers

- **character-server**: Manage character profiles and traits
- **npe-causality-server**: Track causal chains and consequences
- **npe-scene-server**: Validate scene architecture

## Version

1.0.0

## License

Part of the MCP Writing Servers project.
