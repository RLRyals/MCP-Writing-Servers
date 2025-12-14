# Workflow Manager MCP Server - Complete Design

**Version:** 3.1 (Phase 3 Complete - Production Metrics)
**Port:** 3012
**Purpose:** Orchestrates the 12-phase novel writing pipeline
**Status:** Design Complete - Ready for Implementation

---

## Documentation Structure

This complete design has been split into repo-specific documents:

1. **[Overview](./WORKFLOW_MANAGER_OVERVIEW.md)** - System overview and architecture (start here)
2. **[BQ-Studio Integration](./WORKFLOW_MANAGER_BQ_STUDIO.md)** - Claude Code slash commands and skills
3. **[MCP Server Implementation](./WORKFLOW_MANAGER_MCP_SERVERS.md)** - Database, tools, and server code
4. **[FictionLab Dashboard](./WORKFLOW_MANAGER_ELECTRON_APP.md)** - React UI components and analytics

**This document** contains the complete technical specification for reference.

---

## Overview

The **Workflow Manager MCP** is a new MCP server that orchestrates the entire 12-phase novel writing process outlined in the System Architecture Map. It provides:

- **Centralized workflow state management** - Single source of truth for workflow progress
- **Phase transition enforcement** - Validates prerequisites before advancing
- **Quality gate coordination** - Manages NPE and commercial validation gates
- **User approval checkpoints** - Coordinates approval requests across clients
- **Multi-client support** - TypingMind, Claude Code, and FictionLab UI all use the same workflow
- **Real-time updates** - WebSocket support for live workflow state changes

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FictionLab Infrastructure                 │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │TypingMind  │  │Claude Code │  │FictionLab  │            │
│  │  Client    │  │   Client   │  │  UI Client │            │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘            │
│         │                │                │                  │
│         └────────────────┼────────────────┘                  │
│                          │                                   │
│                          ▼                                   │
│         ┌────────────────────────────────────┐              │
│         │  Workflow Manager MCP (Port 3012)  │              │
│         │                                    │              │
│         │  • create_workflow()               │              │
│         │  • execute_phase()                 │              │
│         │  • request_approval()              │              │
│         │  • record_quality_gate()           │              │
│         │  • get_workflow_state()            │              │
│         └────────────┬───────────────────────┘              │
│                      │                                       │
│         ┌────────────┼────────────────────────┐             │
│         │            │                        │             │
│         ▼            ▼                        ▼             │
│  ┌──────────┐ ┌──────────┐           ┌──────────┐          │
│  │ Series   │ │Character │    ...    │   NPE    │          │
│  │ Planning │ │ Planning │           │  Server  │          │
│  │  Server  │ │  Server  │           │  Server  │          │
│  │ (3002)   │ │ (3005)   │           │  (3011)  │          │
│  └────┬─────┘ └────┬─────┘           └────┬─────┘          │
│       │            │                      │                 │
│       └────────────┼──────────────────────┘                 │
│                    │                                        │
│                    ▼                                        │
│         ┌──────────────────────┐                           │
│         │  PostgreSQL Database │                           │
│         │  (via PgBouncer)     │                           │
│         └──────────────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### workflow_instances

Tracks the current state of each workflow.

```sql
CREATE TABLE workflow_instances (
  id SERIAL PRIMARY KEY,
  series_id integer REFERENCES series(id),
  author_id integer references authors(id), 
  current_phase INTEGER NOT NULL DEFAULT -1, -- -1 to 12
  phase_status TEXT NOT NULL DEFAULT 'in_progress', 
    -- 'in_progress', 'waiting_approval', 'waiting_quality_gate', 'completed', 'failed'
  current_book INTEGER DEFAULT 1, -- 1-5
  current_chapter INTEGER DEFAULT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP DEFAULT NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_workflow_author ON workflow_instances(author_id);
CREATE INDEX idx_workflow_series ON workflow_instances(series_id);
CREATE INDEX idx_workflow_status ON workflow_instances(phase_status);
```

### workflow_phase_history

Audit trail of all phase executions.

```sql
CREATE TABLE workflow_phase_history (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER REFERENCES workflow_instances(id) ON DELETE CASCADE,
  phase_number INTEGER NOT NULL,
  phase_name TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  status TEXT NOT NULL, -- 'started', 'completed', 'failed', 'skipped'
  agent TEXT, -- Which agent executed this phase
  output_summary TEXT,
  validation_score DECIMAL(5,2), -- For gate phases
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_phase_history_workflow ON workflow_phase_history(workflow_id);
CREATE INDEX idx_phase_history_phase ON workflow_phase_history(phase_number);
```

### workflow_approvals

User approval checkpoints.

```sql
CREATE TABLE workflow_approvals (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER REFERENCES workflow_instances(id) ON DELETE CASCADE,
  phase_number INTEGER NOT NULL,
  approval_type TEXT NOT NULL, 
    -- 'series_plan', 'book_completion', 'chapter_plan'
  requested_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  approved_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending', 
    -- 'pending', 'approved', 'rejected', 'revision_requested'
  feedback TEXT,
  artifacts JSONB DEFAULT '[]'::jsonb, -- Links to documents to review
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_approvals_workflow ON workflow_approvals(workflow_id);
CREATE INDEX idx_approvals_status ON workflow_approvals(status);
```

### workflow_quality_gates

Quality gate results (NPE, Commercial).

```sql
CREATE TABLE workflow_quality_gates (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER REFERENCES workflow_instances(id) ON DELETE CASCADE,
  phase_number INTEGER NOT NULL,
  gate_type TEXT NOT NULL, -- 'npe_series', 'npe_scene', 'commercial'
  score DECIMAL(5,2) NOT NULL,
  passed BOOLEAN NOT NULL,
  violations JSONB DEFAULT '[]'::jsonb, -- Array of violation objects
  executed_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_gates_workflow ON workflow_quality_gates(workflow_id);
CREATE INDEX idx_gates_type ON workflow_quality_gates(gate_type);
```

### production_metrics

Tracks production metrics throughout the workflow lifecycle.

```sql
CREATE TABLE production_metrics (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER REFERENCES workflow_instances(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,
    -- 'words_written', 'chapters_completed', 'scenes_validated',
    -- 'planning_time_minutes', 'writing_time_minutes', 'revision_time_minutes',
    -- 'npe_score', 'commercial_score', 'agent_invocations'
  metric_value DECIMAL(10,2) NOT NULL,
  phase_number INTEGER,
  book_number INTEGER,
  chapter_number INTEGER,
  recorded_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_metrics_workflow ON production_metrics(workflow_id);
CREATE INDEX idx_metrics_type ON production_metrics(metric_type);
CREATE INDEX idx_metrics_phase ON production_metrics(phase_number);
CREATE INDEX idx_metrics_recorded ON production_metrics(recorded_at);
```

### daily_writing_stats

Aggregated daily statistics for user dashboards.

```sql
CREATE TABLE daily_writing_stats (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER REFERENCES workflow_instances(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES authors(id),
  stat_date DATE NOT NULL,
  words_written INTEGER DEFAULT 0,
  chapters_completed INTEGER DEFAULT 0,
  scenes_written INTEGER DEFAULT 0,
  writing_time_minutes INTEGER DEFAULT 0,
  phases_completed INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(workflow_id, stat_date)
);

CREATE INDEX idx_daily_stats_workflow ON daily_writing_stats(workflow_id);
CREATE INDEX idx_daily_stats_author ON daily_writing_stats(author_id);
CREATE INDEX idx_daily_stats_date ON daily_writing_stats(stat_date);
```

### phase_performance

Analytics for phase execution performance.

```sql
CREATE TABLE phase_performance (
  id SERIAL PRIMARY KEY,
  phase_number INTEGER NOT NULL,
  phase_name TEXT NOT NULL,
  total_executions INTEGER DEFAULT 0,
  successful_executions INTEGER DEFAULT 0,
  failed_executions INTEGER DEFAULT 0,
  avg_duration_minutes DECIMAL(10,2),
  avg_quality_score DECIMAL(5,2),
  last_execution TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(phase_number)
);

CREATE INDEX idx_phase_perf_number ON phase_performance(phase_number);
```

---

## MCP Tools

### Workflow Lifecycle

#### `create_workflow`

Creates a new workflow instance for a series.

```typescript
create_workflow(
  series_id: string,
  user_id: string,
  concept: string
) -> {
  workflow_id: string,
  current_phase: number,
  phase_status: string
}
```

**Example:**
```typescript
const workflow = await mcp.call('workflow-manager', 'create_workflow', {
  series_id: 'uuid-123',
  user_id: 'user-456',
  concept: 'Willy Wonka but serial killer'
});
// Returns: { workflow_id: 'workflow-789', current_phase: -1, phase_status: 'in_progress' }
```

#### `get_workflow_state`

Retrieves the current state of a workflow.

```typescript
get_workflow_state(
  workflow_id: string
) -> {
  workflow_id: string,
  series_id: string,
  current_phase: number,
  phase_name: string,
  phase_status: string,
  current_book: number,
  current_chapter: number | null,
  created_at: string,
  updated_at: string
}
```

#### `advance_to_phase`

Advances the workflow to a specific phase (validates prerequisites).

```typescript
advance_to_phase(
  workflow_id: string,
  target_phase: number
) -> {
  success: boolean,
  current_phase: number,
  phase_status: string,
  message: string
}
```

#### `complete_current_phase`

Marks the current phase as completed and advances to the next.

```typescript
complete_current_phase(
  workflow_id: string,
  output: {
    summary: string,
    artifacts?: string[],
    metadata?: object
  }
) -> {
  completed_phase: number,
  next_phase: number,
  phase_status: string
}
```

---

### Phase Execution

#### `execute_phase`

Executes a specific phase with input data.

```typescript
execute_phase(
  workflow_id: string,
  phase_number: number,
  input: object
) -> {
  phase_number: number,
  status: string, // 'completed', 'waiting_approval', 'waiting_quality_gate', 'failed'
  output: object,
  next_action?: string
}
```

**Example - Phase 0 (Premise Development):**
```typescript
const result = await mcp.call('workflow-manager', 'execute_phase', {
  workflow_id: 'workflow-789',
  phase_number: 0,
  input: {
    concept: 'Willy Wonka but serial killer',
    target_genre: 'Dark Horror'
  }
});
// Returns: { phase_number: 0, status: 'completed', output: { refined_concept: '...' } }
```

#### `retry_failed_phase`

Retries a phase that previously failed.

```typescript
retry_failed_phase(
  workflow_id: string,
  phase_number: number
) -> PhaseResult
```

#### `skip_phase`

Skips a phase (admin only, for testing).

```typescript
skip_phase(
  workflow_id: string,
  phase_number: number,
  reason: string
) -> PhaseSkip
```

---

### Quality Gates

#### `record_quality_gate`

Records the result of a quality gate validation.

```typescript
record_quality_gate(
  workflow_id: string,
  gate_type: 'npe_series' | 'npe_scene' | 'commercial',
  score: number,
  passed: boolean,
  violations: Array<{
    category: string,
    severity: string,
    message: string,
    suggestion: string
  }>
) -> {
  gate_id: string,
  passed: boolean,
  next_action: string // 'proceed' or 'return_to_phase_X'
}
```

**Example - NPE Series Validation (Phase 4):**
```typescript
const gate = await mcp.call('workflow-manager', 'record_quality_gate', {
  workflow_id: 'workflow-789',
  gate_type: 'npe_series',
  score: 87,
  passed: true,
  violations: []
});
// Returns: { gate_id: 'gate-123', passed: true, next_action: 'proceed' }
```

#### `check_gate_status`

Checks if a quality gate has been passed.

```typescript
check_gate_status(
  workflow_id: string,
  phase_number: number
) -> {
  has_gate: boolean,
  passed: boolean | null,
  score: number | null,
  violations: array
}
```

---

### User Approvals

#### `request_approval`

Requests user approval for a phase.

```typescript
request_approval(
  workflow_id: string,
  approval_type: 'series_plan' | 'book_completion' | 'chapter_plan',
  artifacts: string[] // Paths to documents to review
) -> {
  approval_id: string,
  status: 'pending',
  requested_at: string
}
```

**Example - Series Plan Approval (Phase 7):**
```typescript
const approval = await mcp.call('workflow-manager', 'request_approval', {
  workflow_id: 'workflow-789',
  approval_type: 'series_plan',
  artifacts: [
    '/series/uuid-123/architecture.md',
    '/series/uuid-123/npe-validation-report.md',
    '/series/uuid-123/commercial-assessment.md'
  ]
});
// Returns: { approval_id: 'approval-456', status: 'pending', requested_at: '2024-12-02T...' }
```

#### `submit_approval`

Submits an approval decision.

```typescript
submit_approval(
  approval_id: string,
  decision: 'approved' | 'rejected' | 'revision_requested',
  feedback?: string
) -> {
  approval_id: string,
  status: string,
  approved_at: string,
  next_action: string
}
```

**Example - User Approves:**
```typescript
const result = await mcp.call('workflow-manager', 'submit_approval', {
  approval_id: 'approval-456',
  decision: 'approved',
  feedback: 'Looks great! Proceed to writing.'
});
// Returns: { approval_id: 'approval-456', status: 'approved', next_action: 'advance_to_phase_8' }
```

#### `get_pending_approvals`

Gets all pending approvals for a workflow.

```typescript
get_pending_approvals(
  workflow_id: string
) -> Array<{
  approval_id: string,
  approval_type: string,
  requested_at: string,
  artifacts: string[]
}>
```

---

### Book Production Loop (Phase 12)

#### `start_book_iteration`

Starts a new book iteration in the production loop.

```typescript
start_book_iteration(
  workflow_id: string,
  book_number: number // 2-5
) -> {
  book_number: number,
  iteration_started: string,
  current_phase: number // Returns to Phase 9 (Chapter Planning)
}
```

#### `complete_book_iteration`

Completes a book iteration and requests approval.

```typescript
complete_book_iteration(
  workflow_id: string,
  book_number: number
) -> {
  book_number: number,
  completed_at: string,
  approval_id: string, // Auto-creates approval request
  next_book: number | null // null if all 5 books complete
}
```

#### `get_series_progress`

Gets the overall progress of the series.

```typescript
get_series_progress(
  workflow_id: string
) -> {
  total_books: number,
  books_completed: number,
  current_book: number,
  current_phase: number,
  percent_complete: number
}
```

---

### Production Metrics

#### `record_production_metric`

Records a production metric for a workflow.

```typescript
record_production_metric(
  workflow_id: string,
  metric_type: string,
  metric_value: number,
  context?: {
    phase_number?: number,
    book_number?: number,
    chapter_number?: number,
    metadata?: object
  }
) -> {
  metric_id: string,
  recorded_at: string
}
```

**Example - Recording words written:**
```typescript
const metric = await mcp.call('workflow-manager', 'record_production_metric', {
  workflow_id: 'workflow-789',
  metric_type: 'words_written',
  metric_value: 2847,
  context: {
    phase_number: 11,
    book_number: 1,
    chapter_number: 3
  }
});
// Returns: { metric_id: 'metric-123', recorded_at: '2024-12-02T15:30:00Z' }
```

**Example - Recording planning time:**
```typescript
const metric = await mcp.call('workflow-manager', 'record_production_metric', {
  workflow_id: 'workflow-789',
  metric_type: 'planning_time_minutes',
  metric_value: 45,
  context: {
    phase_number: 9,
    book_number: 2,
    metadata: { agent: 'chapter-planner', chapters_planned: 25 }
  }
});
```

**Common Metric Types:**
- `words_written` - Words produced during writing phases
- `chapters_completed` - Chapters finished
- `scenes_validated` - Scenes passed NPE validation
- `planning_time_minutes` - Time spent in planning phases
- `writing_time_minutes` - Time spent in writing phases
- `revision_time_minutes` - Time spent in revision passes
- `npe_score` - NPE validation score
- `commercial_score` - Commercial validation score
- `agent_invocations` - Number of agent calls

#### `get_workflow_metrics`

Retrieves aggregated metrics for a workflow.

```typescript
get_workflow_metrics(
  workflow_id: string,
  metric_types?: string[], // Filter by specific metrics
  date_range?: {
    start: string,
    end: string
  }
) -> {
  workflow_id: string,
  metrics: {
    total_words_written: number,
    total_chapters_completed: number,
    total_scenes_validated: number,
    total_writing_time_minutes: number,
    avg_npe_score: number,
    avg_commercial_score: number,
    books_completed: number,
    current_velocity: number // words per hour
  },
  by_book: Array<{
    book_number: number,
    words_written: number,
    chapters_completed: number,
    writing_time_minutes: number
  }>,
  by_phase: Array<{
    phase_number: number,
    phase_name: string,
    duration_minutes: number,
    quality_score: number | null
  }>
}
```

**Example:**
```typescript
const metrics = await mcp.call('workflow-manager', 'get_workflow_metrics', {
  workflow_id: 'workflow-789'
});
// Returns comprehensive metrics for the entire workflow
console.log(`Total words written: ${metrics.metrics.total_words_written}`);
console.log(`Average velocity: ${metrics.metrics.current_velocity} words/hour`);
```

#### `get_phase_analytics`

Gets performance analytics for specific phases across all workflows.

```typescript
get_phase_analytics(
  phase_number?: number // Omit for all phases
) -> Array<{
  phase_number: number,
  phase_name: string,
  total_executions: number,
  successful_executions: number,
  failed_executions: number,
  success_rate: number, // percentage
  avg_duration_minutes: number,
  avg_quality_score: number | null,
  last_execution: string
}>
```

**Example:**
```typescript
// Get analytics for all phases
const analytics = await mcp.call('workflow-manager', 'get_phase_analytics', {});

// Find bottleneck phases
const slowPhases = analytics
  .filter(p => p.avg_duration_minutes > 60)
  .sort((a, b) => b.avg_duration_minutes - a.avg_duration_minutes);

console.log('Slowest phases:', slowPhases.map(p =>
  `Phase ${p.phase_number}: ${p.avg_duration_minutes} min`
));
```

#### `get_daily_writing_stats`

Gets daily writing statistics for a workflow or author.

```typescript
get_daily_writing_stats(
  workflow_id?: string,
  author_id?: string,
  date_range?: {
    start: string, // 'YYYY-MM-DD'
    end: string
  }
) -> Array<{
  stat_date: string,
  words_written: number,
  chapters_completed: number,
  scenes_written: number,
  writing_time_minutes: number,
  phases_completed: number,
  avg_words_per_hour: number
}>
```

**Example - Last 7 days:**
```typescript
const stats = await mcp.call('workflow-manager', 'get_daily_writing_stats', {
  workflow_id: 'workflow-789',
  date_range: {
    start: '2024-11-25',
    end: '2024-12-02'
  }
});

// Chart daily productivity
stats.forEach(day => {
  console.log(`${day.stat_date}: ${day.words_written} words, ${day.chapters_completed} chapters`);
});
```

#### `get_workflow_velocity`

Calculates writing velocity and productivity metrics.

```typescript
get_workflow_velocity(
  workflow_id: string,
  time_window?: 'day' | 'week' | 'all' // Default: 'all'
) -> {
  workflow_id: string,
  time_window: string,
  velocity: {
    words_per_hour: number,
    words_per_day: number,
    chapters_per_day: number,
    scenes_per_hour: number
  },
  efficiency: {
    planning_to_writing_ratio: number, // planning time / writing time
    revision_rate: number, // revision passes per chapter
    npe_pass_rate: number // percentage of scenes passing on first try
  },
  projections: {
    estimated_completion_date: string,
    estimated_total_words: number,
    books_remaining: number,
    hours_remaining: number
  }
}
```

**Example:**
```typescript
const velocity = await mcp.call('workflow-manager', 'get_workflow_velocity', {
  workflow_id: 'workflow-789',
  time_window: 'week'
});

console.log(`Current velocity: ${velocity.velocity.words_per_hour} words/hour`);
console.log(`Estimated completion: ${velocity.projections.estimated_completion_date}`);
console.log(`Books remaining: ${velocity.projections.books_remaining}`);
```

#### `update_daily_stats`

Internal tool to update daily writing statistics (auto-called by record_production_metric).

```typescript
update_daily_stats(
  workflow_id: string,
  date: string, // 'YYYY-MM-DD'
  updates: {
    words_written?: number,
    chapters_completed?: number,
    scenes_written?: number,
    writing_time_minutes?: number,
    phases_completed?: number
  }
) -> {
  updated: boolean,
  stat_date: string
}
```

---

### Workflow Queries

#### `get_phase_history`

Gets the complete history of phase executions.

```typescript
get_phase_history(
  workflow_id: string
) -> Array<{
  phase_number: number,
  phase_name: string,
  started_at: string,
  completed_at: string | null,
  status: string,
  agent: string,
  validation_score: number | null
}>
```

#### `get_workflow_timeline`

Gets a timeline view of the workflow.

```typescript
get_workflow_timeline(
  workflow_id: string
) -> {
  created_at: string,
  phases: Array<{
    phase_number: number,
    phase_name: string,
    duration_minutes: number,
    status: string
  }>,
  total_duration_hours: number
}
```

#### `list_active_workflows`

Lists all active workflows for a user.

```typescript
list_active_workflows(
  user_id: string
) -> Array<{
  workflow_id: string,
  series_id: string,
  series_title: string,
  current_phase: number,
  phase_status: string,
  created_at: string
}>
```

---

## MCP Resources

Resources provide read-only access to workflow state.

### Current State

```
workflow://{workflow_id}/state
```

Returns the current workflow state as JSON.

### Current Phase

```
workflow://{workflow_id}/current-phase
```

Returns the current phase number and name.

### Series Progress

```
workflow://{workflow_id}/series-progress
```

Returns the series production progress (books completed, current book, etc.).

### Phase Documentation

```
workflow://phases/{phase_number}/description
workflow://phases/{phase_number}/requirements
workflow://phases/{phase_number}/outputs
```

Returns documentation for a specific phase.

### Approval Status

```
workflow://{workflow_id}/approvals/pending
workflow://{workflow_id}/approvals/history
```

Returns pending or historical approvals.

### Quality Gates

```
workflow://{workflow_id}/gates/npe-series
workflow://{workflow_id}/gates/npe-scene
workflow://{workflow_id}/gates/commercial
```

Returns quality gate results.

### Production Metrics

```
workflow://{workflow_id}/metrics/summary
```

Returns aggregated metrics summary for the workflow.

```
workflow://{workflow_id}/metrics/velocity
```

Returns current writing velocity and projections.

```
workflow://{workflow_id}/metrics/daily-stats
workflow://{workflow_id}/metrics/daily-stats?range=7
workflow://{workflow_id}/metrics/daily-stats?range=30
```

Returns daily writing statistics. Optional `range` parameter specifies number of days.

```
workflow://{workflow_id}/metrics/by-book
```

Returns metrics broken down by book.

```
workflow://{workflow_id}/metrics/by-phase
```

Returns metrics broken down by phase.

```
workflow://analytics/phase-performance
workflow://analytics/phase-performance/{phase_number}
```

Returns system-wide phase performance analytics.

```
workflow://analytics/global-stats
```

Returns global statistics across all workflows (admin only).

---

## Client Integration Examples

### Claude Code (market-driven-planning-skill)

```typescript
// User invokes: /market-driven-planning-skill with concept
const concept = "Willy Wonka but serial killer";

// Step 1: Create workflow
const workflow = await mcp.call('workflow-manager', 'create_workflow', {
  series_id: seriesId,
  user_id: userId,
  concept: concept
});

console.log(`Created workflow: ${workflow.workflow_id}`);

// Step 2: Execute Phase 0 (Premise Development)
const phase0 = await mcp.call('workflow-manager', 'execute_phase', {
  workflow_id: workflow.workflow_id,
  phase_number: 0,
  input: { concept }
});

// Step 3: Execute Phase 1 (Genre Pack Management)
const phase1 = await mcp.call('workflow-manager', 'execute_phase', {
  workflow_id: workflow.workflow_id,
  phase_number: 1,
  input: { target_genre: phase0.output.target_genre }
});

// ... continue through phases

// Step 4: Check workflow state
const state = await mcp.call('workflow-manager', 'get_workflow_state', {
  workflow_id: workflow.workflow_id
});

console.log(`Current Phase: ${state.current_phase} - ${state.phase_name}`);
console.log(`Status: ${state.phase_status}`);
```

### TypingMind (User Queries)

```typescript
// User asks: "What's the status of my series?"
const workflows = await mcp.call('workflow-manager', 'list_active_workflows', {
  user_id: currentUser.id
});

if (workflows.length === 0) {
  return "You don't have any active workflows. Start one with /market-driven-planning-skill!";
}

const workflow = workflows[0];
const state = await mcp.call('workflow-manager', 'get_workflow_state', {
  workflow_id: workflow.workflow_id
});

return `Your series "${workflow.series_title}" is currently in Phase ${state.current_phase}: ${state.phase_name}. Status: ${state.phase_status}`;

// User asks: "Do I have any pending approvals?"
const approvals = await mcp.call('workflow-manager', 'get_pending_approvals', {
  workflow_id: workflow.workflow_id
});

if (approvals.length > 0) {
  return `You have ${approvals.length} pending approval(s). Review the series plan to proceed.`;
}
```

### FictionLab UI (Dashboard)

```typescript
// Dashboard component
const WorkflowDashboard = () => {
  const [workflow, setWorkflow] = useState(null);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    // Load active workflow
    const loadWorkflow = async () => {
      const workflows = await mcp.call('workflow-manager', 'list_active_workflows', {
        user_id: currentUser.id
      });

      if (workflows.length > 0) {
        const wf = workflows[0];
        setWorkflow(wf);

        // Get series progress
        const prog = await mcp.call('workflow-manager', 'get_series_progress', {
          workflow_id: wf.workflow_id
        });
        setProgress(prog);
      }
    };

    loadWorkflow();

    // Subscribe to real-time updates
    websocket.on('workflow_updated', (data) => {
      if (data.workflow_id === workflow?.workflow_id) {
        setWorkflow(data.state);
      }
    });
  }, []);

  return (
    <div>
      <h2>Series Production Progress</h2>
      <ProgressBar
        phases={12}
        current={workflow?.current_phase}
        booksCompleted={progress?.books_completed}
        totalBooks={5}
      />

      <PhaseIndicator
        phase={workflow?.current_phase}
        status={workflow?.phase_status}
      />

      <ApprovalQueue workflow_id={workflow?.workflow_id} />
    </div>
  );
};
```

### FictionLab Analytics Dashboard (with Production Metrics)

```typescript
// Comprehensive analytics dashboard with production metrics
const AnalyticsDashboard = () => {
  const [workflow, setWorkflow] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [velocity, setVelocity] = useState(null);
  const [dailyStats, setDailyStats] = useState([]);
  const [phaseAnalytics, setPhaseAnalytics] = useState([]);

  useEffect(() => {
    loadAnalytics();

    // Refresh metrics every 30 seconds
    const interval = setInterval(loadAnalytics, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadAnalytics = async () => {
    // Get active workflow
    const workflows = await mcp.call('workflow-manager', 'list_active_workflows', {
      user_id: currentUser.id
    });

    if (workflows.length === 0) return;

    const wf = workflows[0];
    setWorkflow(wf);

    // Load comprehensive metrics
    const [metricsData, velocityData, statsData, phaseData] = await Promise.all([
      mcp.call('workflow-manager', 'get_workflow_metrics', {
        workflow_id: wf.workflow_id
      }),
      mcp.call('workflow-manager', 'get_workflow_velocity', {
        workflow_id: wf.workflow_id,
        time_window: 'week'
      }),
      mcp.call('workflow-manager', 'get_daily_writing_stats', {
        workflow_id: wf.workflow_id,
        date_range: {
          start: getDateDaysAgo(30),
          end: getTodayDate()
        }
      }),
      mcp.call('workflow-manager', 'get_phase_analytics', {})
    ]);

    setMetrics(metricsData);
    setVelocity(velocityData);
    setDailyStats(statsData);
    setPhaseAnalytics(phaseData);
  };

  return (
    <div className="analytics-dashboard">
      {/* Header Stats */}
      <div className="stats-grid">
        <StatCard
          title="Total Words Written"
          value={metrics?.metrics.total_words_written.toLocaleString()}
          icon="📝"
          trend={calculateWordsTrend(dailyStats)}
        />
        <StatCard
          title="Current Velocity"
          value={`${velocity?.velocity.words_per_hour} words/hr`}
          icon="⚡"
          subtitle={`${velocity?.velocity.words_per_day} words/day`}
        />
        <StatCard
          title="Books Completed"
          value={`${metrics?.metrics.books_completed} / 5`}
          icon="📚"
          progress={(metrics?.metrics.books_completed / 5) * 100}
        />
        <StatCard
          title="Estimated Completion"
          value={formatDate(velocity?.projections.estimated_completion_date)}
          icon="🎯"
          subtitle={`${velocity?.projections.hours_remaining} hours remaining`}
        />
      </div>

      {/* Productivity Chart */}
      <div className="chart-section">
        <h3>30-Day Writing Productivity</h3>
        <LineChart
          data={dailyStats}
          xKey="stat_date"
          yKeys={['words_written', 'chapters_completed']}
          colors={['#4f46e5', '#10b981']}
          labels={['Words Written', 'Chapters Completed']}
        />
      </div>

      {/* Velocity Metrics */}
      <div className="velocity-section">
        <h3>Writing Velocity</h3>
        <div className="velocity-grid">
          <MetricBox
            label="Words per Hour"
            value={velocity?.velocity.words_per_hour}
            unit="words/hr"
          />
          <MetricBox
            label="Words per Day"
            value={velocity?.velocity.words_per_day}
            unit="words/day"
          />
          <MetricBox
            label="Chapters per Day"
            value={velocity?.velocity.chapters_per_day.toFixed(1)}
            unit="chapters/day"
          />
          <MetricBox
            label="Scenes per Hour"
            value={velocity?.velocity.scenes_per_hour.toFixed(1)}
            unit="scenes/hr"
          />
        </div>
      </div>

      {/* Efficiency Metrics */}
      <div className="efficiency-section">
        <h3>Writing Efficiency</h3>
        <div className="efficiency-grid">
          <EfficiencyCard
            title="Planning to Writing Ratio"
            value={velocity?.efficiency.planning_to_writing_ratio}
            format="ratio"
            optimal={0.3} // 30% planning, 70% writing is optimal
            description="Time spent planning vs. writing"
          />
          <EfficiencyCard
            title="NPE Pass Rate"
            value={velocity?.efficiency.npe_pass_rate}
            format="percentage"
            optimal={85} // 85%+ pass rate is good
            description="Scenes passing validation first try"
          />
          <EfficiencyCard
            title="Revision Rate"
            value={velocity?.efficiency.revision_rate}
            format="number"
            optimal={1.2} // 1-2 revision passes per chapter
            description="Average revision passes per chapter"
          />
        </div>
      </div>

      {/* Book Progress */}
      <div className="books-section">
        <h3>Progress by Book</h3>
        <div className="books-grid">
          {metrics?.by_book.map(book => (
            <BookCard key={book.book_number}>
              <h4>Book {book.book_number}</h4>
              <ProgressBar
                value={book.chapters_completed}
                max={25}
                label={`${book.chapters_completed} / 25 chapters`}
              />
              <div className="book-stats">
                <span>{book.words_written.toLocaleString()} words</span>
                <span>{formatDuration(book.writing_time_minutes)}</span>
              </div>
            </BookCard>
          ))}
        </div>
      </div>

      {/* Phase Performance */}
      <div className="phase-analytics-section">
        <h3>Phase Performance Analytics</h3>
        <table className="phase-table">
          <thead>
            <tr>
              <th>Phase</th>
              <th>Success Rate</th>
              <th>Avg Duration</th>
              <th>Quality Score</th>
              <th>Executions</th>
            </tr>
          </thead>
          <tbody>
            {phaseAnalytics.map(phase => (
              <tr key={phase.phase_number}>
                <td>
                  <span className="phase-number">{phase.phase_number}</span>
                  {phase.phase_name}
                </td>
                <td>
                  <SuccessRate value={phase.success_rate} />
                </td>
                <td>{formatDuration(phase.avg_duration_minutes)}</td>
                <td>
                  {phase.avg_quality_score
                    ? <QualityScore value={phase.avg_quality_score} />
                    : 'N/A'
                  }
                </td>
                <td>{phase.total_executions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Projections */}
      <div className="projections-section">
        <h3>Series Completion Projections</h3>
        <div className="projection-cards">
          <ProjectionCard
            icon="📅"
            title="Estimated Completion"
            date={velocity?.projections.estimated_completion_date}
            daysRemaining={calculateDaysRemaining(
              velocity?.projections.estimated_completion_date
            )}
          />
          <ProjectionCard
            icon="📖"
            title="Projected Total Words"
            value={velocity?.projections.estimated_total_words.toLocaleString()}
            subtitle="words across all 5 books"
          />
          <ProjectionCard
            icon="⏱️"
            title="Hours Remaining"
            value={velocity?.projections.hours_remaining}
            subtitle={`${(velocity?.projections.hours_remaining / 8).toFixed(1)} working days`}
          />
          <ProjectionCard
            icon="📚"
            title="Books Remaining"
            value={velocity?.projections.books_remaining}
            subtitle="to complete the series"
          />
        </div>
      </div>

      {/* Quality Gates Summary */}
      <div className="gates-section">
        <h3>Quality Gates History</h3>
        <QualityGatesTimeline workflow_id={workflow?.workflow_id} />
      </div>
    </div>
  );
};

// Helper components
const StatCard = ({ title, value, icon, trend, subtitle, progress }) => (
  <div className="stat-card">
    <div className="stat-icon">{icon}</div>
    <div className="stat-content">
      <h4>{title}</h4>
      <div className="stat-value">{value}</div>
      {subtitle && <div className="stat-subtitle">{subtitle}</div>}
      {progress !== undefined && <ProgressBar value={progress} max={100} />}
      {trend && <TrendIndicator value={trend} />}
    </div>
  </div>
);

const EfficiencyCard = ({ title, value, format, optimal, description }) => {
  const formatted =
    format === 'percentage' ? `${value}%` :
    format === 'ratio' ? `${value}:1` :
    value;

  const status =
    format === 'percentage' ? (value >= optimal ? 'good' : 'needs-improvement') :
    format === 'ratio' ? (value <= optimal ? 'good' : 'needs-improvement') :
    'neutral';

  return (
    <div className={`efficiency-card ${status}`}>
      <h4>{title}</h4>
      <div className="efficiency-value">{formatted}</div>
      <div className="efficiency-description">{description}</div>
      {status === 'needs-improvement' && (
        <div className="improvement-tip">
          Target: {format === 'percentage' ? `${optimal}%` : `${optimal}:1`}
        </div>
      )}
    </div>
  );
};

// Utility functions
const getDateDaysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
};

const getTodayDate = () => {
  return new Date().toISOString().split('T')[0];
};

const formatDuration = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
};

const calculateDaysRemaining = (completionDate) => {
  const completion = new Date(completionDate);
  const today = new Date();
  const diffTime = completion - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const calculateWordsTrend = (dailyStats) => {
  if (dailyStats.length < 2) return 0;
  const recent = dailyStats.slice(-7);
  const older = dailyStats.slice(-14, -7);
  const recentAvg = recent.reduce((sum, d) => sum + d.words_written, 0) / recent.length;
  const olderAvg = older.reduce((sum, d) => sum + d.words_written, 0) / older.length;
  return ((recentAvg - olderAvg) / olderAvg * 100).toFixed(1);
};
```

---

## Real-World Usage Scenario

### Scenario: User writes a 5-book series from concept to completion

**Hour 1 - Planning (Phases 0-7)**

1. User opens Claude Code, invokes `/market-driven-planning-skill` with concept
2. Workflow Manager creates workflow instance
3. Phases 0-3 execute (Premise → Genre Pack → Market Research → Series Architect)
4. Phase 4 (NPE Validation) runs, scores 87/100 → PASS
5. Phase 5 (Commercial Validation) runs, scores 8/10 → APPROVE
6. Phase 6 (Writing Team Review) completes
7. Phase 7 (User Approval) - Workflow Manager requests approval
8. User reviews documents in TypingMind, approves
9. Phase 8 (MCP Commit) - Data stored in database

**Hours 2-3 - Book 1 Writing (Phases 9-11)**

10. Phase 9 (Chapter Planning) - 25 chapters planned
11. Phase 10 (Scene Validation) - Scenes validated
12. Phase 11 (Writing Execution) - Book 1 written

**Hours 4-8 - Books 2-5 (Phase 12 Loop)**

13. Phase 12 starts Book 2 iteration
14. Repeats Phases 9-11 for Book 2
15. User approval gate → User approves Book 2
16. Repeats for Books 3, 4, 5

**Hour 8 - Series Complete**

17. Workflow status: `completed`
18. All 5 books written and validated
19. User can export manuscripts

**Throughout the process (with Production Metrics):**
- User checks status in TypingMind: "What phase am I on?"
- FictionLab UI shows real-time progress bar
- Approval notifications sent when user input needed
- All clients see same workflow state
- **Metrics recorded at each step:**
  - Words written per chapter (Phase 11)
  - Time spent planning chapters (Phase 9)
  - NPE validation scores (Phases 4, 10)
  - Commercial assessment scores (Phase 5)
  - Agent invocations per phase
  - Writing velocity calculated continuously
- **Analytics Dashboard shows:**
  - Current velocity: 2,847 words/hour
  - Estimated completion: 3 days from now
  - Planning to writing ratio: 0.28 (optimal)
  - NPE pass rate: 92% (excellent)
  - Daily productivity trending +15% week-over-week

---

## Benefits

1. **Centralized State** - Single source of truth for workflow progress
2. **Multi-Client Support** - TypingMind, Claude Code, FictionLab all use same workflow
3. **Quality Enforcement** - Gates prevent advancing with flawed plans
4. **User Control** - Explicit approval checkpoints
5. **Audit Trail** - Complete history of phase executions
6. **Resumable** - Pause and resume workflows across sessions
7. **Scalable** - Supports subscription tiers and limits
8. **Observable** - Real-time workflow state updates
9. **Production Metrics** - Comprehensive analytics on writing productivity
10. **Velocity Tracking** - Real-time calculations of writing speed and efficiency
11. **Predictive Analytics** - Estimated completion dates based on current velocity
12. **Performance Insights** - Identify bottleneck phases and optimize workflow
13. **Quality Metrics** - Track NPE and commercial validation scores over time
14. **User Dashboard** - Rich analytics UI for writers to track their progress

---

## Implementation Phases

### Phase 1: Core Infrastructure (COMPLETE)
✅ Database schema design
✅ Workflow lifecycle tools
✅ Phase execution tools
✅ Quality gate coordination
✅ User approval system

### Phase 2: Book Production Loop (COMPLETE)
✅ Multi-book iteration support
✅ Book-level approval gates
✅ Series progress tracking
✅ Workflow queries and resources

### Phase 3: Production Metrics (COMPLETE)
✅ Production metrics database schema
✅ Metrics recording tools
✅ Analytics and velocity calculations
✅ Daily writing statistics
✅ Phase performance analytics
✅ MCP Resources for metrics visualization
✅ FictionLab Analytics Dashboard integration
✅ Real-world usage examples with metrics

---

## Phase 3 Implementation Summary

### Database Tables Added
1. **production_metrics** - Records all production metrics throughout workflow
2. **daily_writing_stats** - Aggregated daily statistics for dashboards
3. **phase_performance** - Analytics on phase execution performance

### MCP Tools Added
1. **record_production_metric** - Records individual metrics
2. **get_workflow_metrics** - Retrieves aggregated workflow metrics
3. **get_phase_analytics** - Gets phase performance analytics
4. **get_daily_writing_stats** - Returns daily writing statistics
5. **get_workflow_velocity** - Calculates velocity and projections
6. **update_daily_stats** - Internal tool for daily stat updates

### MCP Resources Added
- `workflow://{workflow_id}/metrics/summary` - Metrics summary
- `workflow://{workflow_id}/metrics/velocity` - Velocity and projections
- `workflow://{workflow_id}/metrics/daily-stats` - Daily statistics
- `workflow://{workflow_id}/metrics/by-book` - Book-level metrics
- `workflow://{workflow_id}/metrics/by-phase` - Phase-level metrics
- `workflow://analytics/phase-performance` - System-wide analytics
- `workflow://analytics/global-stats` - Global statistics

### Key Features
- **Real-time velocity tracking** - Calculates words/hour, words/day, chapters/day
- **Predictive analytics** - Estimates completion dates and remaining hours
- **Efficiency metrics** - Planning/writing ratio, NPE pass rate, revision rate
- **Comprehensive dashboard** - Full analytics UI with charts and projections
- **Performance insights** - Identifies bottleneck phases for optimization

### Integration Points
- FictionLab Analytics Dashboard renders rich metrics visualizations
- TypingMind can query metrics via MCP tools
- Claude Code can access metrics for status updates
- Real-time updates via WebSocket for live dashboard

---

## Next Steps for Implementation

1. **Database Setup**
   - Create database migrations for all 7 tables
   - Add indexes for query performance
   - Set up foreign key constraints

2. **MCP Server Implementation**
   - Implement MCP server in TypeScript/Node.js
   - Add all 17+ workflow tools
   - Implement MCP Resources for state access
   - Add WebSocket support for real-time updates

3. **Infrastructure**
   - Add to FictionLab's docker-compose.yml (port 3012)
   - Configure PgBouncer connection pooling
   - Set up monitoring and logging

4. **Client Integration**
   - Update TypingMind MCP configuration
   - Update Claude Code MCP configuration
   - Implement FictionLab UI dashboard components
   - Create analytics dashboard with charts

5. **Testing**
   - Unit tests for all MCP tools
   - Integration tests for workflow lifecycle
   - End-to-end tests for full series workflow
   - Load testing for concurrent workflows

6. **Documentation**
   - API documentation for MCP tools
   - User guide for workflow management
   - Analytics dashboard user guide
   - Developer setup instructions

7. **Deployment**
   - Deploy to staging environment
   - User acceptance testing
   - Deploy to production
   - Monitor for issues

---

**Last Updated:** 2025-12-03
**Version:** 3.1 (Phase 3 Complete - Production Metrics)
**Status:** Design Complete - Ready for Implementation
**Phase 3 Status:** ✅ Complete

---

## Quick Navigation

**Repository-Specific Implementations:**

- 📋 [System Overview](./WORKFLOW_MANAGER_OVERVIEW.md) - Architecture and feature summary
- 💻 [BQ-Studio](./WORKFLOW_MANAGER_BQ_STUDIO.md) - Claude Code integration guide
- 🔧 [MCP-Writing-Servers](./WORKFLOW_MANAGER_MCP_SERVERS.md) - Server implementation specification
- 🎨 [MCP-Electron-App](./WORKFLOW_MANAGER_ELECTRON_APP.md) - FictionLab dashboard components

**Implementation Sequence:**
1. Read the [Overview](./WORKFLOW_MANAGER_OVERVIEW.md) for system architecture
2. Review [MCP Server specs](./WORKFLOW_MANAGER_MCP_SERVERS.md) for database and tool implementation
3. Check [BQ-Studio guide](./WORKFLOW_MANAGER_BQ_STUDIO.md) for Claude Code integration
4. See [Dashboard specs](./WORKFLOW_MANAGER_ELECTRON_APP.md) for UI components
