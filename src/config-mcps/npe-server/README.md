# NPE (Narrative Physics Engine) Unified MCP Server

## Overview

The NPE Config MCP Server provides unified access to all Narrative Physics Engine functionality by orchestrating the four specialized NPE servers into a single interface. This server combines tools for causality tracking, character decision validation, scene architecture validation, and narrative compliance analysis.

## Purpose

This config server is designed for AI Writing Teams that need comprehensive narrative physics tracking and validation. Instead of connecting to four separate NPE servers, users can connect to this single unified server for all NPE operations.

## Architecture

The NPE Config Server orchestrates these four specialized NPE servers:

1. **NPE Causality Server** - Tracks cause-and-effect chains across the narrative
2. **NPE Character Server** - Validates character decisions against NPE principles
3. **NPE Scene Server** - Validates scene architecture and dialogue physics
4. **NPE Analysis Server** - Analyzes pacing, stakes, information economy, and compliance

All four servers share a single database connection for optimal performance.

## Tool Categories

### Causality Chain Management (4 tools)
- `create_causality_chain` - Create a new causality chain tracking cause-effect relationships
- `add_causal_link` - Add a causal link to an existing chain
- `validate_causality_chain` - Validate chain completeness and logical consistency
- `get_causality_chains_for_book` - Retrieve all causality chains for a book

### Character Decision Tracking (3 tools)
- `log_character_decision` - Log a character decision with NPE validation
- `validate_character_decision` - Validate a decision against character profile
- `get_character_decisions_in_scene` - Get all character decisions in a scene

### Scene Validation (3 tools)
- `validate_scene_architecture` - Validate scene structure against NPE rules
- `validate_dialogue_physics` - Validate dialogue exchanges for tension and stakes
- `get_scene_npe_compliance` - Get comprehensive NPE compliance report for a scene

### Narrative Analysis (10 tools)
- `analyze_chapter_pacing` - Analyze pacing for a specific chapter
- `analyze_book_pacing` - Analyze pacing across entire book
- `track_stakes_escalation` - Track how stakes escalate through the narrative
- `get_pressure_trajectory` - Get pressure/tension trajectory over time
- `log_information_reveal` - Log when key information is revealed
- `validate_information_economy` - Validate information reveal timing
- `track_relationship_tension` - Track tension in character relationships
- `get_relationship_tension_graph` - Get relationship tension over time
- `calculate_npe_compliance` - Calculate overall NPE compliance score
- `get_npe_violations` - Get list of NPE rule violations

## Total Tools: 20

## Benefits of Using the Config Server

1. **Single Connection** - Connect once instead of managing four separate server connections
2. **Shared Database** - All handlers use a single database connection for efficiency
3. **Unified Interface** - Access all NPE functionality through one consistent interface
4. **Tool Categorization** - Tool descriptions are prefixed with category for easy identification

## Usage

### Direct Execution (CLI Mode)
```bash
node src/config-mcps/npe-server/index.js
```

### MCP Stdio Mode
```bash
MCP_STDIO_MODE=true node src/config-mcps/npe-server/index.js
```

### As Module Import
```javascript
import { NPEConfigMCPServer } from './src/config-mcps/npe-server/index.js';
const server = new NPEConfigMCPServer();
await server.run();
```

## MCP Configuration

Add to your MCP settings file (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "npe-unified": {
      "command": "node",
      "args": [
        "/path/to/MCP-Writing-Servers/src/config-mcps/npe-server/index.js"
      ],
      "env": {
        "MCP_STDIO_MODE": "true"
      }
    }
  }
}
```

## NPE Principles

The Narrative Physics Engine enforces these core principles:

1. **Causality** - Every major event must have clear causes and consequences
2. **Character Agency** - Characters make decisions based on their goals, fears, and wounds
3. **Information Economy** - Information is revealed strategically to maintain tension
4. **Stakes Escalation** - Stakes must escalate throughout the narrative
5. **Scene Architecture** - Scenes must have clear structure with tension and turning points
6. **Dialogue Physics** - Dialogue must create tension and reveal character
7. **Relationship Dynamics** - Relationships evolve based on character interactions

## Database Tables

The NPE servers use these database tables:

- `npe_causality_chains` - Causality chain tracking
- `npe_causality_links` - Individual causal links
- `npe_character_decisions` - Character decision logs
- `npe_scene_validations` - Scene validation results
- `npe_pacing_analysis` - Pacing analysis data
- `npe_stakes_tracking` - Stakes escalation tracking
- `npe_information_reveals` - Information reveal tracking
- `npe_relationship_tension` - Relationship tension tracking
- `npe_compliance_scores` - Overall compliance scoring

## Related Servers

For specialized NPE needs, you can also use the individual servers:

- `/src/mcps/npe-causality-server` - Causality tracking only
- `/src/mcps/npe-character-server` - Character decisions only
- `/src/mcps/npe-scene-server` - Scene validation only
- `/src/mcps/npe-analysis-server` - Analysis tools only

## Support

For issues or questions about the NPE Config Server, consult the individual server documentation or refer to the NPE specification in the database schema.
