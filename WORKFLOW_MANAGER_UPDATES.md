# Workflow Manager MCP - Migration 028 Updates

**Date:** 2025-12-13
**Migration:** 028_workflow_definitions.sql
**MCP Server:** workflow-manager-server (v3.0.0)

---

## Summary

Extended the Workflow Manager MCP to support **generic workflow definitions** (not just the hardcoded 12-phase novel writing pipeline). This enables:

1. **Import workflows** from marketplace/folders
2. **List and select workflows** in UI
3. **Version control** for workflows
4. **Sub-workflow support** (nested workflows)
5. **Import tracking** (where workflows came from)
6. **Claude Code integration** tracking

---

## Database Changes (Migration 028)

### New Tables

#### 1. `workflow_definitions`
Stores reusable workflow templates/blueprints.

**Key columns:**
- `id` (TEXT) - Workflow ID (e.g., "12-phase-novel-pipeline")
- `name` (TEXT) - Display name
- `version` (TEXT) - Semantic version (e.g., "1.0.0")
- `graph_json` (JSONB) - WorkflowGraph for React Flow visualization
- `dependencies_json` (JSONB) - Required agents, skills, mcpServers, subWorkflows
- `phases_json` (JSONB) - Array of WorkflowPhase objects
- `is_system` (BOOLEAN) - System workflow vs. user-created
- `tags` (TEXT[]) - Tags for filtering/categorization
- `marketplace_metadata` (JSONB) - Marketplace display info

**Indexes:**
- GIN index on `tags` for fast tag filtering
- Index on `is_system` for filtering system vs. user workflows
- Index on `created_at` for sorting

#### 2. `workflow_versions`
Version history for workflow definitions (enables rollback and change tracking).

**Key columns:**
- `workflow_def_id` (TEXT) - References workflow_definitions.id
- `version` (TEXT) - Version number
- `definition_json` (JSONB) - Complete workflow definition snapshot
- `changelog` (TEXT) - What changed in this version
- `parent_version` (TEXT) - Previous version for history chain

#### 3. `workflow_version_locks`
Prevents editing workflows during execution.

**Key columns:**
- `workflow_def_id` (TEXT) - Workflow being locked
- `version` (TEXT) - Specific version locked
- `locked_by_instance_id` (INTEGER) - References workflow_instances(id)
- `locked_at` (TIMESTAMP) - When locked

#### 4. `sub_workflow_executions`
Tracks execution of nested sub-workflows (e.g., Series Architect 6-phase within Phase 3).

**Key columns:**
- `parent_instance_id` (INTEGER) - Parent workflow instance
- `parent_phase_number` (INTEGER) - Phase that triggered sub-workflow
- `sub_workflow_def_id` (TEXT) - Sub-workflow definition ID
- `sub_workflow_version` (TEXT) - Locked version
- `status` (TEXT) - 'pending', 'in_progress', 'complete', 'failed'
- `output_json` (JSONB) - Results from sub-workflow

#### 5. `workflow_imports`
Tracks when and how workflows were imported.

**Key columns:**
- `workflow_def_id` (TEXT) - Workflow that was imported
- `source_type` (TEXT) - 'marketplace', 'folder', 'file', 'url'
- `source_path` (TEXT) - Where it was imported from
- `installation_log` (JSONB) - What was installed (agents, skills, MCPs)

### Updated Tables

#### `workflow_instances`
**New columns:**
- `workflow_def_id` (TEXT) - Links to workflow_definitions.id
- `workflow_version` (TEXT) - Locked version being executed
- `total_phases` (INTEGER) - Number of phases (no longer hardcoded to 12)

**Foreign key:**
- `(workflow_def_id, workflow_version)` → `workflow_definitions(id, version)`

#### `workflow_phase_history`
**New columns:**
- `claude_code_session` (TEXT) - Claude Code session ID
- `skill_invoked` (TEXT) - Name of skill that was invoked
- `output_json` (JSONB) - Structured JSON output from phase execution

### Seeded Data

Migration 028 seeds the **12-Phase Novel Writing Pipeline** as a workflow definition:
- ID: `12-phase-novel-pipeline`
- Version: `1.0.0`
- All 13 phases (0-12) with complete metadata
- System workflow (`is_system = TRUE`)
- Tags: `['writing', 'novel', 'fiction', 'series']`

All existing `workflow_instances` are linked to this default workflow.

---

## MCP Server Changes

### New Tools (11 total)

#### Workflow Definition Management

**1. `import_workflow_definition`**
Imports a new workflow definition from marketplace or file.

**Input:**
```json
{
  "id": "series-architect-6-phase",
  "name": "Series Architect 6-Phase Planning",
  "version": "1.0.0",
  "description": "Deep planning workflow for series structure",
  "graph_json": { "nodes": [...], "edges": [...] },
  "dependencies_json": {
    "agents": ["series-architect-agent"],
    "skills": ["series-planning-skill"],
    "mcpServers": ["series-planning-server"]
  },
  "phases_json": [...],
  "tags": ["planning", "series"],
  "source_type": "marketplace",
  "source_path": "/workflows/series-architect-6-phase",
  "created_by": "FictionLab"
}
```

**Output:**
```json
{
  "workflow_def_id": "series-architect-6-phase",
  "version": "1.0.0",
  "created_at": "2025-12-13T10:00:00Z",
  "message": "Workflow definition Series Architect 6-Phase Planning v1.0.0 imported successfully"
}
```

**2. `get_workflow_definitions`**
Lists all available workflow definitions (for UI selection).

**Input:**
```json
{
  "tags": ["writing", "novel"],  // Optional filter
  "is_system": true              // Optional filter
}
```

**Output:**
```json
[
  {
    "id": "12-phase-novel-pipeline",
    "name": "12-Phase Novel Writing Pipeline",
    "version": "1.0.0",
    "description": "Complete workflow from concept to published 5-book series",
    "tags": ["writing", "novel", "fiction", "series"],
    "marketplace_metadata": {
      "author": "FictionLab",
      "category": "Novel Writing",
      "difficulty": "Intermediate"
    },
    "is_system": true,
    "created_at": "2025-12-13T09:00:00Z"
  }
]
```

**3. `get_workflow_definition`**
Gets a specific workflow definition by ID.

**Input:**
```json
{
  "workflow_def_id": "12-phase-novel-pipeline",
  "version": "1.0.0"  // Optional, defaults to latest
}
```

**Output:** Complete workflow definition with all fields.

#### Version Control

**4. `create_workflow_version`**
Creates a new version of a workflow definition.

**Input:**
```json
{
  "workflow_def_id": "12-phase-novel-pipeline",
  "version": "1.1.0",
  "definition_json": { ... },
  "changelog": "Added parallel execution support for Phase 9",
  "parent_version": "1.0.0",
  "created_by": "User"
}
```

**5. `get_workflow_versions`**
Gets version history for a workflow.

**Input:**
```json
{
  "workflow_def_id": "12-phase-novel-pipeline"
}
```

**Output:** Array of versions with changelog.

**6. `lock_workflow_version`**
Locks a workflow version during execution (prevents editing).

**Input:**
```json
{
  "workflow_def_id": "12-phase-novel-pipeline",
  "version": "1.0.0",
  "instance_id": 123
}
```

**7. `unlock_workflow_version`**
Unlocks a workflow version after execution completes.

#### Sub-Workflow Support

**8. `start_sub_workflow`**
Starts execution of a nested sub-workflow.

**Input:**
```json
{
  "parent_instance_id": 123,
  "parent_phase_number": 3,
  "sub_workflow_def_id": "series-architect-6-phase",
  "sub_workflow_version": "1.0.0"
}
```

**Output:**
```json
{
  "sub_workflow_execution_id": 456,
  "status": "in_progress",
  "started_at": "2025-12-13T10:30:00Z",
  "message": "Sub-workflow series-architect-6-phase v1.0.0 started"
}
```

**9. `complete_sub_workflow`**
Marks a sub-workflow execution as complete.

**10. `get_sub_workflow_status`**
Gets status of a sub-workflow execution.

#### Claude Code Integration

**11. `update_phase_execution`**
Updates phase execution with Claude Code session and skill invoked.

**Input:**
```json
{
  "workflow_id": 123,
  "phase_number": 0,
  "claude_code_session": "session-abc-123",
  "skill_invoked": "series-planning-skill",
  "output_json": {
    "series_id": 1,
    "books_planned": 5
  }
}
```

---

## Usage Examples

### Import a Workflow from Marketplace

```javascript
// Electron app imports a workflow
const result = await mcpClient.callTool('workflow-manager', 'import_workflow_definition', {
  id: 'romance-trope-pipeline',
  name: 'Romance Trope-Based Pipeline',
  version: '1.0.0',
  graph_json: workflowGraph,
  dependencies_json: {
    agents: ['romance-expert-agent'],
    skills: ['romance-plotting-skill'],
    mcpServers: ['character-planning-server']
  },
  phases_json: phases,
  tags: ['romance', 'trope-based'],
  source_type: 'marketplace',
  source_path: '/marketplace/workflows/romance-trope-pipeline'
});
```

### List Workflows for UI Selection

```javascript
// Electron app gets all workflows for dropdown
const workflows = await mcpClient.callTool('workflow-manager', 'get_workflow_definitions', {});

// Display in UI:
// - 12-Phase Novel Writing Pipeline (System)
// - Romance Trope-Based Pipeline (User)
// - Series Architect 6-Phase Planning (User)
```

### Execute a Workflow with Sub-Workflow

```javascript
// Start main workflow
const instance = await mcpClient.callTool('workflow-manager', 'create_workflow', {
  series_id: 1,
  user_id: 1,
  concept: 'Epic fantasy series'
});

// When Phase 3 (Series Architect) starts, launch sub-workflow
const subWorkflow = await mcpClient.callTool('workflow-manager', 'start_sub_workflow', {
  parent_instance_id: instance.workflow_id,
  parent_phase_number: 3,
  sub_workflow_def_id: 'series-architect-6-phase',
  sub_workflow_version: '1.0.0'
});

// Track sub-workflow progress
const status = await mcpClient.callTool('workflow-manager', 'get_sub_workflow_status', {
  sub_workflow_execution_id: subWorkflow.sub_workflow_execution_id
});

// Complete sub-workflow
await mcpClient.callTool('workflow-manager', 'complete_sub_workflow', {
  sub_workflow_execution_id: subWorkflow.sub_workflow_execution_id,
  output_json: {
    series_structure: { ... },
    book_concepts: [ ... ]
  }
});
```

### Track Claude Code Execution

```javascript
// When Claude Code executes a phase
await mcpClient.callTool('workflow-manager', 'update_phase_execution', {
  workflow_id: instance.workflow_id,
  phase_number: 0,
  claude_code_session: claudeCodeSession.id,
  skill_invoked: 'series-planning-skill',
  output_json: {
    series_id: 1,
    books_planned: 5,
    estimated_words: 500000
  }
});
```

### Version Control

```javascript
// Edit workflow and create new version
await mcpClient.callTool('workflow-manager', 'create_workflow_version', {
  workflow_def_id: '12-phase-novel-pipeline',
  version: '1.1.0',
  definition_json: updatedWorkflowDef,
  changelog: 'Added automated continuity checking in Phase 11',
  parent_version: '1.0.0',
  created_by: 'User'
});

// Get version history
const versions = await mcpClient.callTool('workflow-manager', 'get_workflow_versions', {
  workflow_def_id: '12-phase-novel-pipeline'
});
// Returns: [v1.1.0 (latest), v1.0.0]
```

---

## Integration with Electron App

### Workflow Import Flow

```
1. User clicks "Import Workflow" in UI
   ↓
2. Electron app reads workflow folder structure:
   /workflows/romance-trope-pipeline/
   ├── workflow.yaml         # Workflow definition
   ├── agents/
   │   └── romance-expert.md
   ├── skills/
   │   └── romance-plotting-skill.md
   └── README.md
   ↓
3. Electron app parses workflow.yaml
   ↓
4. Electron app checks dependencies:
   - agents: romance-expert-agent (MISSING)
   - skills: romance-plotting-skill (MISSING)
   - mcpServers: character-planning-server (INSTALLED)
   ↓
5. Electron app installs missing components:
   - Copy agents/romance-expert.md to FictionLabUserData/agents/
   - Copy skills/romance-plotting-skill.md to ~/.claude/skills/
   ↓
6. Electron app calls import_workflow_definition
   ↓
7. Workflow appears in UI dropdown
```

### Workflow Execution Flow

```
1. User selects workflow from dropdown
   ↓
2. Electron app calls get_workflow_definition
   ↓
3. UI displays workflow graph (React Flow)
   ↓
4. User clicks "Start Workflow"
   ↓
5. Electron app calls create_workflow
   ↓
6. Electron app calls lock_workflow_version
   ↓
7. For each phase:
   - Execute phase with agent + skill
   - Call update_phase_execution with results
   - If phase is sub-workflow type:
     - Call start_sub_workflow
     - Execute sub-workflow phases
     - Call complete_sub_workflow
   ↓
8. Workflow completes
   ↓
9. Electron app calls unlock_workflow_version
```

---

## Files Changed

### Migration
- **C:\github\MCP-Writing-Servers\migrations\028_workflow_definitions.sql** (NEW)
  - 450+ lines
  - Creates 5 new tables
  - Updates 2 existing tables
  - Seeds default 12-phase workflow

### MCP Server
- **C:\github\MCP-Writing-Servers\src\mcps\workflow-manager-server\index.js** (UPDATED)
  - Added 11 new tool definitions (lines 460-610)
  - Added 11 new tool handlers (lines 644-654)
  - Added 11 new handler implementations (lines 1393-1728)
  - Total additions: ~400 lines

---

## Testing Checklist

### Database Migration
- [ ] Run migration 028 on PostgreSQL
- [ ] Verify all tables created
- [ ] Verify indexes created
- [ ] Verify 12-phase workflow seeded
- [ ] Verify existing workflow_instances linked to default workflow

### MCP Server
- [ ] Test import_workflow_definition
- [ ] Test get_workflow_definitions (with/without filters)
- [ ] Test get_workflow_definition
- [ ] Test create_workflow_version
- [ ] Test get_workflow_versions
- [ ] Test lock_workflow_version
- [ ] Test unlock_workflow_version
- [ ] Test start_sub_workflow
- [ ] Test complete_sub_workflow
- [ ] Test get_sub_workflow_status
- [ ] Test update_phase_execution

### Integration
- [ ] Import workflow from folder
- [ ] List workflows in UI
- [ ] Execute workflow with version lock
- [ ] Execute sub-workflow
- [ ] Track Claude Code session
- [ ] Create new workflow version
- [ ] Verify version locking prevents edits during execution

---

## Next Steps

### Electron App Implementation

**Priority 1: Import System** (Days 1-2)
- `src/main/import/folder-importer.ts` - Import workflow packages
- `src/main/parsers/workflow-parser.ts` - Already created
- `src/main/dependency-resolver.ts` - Check what's installed vs. missing

**Priority 2: Workflow Execution** (Days 3-5)
- `src/main/workflow/workflow-executor.ts` - Execute workflows
- `src/main/workflow/workflow-client.ts` - Communicate with MCP
- `src/main/claude-code/executor.ts` - Spawn Claude Code processes

**Priority 3: UI Components** (Days 6-8)
- `src/renderer/views/WorkflowsView.tsx` - Main workflow view
- `src/renderer/components/WorkflowCanvas.tsx` - React Flow visualization
- Custom node components for phase types

---

## Architecture Benefits

### Before (Hardcoded 12-Phase)
- ❌ Only supports 12-phase novel pipeline
- ❌ Cannot import new workflows
- ❌ No version control
- ❌ No sub-workflows
- ❌ No marketplace support

### After (Generic Workflows)
- ✅ Supports any number of phases
- ✅ Import workflows from folders
- ✅ Version control with changelog
- ✅ Nested sub-workflows
- ✅ Marketplace-ready metadata
- ✅ Track Claude Code execution
- ✅ Lock workflows during execution
- ✅ Track import sources

---

**MIGRATION 028 COMPLETE - READY FOR TESTING**
