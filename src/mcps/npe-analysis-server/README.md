# NPE Analysis Server

The **NPE (Narrative Physics Engine) Analysis Server** provides tools for analyzing narrative pacing, tracking stakes escalation, validating information economy, monitoring relationship tension, and calculating overall NPE compliance scores.

## Overview

This server implements the Narrative Physics Engine compliance framework, helping authors ensure their stories follow NPE principles for character-driven causality, proper pacing, and emotional resonance.

## Tools

### Pacing Analysis

#### 1. `analyze_chapter_pacing`
Analyzes pacing metrics for a specific chapter.

**Input:**
- `chapter_id` (integer, required): Chapter ID to analyze

**Returns:**
- Scene count and average scene length
- Scene length variance (measure of pacing variety)
- Energy distribution (tension/release, quiet/loud, interior/exterior, conflict/connection)
- Monotonous pacing detection
- Recommendations for improving pacing

**Example:**
```json
{
  "chapter_id": 5
}
```

#### 2. `analyze_book_pacing`
Analyzes pacing across an entire book with aggregated metrics.

**Input:**
- `book_id` (integer, required): Book ID to analyze

**Returns:**
- Total chapters and scenes
- Average scenes per chapter
- Chapters with monotonous pacing
- Book-level recommendations

**Example:**
```json
{
  "book_id": 1
}
```

### Stakes & Pressure

#### 3. `track_stakes_escalation`
Tracks stakes escalation in a scene according to NPE Rule #9.

**Input:**
- `scene_id` (integer, required): Scene ID
- `pressure_level` (integer, required): Pressure level 0-100
- `reduces_options` (boolean): Does this reduce character options?
- `options_before` (integer): Number of options before
- `options_after` (integer): Number of options after
- `adds_cost` (boolean): Does this add cost/consequences?
- `cost_description` (string): Description of the cost
- `exposes_flaw` (boolean): Does this expose a character flaw?
- `flaw_exposed` (string): Description of the flaw
- `tests_loyalty` (boolean): Tests loyalty or belief?
- `loyalty_belief_tested` (string): What's being tested
- `pushes_toward_truth` (boolean): Pushes toward painful truth?
- `truth_approached` (string): Description of the truth

**Returns:**
- Stakes tracking record
- NPE compliance status
- Escalation justification

**Example:**
```json
{
  "scene_id": 42,
  "pressure_level": 75,
  "reduces_options": true,
  "options_before": 3,
  "options_after": 1,
  "adds_cost": true,
  "cost_description": "Protagonist must betray their mentor to save their sibling"
}
```

#### 4. `get_pressure_trajectory`
Gets pressure levels over time for a book to visualize escalation.

**Input:**
- `book_id` (integer, required): Book ID

**Returns:**
- Array of pressure points by chapter and scene
- Average, max, and min pressure
- NPE compliance statistics

**Example:**
```json
{
  "book_id": 1
}
```

### Information Economy

#### 5. `log_information_reveal`
Logs an information reveal according to NPE Rule #8 (only reveal when it alters a choice).

**Input:**
- `scene_id` (integer, required): Scene ID
- `information_content` (string, required): The information revealed
- `information_type` (enum): plot_crucial, character_backstory, world_building, relationship_dynamic
- `alters_character_choice` (boolean, required): Does this alter a choice?
- `character_affected_id` (integer): Character whose choice is affected
- `choice_altered` (string): Description of how choice is altered
- `reveal_method` (enum, required): dialogue, action, observation, internal_realization, flashback, external_event
- `optimal_timing` (boolean): Is this optimal timing?

**Returns:**
- Information reveal record
- NPE Rule #8 compliance status
- Violation warnings if applicable

**Example:**
```json
{
  "scene_id": 15,
  "information_content": "The mentor was actually working for the antagonist all along",
  "information_type": "plot_crucial",
  "alters_character_choice": true,
  "character_affected_id": 7,
  "choice_altered": "Protagonist can no longer trust the mentor's advice and must find a new path",
  "reveal_method": "observation"
}
```

#### 6. `validate_information_economy`
Validates that all information reveals in a book follow NPE Rule #8.

**Input:**
- `book_id` (integer, required): Book ID

**Returns:**
- Total reveals and compliance count
- NPE Rule #8 violations
- Premature reveals
- Reveals without character impact

**Example:**
```json
{
  "book_id": 1
}
```

### Relationship Tension

#### 7. `track_relationship_tension`
Tracks bidirectional tension between two characters in a scene.

**Input:**
- `character_a_id` (integer, required): First character ID
- `character_b_id` (integer, required): Second character ID
- `scene_id` (integer, required): Scene ID
- `a_to_b_tension` (integer, required): Tension from A to B (-100 to 100)
- `b_to_a_tension` (integer, required): Tension from B to A (-100 to 100)
- `connection_strength` (integer): Connection strength (0-100)
- `friction_strength` (integer): Friction strength (0-100)
- `trigger_event` (string): Event that triggered this tension change
- `caused_by_character_action` (boolean): Was this caused by character action?

**Returns:**
- Relationship tension record
- Bidirectional tension levels
- Connection and friction metrics

**Example:**
```json
{
  "character_a_id": 7,
  "character_b_id": 12,
  "scene_id": 28,
  "a_to_b_tension": 65,
  "b_to_a_tension": -20,
  "connection_strength": 45,
  "friction_strength": 80,
  "trigger_event": "Character A discovers Character B's secret",
  "caused_by_character_action": true
}
```

#### 8. `get_relationship_tension_graph`
Gets tension trajectory between two characters across a book.

**Input:**
- `character_a_id` (integer, required): First character ID
- `character_b_id` (integer, required): Second character ID
- `book_id` (integer, required): Book ID

**Returns:**
- Tension trajectory with all tracked points
- Average tension levels for both directions
- Trigger events

**Example:**
```json
{
  "character_a_id": 7,
  "character_b_id": 12,
  "book_id": 1
}
```

### Compliance Scoring

#### 9. `calculate_npe_compliance`
Calculates overall NPE compliance score for a book or chapter.

**Input:**
- `book_id` (integer, required): Book ID
- `chapter_id` (integer, optional): Chapter ID for chapter-specific analysis

**Returns:**
- Overall NPE score (0.0-1.0)
- Category scores: scene architecture, dialogue physics, POV physics, information economy
- Violation counts by severity
- Compliance status and recommendations

**Example:**
```json
{
  "book_id": 1
}
```

#### 10. `get_npe_violations`
Gets all NPE rule violations for a book with severity filtering.

**Input:**
- `book_id` (integer, required): Book ID
- `severity` (enum): critical, warning, minor, all (default: all)

**Returns:**
- Violations by severity
- Rule category and location
- Detailed violation messages

**Example:**
```json
{
  "book_id": 1,
  "severity": "critical"
}
```

## NPE Rules Reference

This server helps enforce the following NPE rules:

- **Rule #3 (Pacing):** Vary time treatment and energy modulation
- **Rule #4 (Scene Architecture):** Every scene needs intention, obstacle, pivot, consequence
- **Rule #5 (Dialogue Physics):** Dialogue must have subtext and avoid echolalia
- **Rule #6 (POV Physics):** POV character must have subjective bias
- **Rule #8 (Information Economy):** Only reveal information when it alters a choice
- **Rule #9 (Stakes & Pressure):** Stakes must escalate by reducing options, adding cost, exposing flaws, testing loyalty, or pushing toward painful truth

## Database Tables

This server interacts with the following NPE database tables:

- `npe_pacing_analysis` - Pacing metrics and analysis
- `npe_stakes_pressure` - Stakes escalation tracking
- `npe_information_economy` - Information reveal tracking
- `npe_relationship_tension` - Relationship tension dynamics
- `npe_compliance_summary` - Overall compliance scores
- `npe_scene_validation` - Scene-level NPE validation

## Usage

The server can be run in three modes:

1. **Standalone CLI:** `node src/mcps/npe-analysis-server/index.js`
2. **MCP stdio mode:** Set `MCP_STDIO_MODE=true`
3. **Imported module:** Import `NPEAnalysisMCPServer` class

## Dependencies

- Database with NPE tables (see migrations/024_update_npe_schema.sql)
- Base MCP server framework
- PostgreSQL database connection

## Author

Part of the MCP Writing Servers suite for narrative analysis and story development.
