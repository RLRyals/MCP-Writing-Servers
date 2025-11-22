# NPE Scene Validation MCP Server

## Overview

The NPE Scene Validation MCP Server provides tools for validating narrative scenes against NPE (Narrative Physics Engine) rules. It helps writers ensure their scenes follow proper narrative structure and dialogue principles.

## Server Details

- **Server Name**: `npe-scene-validation`
- **Version**: 1.0.0
- **Location**: `/home/user/MCP-Writing-Servers/src/mcps/npe-scene-server/`

## Tools

### 1. validate_scene_architecture

Validates a scene against NPE Rule #4 (Scene Architecture).

**Purpose**: Ensures scenes have the four key elements:
- Character Intention
- Obstacle
- Pivot (power, information, or emotional_truth)
- Consequence

**Input Parameters**:
```javascript
{
  scene_id: integer,              // Required: Scene ID to validate
  has_intention: boolean,         // Required: Does scene have character intention?
  intention_description: string,  // Optional: Description of intention
  has_obstacle: boolean,          // Required: Does scene have obstacle?
  obstacle_description: string,   // Optional: Description of obstacle
  has_pivot: boolean,             // Required: Does scene have pivot?
  pivot_type: string,            // Optional: "power", "information", or "emotional_truth"
  has_consequence: boolean,       // Required: Does scene have consequence?
  consequence_description: string // Optional: Description of consequence
}
```

**Output**:
```javascript
{
  validation_id: string,           // UUID of validation record
  scene_id: integer,
  compliant: boolean,              // True if all 4 elements present
  missing_elements: string[],      // Array of missing elements
  should_be_summarized: boolean,   // True if 2+ elements missing
  details: {
    has_intention: boolean,
    has_obstacle: boolean,
    has_pivot: boolean,
    has_consequence: boolean,
    pivot_type: string             // If provided
  }
}
```

**NPE Logic**:
- Scene is compliant if all 4 elements are present
- Scene should be summarized if 2 or more elements are missing

### 2. validate_dialogue_physics

Validates dialogue against NPE Rule #5 (Dialogue Physics).

**Purpose**: Detects echolalia (characters echoing each other) and analyzes subtext presence.

**Input Parameters**:
```javascript
{
  scene_id: integer,              // Required: Scene ID to validate
  dialogue_lines: [               // Required: Array of dialogue lines
    {
      character_id: integer,      // Character speaking
      line: string                // Dialogue text
    }
  ]
}
```

**Output**:
```javascript
{
  scene_id: integer,
  compliant: boolean,              // True if no echolalia violations
  echolalia_violations: [          // Array of violations found
    {
      line_index_1: integer,
      line_index_2: integer,
      character_id_1: integer,
      character_id_2: integer,
      violation_type: string,      // "exact_repetition" or "high_similarity"
      similarity_ratio: float      // For high_similarity violations
    }
  ],
  subtext_present: boolean,        // True if >30% of lines have subtext indicators
  dialogue_line_count: integer,
  subtext_indicator_count: integer
}
```

**Echolalia Detection**:
- **Exact Repetition**: Two dialogue lines that are identical (ignoring punctuation/case)
- **High Similarity**: Lines that share >80% of words (minimum 4 words)

**Subtext Indicators**:
- Ellipsis (...)
- Em dashes (—)
- Short responses (<30 characters)
- Questions

### 3. get_scene_npe_compliance

Retrieves the complete NPE compliance report for a scene.

**Purpose**: Gets full validation record including all NPE checks performed.

**Input Parameters**:
```javascript
{
  scene_id: integer  // Required: Scene ID
}
```

**Output**:
Returns the full `npe_scene_validation` record with:
- Scene architecture validation
- Dialogue physics validation
- Pacing analysis (if available)
- POV physics (if available)
- Overall compliance status

## Database Schema

The server writes to the `npe_scene_validation` table:

```sql
CREATE TABLE npe_scene_validation (
    id TEXT PRIMARY KEY,                    -- UUID
    scene_id INTEGER NOT NULL UNIQUE,       -- References chapter_scenes(id)
    book_id INTEGER NOT NULL,               -- References books(id)
    chapter_id INTEGER NOT NULL,            -- References chapters(id)

    -- Scene Architecture (NPE Rule #4)
    has_character_intention BOOLEAN,
    intention_description TEXT,
    has_obstacle BOOLEAN,
    obstacle_description TEXT,
    has_pivot BOOLEAN,
    pivot_type TEXT,                        -- 'power', 'information', 'emotional_truth'
    pivot_description TEXT,
    has_consequence BOOLEAN,
    consequence_description TEXT,
    consequence_alters_next_scene BOOLEAN,
    should_be_summarized BOOLEAN,

    -- Dialogue Physics (NPE Rule #5)
    has_dialogue BOOLEAN,
    dialogue_has_subtext BOOLEAN,
    avoids_echolalia BOOLEAN,
    characters_talk_at_cross_purposes BOOLEAN,
    dialogue_is_strategy BOOLEAN,
    dialogue_violations TEXT,               -- JSON array

    -- Compliance
    npe_compliance_score DECIMAL(3,2),
    violations TEXT,                        -- JSON array
    recommendations TEXT,                   -- JSON array

    validated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Usage Examples

### Example 1: Validate Scene Architecture

```javascript
// Check if scene has proper NPE structure
await call_tool('validate_scene_architecture', {
  scene_id: 42,
  has_intention: true,
  intention_description: "Sarah wants to convince her boss to approve the project",
  has_obstacle: true,
  obstacle_description: "Boss is skeptical due to budget constraints",
  has_pivot: true,
  pivot_type: "information",
  has_consequence: true,
  consequence_description: "Sarah gets conditional approval, must present again in 2 weeks"
});

// Result: compliant = true, should_be_summarized = false
```

### Example 2: Validate Dialogue Physics

```javascript
// Check dialogue for echolalia and subtext
await call_tool('validate_dialogue_physics', {
  scene_id: 42,
  dialogue_lines: [
    { character_id: 1, line: "We need to talk about last night." },
    { character_id: 2, line: "I don't think there's anything to talk about." },
    { character_id: 1, line: "Really? Nothing?" },
    { character_id: 2, line: "Nothing that matters now." }
  ]
});

// Result: compliant = true (no echolalia), subtext_present = true
```

### Example 3: Get Full Compliance Report

```javascript
// Get complete NPE validation report
await call_tool('get_scene_npe_compliance', {
  scene_id: 42
});

// Returns full validation record with all checks
```

## Implementation Details

### ID Generation

The server uses Node.js `crypto.randomUUID()` to generate TEXT primary keys for the `npe_scene_validation` table.

### Error Handling

- Validates scene existence before processing
- Validates pivot_type against allowed values
- Returns user-friendly error messages
- Creates or updates validation records (upsert pattern)

### Database Updates

- **First validation**: Creates new record with generated UUID
- **Subsequent validations**: Updates existing record for the scene
- Uses `validated_at` timestamp to track last validation time

## File Structure

```
npe-scene-server/
├── index.js                           # Main server file
├── handlers/
│   └── npe-scene-handlers.js         # Tool implementations
├── schemas/
│   └── npe-scene-tools-schema.js     # Tool definitions
└── README.md                          # This file
```

## Integration

The server is registered in `/home/user/MCP-Writing-Servers/src/mcps/index.js`:

```javascript
export { NPESceneMCPServer } from './npe-scene-server/index.js';
```

## Testing

To test the server:

```bash
# Run the server in CLI mode
node src/mcps/npe-scene-server/index.js

# Or use the CLI runner
npm run start:npe-scene
```

## NPE Rules Reference

This server implements validation for:

- **NPE Rule #3**: Pacing & Temporal Mechanics
- **NPE Rule #4**: Scene Architecture (Intention → Obstacle → Pivot → Consequence)
- **NPE Rule #5**: Dialogue Physics (No echolalia, characters talk at cross-purposes)
- **NPE Rule #6**: POV Physics (Subjective bias, selective perception)
- **NPE Rule #8**: Information Economy (Only reveal when it alters choice)

## Future Enhancements

Potential additions:
- Automated scene content analysis from text
- Integration with NLP for better subtext detection
- Pacing validation (scene length vs time treatment)
- POV bias detection
- Information economy tracking
- Batch validation for multiple scenes
- Compliance scoring algorithms
