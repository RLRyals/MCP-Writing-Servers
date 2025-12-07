# Workflow Manager MCP - Implementation Design for MCP-Writing-Servers
**Version:** 3.1 (Phase 2 & 3 - Revision Workflow + Production Metrics)  
**Target Repository:** [`MCP-Writing-Servers`](https://github.com/RLRyals/MCP-Writing-Servers)  
**Status:** Design Complete - Ready for Implementation  
**Date:** 2025-12-03
---
## Executive Summary
This document specifies the database schema additions and MCP tool implementations required in the `MCP-Writing-Servers` repository to support:
1. **6-Pass Revision Workflow** (Phase 2)
2. **Production Metrics Tracking** (Phase 3)
3. **Automated QA Checklist** (Phase 2)
### What Already Exists
✅ **Infrastructure:**
- PostgreSQL database with PgBouncer connection pooling
- 11 MCP servers running on ports 3001-3012
- Workflow Manager MCP server (`src/mcps/workflow-manager-server/index.js`)
- Migration system (`migrations/025_wrapped.sql`)
- Docker Compose stack with monitoring (Prometheus + Grafana)
✅ **Existing Database Tables** (from `025_wrapped.sql`):
- `workflow_instances` - Core workflow state
- `workflow_phase_history` - Phase execution history
- `workflow_approvals` - User approval checkpoints
- `workflow_quality_gates` - NPE and commercial validation results
### What Needs to Be Added
🔴 **New Database Tables:**
- `revision_passes` - Track 6-pass revision workflow state
- `production_metrics` - Record all production metrics
- `daily_writing_stats` - Aggregated daily statistics
- `phase_performance` - System-wide phase analytics
- `qa_reports` - Publishing readiness reports
🔴 **New MCP Tools:**
- Revision workflow tools (5 tools)
- Production metrics tools (6 tools)
- QA checklist tools (2 tools)
🔴 **Modified MCP Tools:**
- `complete_current_phase` - Add metrics recording
---
## Part 1: Database Schema Additions
### Migration File: `migrations/026_revision_and_metrics.sql`
Create a new migration file following the pattern from `025_wrapped.sql`:
```sql
-- ============================================
-- Migration 026: Revision Workflow & Production Metrics
-- ============================================
-- Purpose: Add support for 6-pass revision workflow and production metrics tracking
-- Date: 2025-12-03
-- Dependencies: 025_wrapped.sql
DO $$ 
BEGIN
  -- Check if migration already applied
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'revision_passes'
  ) THEN
    -- ============================================
    -- Table 1: revision_passes
    -- ============================================
    -- Tracks the state of each revision pass for a book
    
    CREATE TABLE revision_passes (
      id SERIAL PRIMARY KEY,
      workflow_id INTEGER NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
      book_number INTEGER NOT NULL,
      pass_number INTEGER NOT NULL CHECK (pass_number BETWEEN 1 AND 6),
      pass_name VARCHAR(50) NOT NULL, 
        -- 'structural', 'continuity', 'dialogue', 'emotional', 'line_edit', 'final_qa'
      status VARCHAR(20) NOT NULL DEFAULT 'pending', 
        -- 'pending', 'in_progress', 'complete', 'skipped'
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      duration_minutes INTEGER,
      findings_summary TEXT,
      edits_made BOOLEAN DEFAULT FALSE,
      user_approved BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      metadata JSONB DEFAULT '{}'::jsonb,
      
      -- Ensure one record per workflow/book/pass combination
      UNIQUE(workflow_id, book_number, pass_number)
    );
    CREATE INDEX idx_revision_workflow_book ON revision_passes(workflow_id, book_number);
    CREATE INDEX idx_revision_pass_status ON revision_passes(status);
    CREATE INDEX idx_revision_pass_number ON revision_passes(pass_number);
    -- ============================================
    -- Table 2: production_metrics
    -- ============================================
    -- Records all production metrics throughout workflow
    
    CREATE TABLE production_metrics (
      id SERIAL PRIMARY KEY,
      workflow_id INTEGER NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
      metric_type TEXT NOT NULL,
        -- Common types:
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
    CREATE INDEX idx_metrics_book ON production_metrics(book_number);
    CREATE INDEX idx_metrics_recorded ON production_metrics(recorded_at);
    -- ============================================
    -- Table 3: daily_writing_stats
    -- ============================================
    -- Aggregated daily statistics for dashboards
    
    CREATE TABLE daily_writing_stats (
      id SERIAL PRIMARY KEY,
      workflow_id INTEGER NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES authors(id),
      stat_date DATE NOT NULL,
      words_written INTEGER DEFAULT 0,
      chapters_completed INTEGER DEFAULT 0,
      scenes_written INTEGER DEFAULT 0,
      writing_time_minutes INTEGER DEFAULT 0,
      phases_completed INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      metadata JSONB DEFAULT '{}'::jsonb,
      
      -- One record per workflow per day
      UNIQUE(workflow_id, stat_date)
    );
    CREATE INDEX idx_daily_stats_workflow ON daily_writing_stats(workflow_id);
    CREATE INDEX idx_daily_stats_author ON daily_writing_stats(author_id);
    CREATE INDEX idx_daily_stats_date ON daily_writing_stats(stat_date);
    -- ============================================
    -- Table 4: phase_performance
    -- ============================================
    -- System-wide analytics for phase execution
    
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
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      metadata JSONB DEFAULT '{}'::jsonb,
      
      -- One record per phase
      UNIQUE(phase_number)
    );
    CREATE INDEX idx_phase_perf_number ON phase_performance(phase_number);
    -- ============================================
    -- Table 5: qa_reports
    -- ============================================
    -- Publishing readiness validation reports
    
    CREATE TABLE qa_reports (
      id SERIAL PRIMARY KEY,
      workflow_id INTEGER NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
      book_number INTEGER NOT NULL,
      report_date TIMESTAMP DEFAULT NOW(),
      status VARCHAR(20) NOT NULL, -- 'READY_TO_PUBLISH', 'NOT_READY'
      
      -- Category results
      npe_validation JSONB DEFAULT '{}'::jsonb,
      continuity_validation JSONB DEFAULT '{}'::jsonb,
      ku_optimization JSONB DEFAULT '{}'::jsonb,
      production_completeness JSONB DEFAULT '{}'::jsonb,
      metadata_validation JSONB DEFAULT '{}'::jsonb,
      
      -- Blockers
      blockers JSONB DEFAULT '[]'::jsonb,
      blocker_count INTEGER DEFAULT 0,
      
      -- Recommendations
      recommendations JSONB DEFAULT '[]'::jsonb,
      estimated_time_to_ready_hours DECIMAL(5,2),
      
      metadata JSONB DEFAULT '{}'::jsonb
    );
    CREATE INDEX idx_qa_reports_workflow_book ON qa_reports(workflow_id, book_number);
    CREATE INDEX idx_qa_reports_status ON qa_reports(status);
    CREATE INDEX idx_qa_reports_date ON qa_reports(report_date);
    -- ============================================
    -- Initialize phase_performance with all 12 phases
    -- ============================================
    
    INSERT INTO phase_performance (phase_number, phase_name) VALUES
      (-1, 'Premise Development'),
      (0, 'Genre Pack Selection/Creation'),
      (1, 'Market Research & Trope Analysis'),
      (2, 'Series Architecture'),
      (3, 'NPE Series Validation'),
      (4, 'Commercial Validation'),
      (5, 'Writing Team Review'),
      (6, 'User Approval'),
      (7, 'MCP Commit'),
      (8, 'Chapter Planning'),
      (9, 'Scene Validation'),
      (10, 'Writing Execution'),
      (11, 'Book Production Loop')
    ON CONFLICT (phase_number) DO NOTHING;
    RAISE NOTICE 'Migration 026: Revision & Metrics tables created successfully';
    
  ELSE
    RAISE NOTICE 'Migration 026: Tables already exist, skipping';
  END IF;
END $$;
```
---
## Part 2: MCP Tool Implementations
### File: `src/mcps/workflow-manager-server/index.js`
Add the following tools to the existing Workflow Manager MCP server:
### 2.1 Revision Workflow Tools
```javascript
// ============================================
// REVISION WORKFLOW TOOLS
// ============================================
/**
 * Start a revision pass for a book
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'start_revision_pass') {
    const { workflow_id, book_number, pass_number, pass_name } = request.params.arguments;
    
    const result = await pool.query(`
      INSERT INTO revision_passes (
        workflow_id, book_number, pass_number, pass_name, 
        status, started_at
      ) VALUES ($1, $2, $3, $4, 'in_progress', NOW())
      ON CONFLICT (workflow_id, book_number, pass_number) 
      DO UPDATE SET 
        status = 'in_progress',
        started_at = NOW(),
        updated_at = NOW()
      RETURNING id, started_at
    `, [workflow_id, book_number, pass_number, pass_name]);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          pass_id: result.rows[0].id,
          started_at: result.rows[0].started_at,
          message: `Started ${pass_name} revision pass for Book ${book_number}`
        })
      }]
    };
  }
});
/**
 * Complete a revision pass
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'complete_revision_pass') {
    const { 
      workflow_id, book_number, pass_number, 
      findings_summary, edits_made, user_approved 
    } = request.params.arguments;
    
    const result = await pool.query(`
      UPDATE revision_passes
      SET 
        status = 'complete',
        completed_at = NOW(),
        duration_minutes = EXTRACT(EPOCH FROM (NOW() - started_at)) / 60,
        findings_summary = $1,
        edits_made = $2,
        user_approved = $3,
        updated_at = NOW()
      WHERE workflow_id = $4 
        AND book_number = $5 
        AND pass_number = $6
      RETURNING id, duration_minutes, completed_at
    `, [findings_summary, edits_made, user_approved, workflow_id, book_number, pass_number]);
    
    // Record metrics
    if (result.rows.length > 0) {
      await pool.query(`
        INSERT INTO production_metrics (
          workflow_id, metric_type, metric_value, 
          book_number, metadata
        ) VALUES ($1, 'revision_time_minutes', $2, $3, $4)
      `, [
        workflow_id, 
        result.rows[0].duration_minutes, 
        book_number,
        JSON.stringify({ pass_number, pass_name: getPassName(pass_number) })
      ]);
    }
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          pass_id: result.rows[0].id,
          duration_minutes: result.rows[0].duration_minutes,
          completed_at: result.rows[0].completed_at,
          message: `Completed revision pass ${pass_number} for Book ${book_number}`
        })
      }]
    };
  }
});
/**
 * Get revision status for a book
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'get_revision_status') {
    const { workflow_id, book_number } = request.params.arguments;
    
    const result = await pool.query(`
      SELECT 
        pass_number,
        pass_name,
        status,
        started_at,
        completed_at,
        duration_minutes,
        edits_made,
        user_approved
      FROM revision_passes
      WHERE workflow_id = $1 AND book_number = $2
      ORDER BY pass_number
    `, [workflow_id, book_number]);
    
    const passes = result.rows;
    const completed = passes.filter(p => p.status === 'complete').length;
    const total = 6;
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          workflow_id,
          book_number,
          passes_completed: completed,
          total_passes: total,
          progress_percentage: (completed / total * 100).toFixed(1),
          passes: passes,
          ready_for_qa: completed === 5 // All passes except final QA
        })
      }]
    };
  }
});
/**
 * Run automated QA checklist
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'run_qa_checklist') {
    const { workflow_id, book_number } = request.params.arguments;
    
    // This is a complex tool that queries multiple systems
    // Implementation would follow the spec in automated-qa-checklist.md
    
    const report = {
      book_title: await getBookTitle(workflow_id, book_number),
      book_number,
      date: new Date().toISOString(),
      status: 'PENDING',
      categories: {}
    };
    
    // Query each validation system
    report.categories.npe = await validateNPE(workflow_id, book_number);
    report.categories.continuity = await validateContinuity(workflow_id, book_number);
    report.categories.ku = await validateKUOptimization(workflow_id, book_number);
    report.categories.production = await validateProduction(workflow_id, book_number);
    report.categories.metadata = await validateMetadata(workflow_id, book_number);
    
    // Determine overall status
    const allPassed = Object.values(report.categories).every(c => c.status === 'PASS');
    report.status = allPassed ? 'READY_TO_PUBLISH' : 'NOT_READY';
    
    // Collect blockers
    report.blockers = collectBlockers(report.categories);
    report.blocker_count = report.blockers.length;
    
    // Generate recommendations
    if (!allPassed) {
      report.recommendations = generateRecommendations(report.blockers);
      report.estimated_time_to_ready_hours = estimateTimeToReady(report.blockers);
    }
    
    // Store report
    await pool.query(`
      INSERT INTO qa_reports (
        workflow_id, book_number, status,
        npe_validation, continuity_validation, ku_optimization,
        production_completeness, metadata_validation,
        blockers, blocker_count, recommendations,
        estimated_time_to_ready_hours
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      workflow_id, book_number, report.status,
      JSON.stringify(report.categories.npe),
      JSON.stringify(report.categories.continuity),
      JSON.stringify(report.categories.ku),
      JSON.stringify(report.categories.production),
      JSON.stringify(report.categories.metadata),
      JSON.stringify(report.blockers),
      report.blocker_count,
      JSON.stringify(report.recommendations),
      report.estimated_time_to_ready_hours
    ]);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(report, null, 2)
      }]
    };
  }
});
/**
 * Mark book as ready to publish
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'mark_ready_to_publish') {
    const { workflow_id, book_number } = request.params.arguments;
    
    // Update workflow metadata
    await pool.query(`
      UPDATE workflow_instances
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{books_ready_to_publish}',
        COALESCE(metadata->'books_ready_to_publish', '[]'::jsonb) || $1::jsonb
      )
      WHERE id = $2
    `, [JSON.stringify(book_number), workflow_id]);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          workflow_id,
          book_number,
          status: 'READY_TO_PUBLISH',
          message: `Book ${book_number} marked as ready to publish`
        })
      }]
    };
  }
});
```
### 2.2 Production Metrics Tools
```javascript
// ============================================
// PRODUCTION METRICS TOOLS
// ============================================
/**
 * Record a production metric
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'record_production_metric') {
    const { 
      workflow_id, metric_type, metric_value, context = {} 
    } = request.params.arguments;
    
    const result = await pool.query(`
      INSERT INTO production_metrics (
        workflow_id, metric_type, metric_value,
        phase_number, book_number, chapter_number, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, recorded_at
    `, [
      workflow_id,
      metric_type,
      metric_value,
      context.phase_number || null,
      context.book_number || null,
      context.chapter_number || null,
      JSON.stringify(context.metadata || {})
    ]);
    
    // Auto-update daily stats
    if (['words_written', 'chapters_completed', 'scenes_written', 'writing_time_minutes'].includes(metric_type)) {
      await updateDailyStats(workflow_id, new Date().toISOString().split('T')[0], {
        [metric_type]: metric_value
      });
    }
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          metric_id: result.rows[0].id,
          recorded_at: result.rows[0].recorded_at
        })
      }]
    };
  }
});
/**
 * Get workflow metrics (aggregated)
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'get_workflow_metrics') {
    const { workflow_id, metric_types, date_range } = request.params.arguments;
    
    // Aggregate metrics
    const metrics = await pool.query(`
      SELECT 
        SUM(CASE WHEN metric_type = 'words_written' THEN metric_value ELSE 0 END) as total_words_written,
        SUM(CASE WHEN metric_type = 'chapters_completed' THEN metric_value ELSE 0 END) as total_chapters_completed,
        SUM(CASE WHEN metric_type = 'scenes_validated' THEN metric_value ELSE 0 END) as total_scenes_validated,
        SUM(CASE WHEN metric_type = 'writing_time_minutes' THEN metric_value ELSE 0 END) as total_writing_time_minutes,
        AVG(CASE WHEN metric_type = 'npe_score' THEN metric_value ELSE NULL END) as avg_npe_score,
        AVG(CASE WHEN metric_type = 'commercial_score' THEN metric_value ELSE NULL END) as avg_commercial_score,
        COUNT(DISTINCT book_number) as books_completed
      FROM production_metrics
      WHERE workflow_id = $1
        ${date_range ? 'AND recorded_at BETWEEN $2 AND $3' : ''}
    `, date_range ? [workflow_id, date_range.start, date_range.end] : [workflow_id]);
    
    // Get by-book breakdown
    const byBook = await pool.query(`
      SELECT 
        book_number,
        SUM(CASE WHEN metric_type = 'words_written' THEN metric_value ELSE 0 END) as words_written,
        SUM(CASE WHEN metric_type = 'chapters_completed' THEN metric_value ELSE 0 END) as chapters_completed,
        SUM(CASE WHEN metric_type = 'writing_time_minutes' THEN metric_value ELSE 0 END) as writing_time_minutes
      FROM production_metrics
      WHERE workflow_id = $1 AND book_number IS NOT NULL
      GROUP BY book_number
      ORDER BY book_number
    `, [workflow_id]);
    
    // Calculate velocity
    const totalWords = metrics.rows[0].total_words_written || 0;
    const totalMinutes = metrics.rows[0].total_writing_time_minutes || 1;
    const currentVelocity = (totalWords / (totalMinutes / 60)).toFixed(0);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          workflow_id,
          metrics: {
            ...metrics.rows[0],
            current_velocity: parseInt(currentVelocity)
          },
          by_book: byBook.rows
        }, null, 2)
      }]
    };
  }
});
/**
 * Get workflow velocity and projections
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'get_workflow_velocity') {
    const { workflow_id, time_window = 'all' } = request.params.arguments;
    
    // Implementation follows WORKFLOW_MANAGER_MCP.md specification
    // Calculate words/hour, words/day, chapters/day, scenes/hour
    // Calculate efficiency metrics
    // Generate projections
    
    // Placeholder - full implementation would be more complex
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          workflow_id,
          time_window,
          velocity: {
            words_per_hour: 2847,
            words_per_day: 8541,
            chapters_per_day: 1.2,
            scenes_per_hour: 0.8
          },
          efficiency: {
            planning_to_writing_ratio: 0.28,
            revision_rate: 1.2,
            npe_pass_rate: 92
          },
          projections: {
            estimated_completion_date: '2025-12-15',
            estimated_total_words: 375000,
            books_remaining: 3,
            hours_remaining: 120
          }
        }, null, 2)
      }]
    };
  }
});
/**
 * Get daily writing statistics
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'get_daily_writing_stats') {
    const { workflow_id, author_id, date_range } = request.params.arguments;
    
    const result = await pool.query(`
      SELECT 
        stat_date,
        words_written,
        chapters_completed,
        scenes_written,
        writing_time_minutes,
        phases_completed,
        CASE 
          WHEN writing_time_minutes > 0 
          THEN (words_written::float / (writing_time_minutes::float / 60))
          ELSE 0 
        END as avg_words_per_hour
      FROM daily_writing_stats
      WHERE ${workflow_id ? 'workflow_id = $1' : 'author_id = $1'}
        ${date_range ? 'AND stat_date BETWEEN $2 AND $3' : ''}
      ORDER BY stat_date DESC
    `, date_range 
      ? [workflow_id || author_id, date_range.start, date_range.end]
      : [workflow_id || author_id]
    );
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result.rows, null, 2)
      }]
    };
  }
});
/**
 * Get phase analytics
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'get_phase_analytics') {
    const { phase_number } = request.params.arguments;
    
    const result = await pool.query(`
      SELECT 
        phase_number,
        phase_name,
        total_executions,
        successful_executions,
        failed_executions,
        CASE 
          WHEN total_executions > 0 
          THEN (successful_executions::float / total_executions::float * 100)
          ELSE 0 
        END as success_rate,
        avg_duration_minutes,
        avg_quality_score,
        last_execution
      FROM phase_performance
      ${phase_number ? 'WHERE phase_number = $1' : ''}
      ORDER BY phase_number
    `, phase_number ? [phase_number] : []);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result.rows, null, 2)
      }]
    };
  }
});
/**
 * Update daily stats (internal helper, also exposed as tool)
 */
async function updateDailyStats(workflow_id, date, updates) {
  const fields = Object.keys(updates);
  const setClauses = fields.map(f => `${f} = ${f} + EXCLUDED.${f}`).join(', ');
  
  await pool.query(`
    INSERT INTO daily_writing_stats (
      workflow_id, stat_date, ${fields.join(', ')}
    ) VALUES ($1, $2, ${fields.map((_, i) => `$${i + 3}`).join(', ')})
    ON CONFLICT (workflow_id, stat_date)
    DO UPDATE SET ${setClauses}, updated_at = NOW()
  `, [workflow_id, date, ...Object.values(updates)]);
}
```
### 2.3 Modify Existing Tool
```javascript
/**
 * MODIFY: complete_current_phase
 * Add metrics recording
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'complete_current_phase') {
    // ... existing implementation ...
    
    // ADD: Record phase duration metric
    const duration = calculatePhaseDuration(phase_id);
    await pool.query(`
      INSERT INTO production_metrics (
        workflow_id, metric_type, metric_value, phase_number
      ) VALUES ($1, 'phase_duration_minutes', $2, $3)
    `, [workflow_id, duration, phase_number]);
    
    // ADD: Update phase performance analytics
    await pool.query(`
      UPDATE phase_performance
      SET 
        total_executions = total_executions + 1,
        successful_executions = successful_executions + 1,
        avg_duration_minutes = (
          COALESCE(avg_duration_minutes * (total_executions - 1), 0) + $1
        ) / total_executions,
        last_execution = NOW(),
        updated_at = NOW()
      WHERE phase_number = $2
    `, [duration, phase_number]);
    
    // ... rest of existing implementation ...
  }
});
```
---
## Part 3: Tool Registration
Add all new tools to the server's tool list:
```javascript
// In the ListToolsRequestSchema handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ... existing tools ...
      
      // Revision Workflow Tools
      {
        name: 'start_revision_pass',
        description: 'Start a revision pass for a book',
        inputSchema: {
          type: 'object',
          properties: {
            workflow_id: { type: 'number' },
            book_number: { type: 'number' },
            pass_number: { type: 'number', minimum: 1, maximum: 6 },
            pass_name: { type: 'string' }
          },
          required: ['workflow_id', 'book_number', 'pass_number', 'pass_name']
        }
      },
      {
        name: 'complete_revision_pass',
        description: 'Complete a revision pass with findings',
        inputSchema: {
          type: 'object',
          properties: {
            workflow_id: { type: 'number' },
            book_number: { type: 'number' },
            pass_number: { type: 'number' },
            findings_summary: { type: 'string' },
            edits_made: { type: 'boolean' },
            user_approved: { type: 'boolean' }
          },
          required: ['workflow_id', 'book_number', 'pass_number']
        }
      },
      {
        name: 'get_revision_status',
        description: 'Get status of all revision passes for a book',
        inputSchema: {
          type: 'object',
          properties: {
            workflow_id: { type: 'number' },
            book_number: { type: 'number' }
          },
          required: ['workflow_id', 'book_number']
        }
      },
      {
        name: 'run_qa_checklist',
        description: 'Run automated QA checklist for publishing readiness',
        inputSchema: {
          type: 'object',
          properties: {
            workflow_id: { type: 'number' },
            book_number: { type: 'number' }
          },
          required: ['workflow_id', 'book_number']
        }
      },
      {
        name: 'mark_ready_to_publish',
        description: 'Mark a book as ready to publish',
        inputSchema: {
          type: 'object',
          properties: {
            workflow_id: { type: 'number' },
            book_number: { type: 'number' }
          },
          required: ['workflow_id', 'book_number']
        }
      },
      
      // Production Metrics Tools
      {
        name: 'record_production_metric',
        description: 'Record a production metric',
        inputSchema: {
          type: 'object',
          properties: {
            workflow_id: { type: 'number' },
            metric_type: { type: 'string' },
            metric_value: { type: 'number' },
            context: {
              type: 'object',
              properties: {
                phase_number: { type: 'number' },
                book_number: { type: 'number' },
                chapter_number: { type: 'number' },
                metadata: { type: 'object' }
              }
            }
          },
          required: ['workflow_id', 'metric_type', 'metric_value']
        }
      },
      {
        name: 'get_workflow_metrics',
        description: 'Get aggregated metrics for a workflow',
        inputSchema: {
          type: 'object',
          properties: {
            workflow_id: { type: 'number' },
            metric_types: { type: 'array', items: { type: 'string' } },
            date_range: {
              type: 'object',
              properties: {
                start: { type: 'string' },
                end: { type: 'string' }
              }
            }
          },
          required: ['workflow_id']
        }
      },
      {
        name: 'get_workflow_velocity',
        description: 'Calculate writing velocity and projections',
        inputSchema: {
          type: 'object',
          properties: {
            workflow_id: { type: 'number' },
            time_window: { type: 'string', enum: ['day', 'week', 'all'] }
          },
          required: ['workflow_id']
        }
      },
      {
        name: 'get_daily_writing_stats',
        description: 'Get daily writing statistics',
        inputSchema: {
          type: 'object',
          properties: {
            workflow_id: { type: 'number' },
            author_id: { type: 'number' },
            date_range: {
              type: 'object',
              properties: {
                start: { type: 'string' },
                end: { type: 'string' }
              }
            }
          }
        }
      },
      {
        name: 'get_phase_analytics',
        description: 'Get phase performance analytics',
        inputSchema: {
          type: 'object',
          properties: {
            phase_number: { type: 'number' }
          }
        }
      }
    ]
  };
});
```
---
## Part 4: Implementation Checklist
### Database
- [ ] Create `migrations/026_revision_and_metrics.sql`
- [ ] Test migration on local database
- [ ] Verify all indexes created
- [ ] Verify foreign key constraints
- [ ] Test migration rollback (if needed)
### MCP Tools
- [ ] Implement 5 revision workflow tools
- [ ] Implement 6 production metrics tools
- [ ] Modify `complete_current_phase` tool
- [ ] Add all tools to ListToolsRequestSchema
- [ ] Add input validation for all tools
- [ ] Add error handling for all tools
### Helper Functions
- [ ] Implement `validateNPE()`
- [ ] Implement `validateContinuity()`
- [ ] Implement `validateKUOptimization()`
- [ ] Implement `validateProduction()`
- [ ] Implement `validateMetadata()`
- [ ] Implement `collectBlockers()`
- [ ] Implement `generateRecommendations()`
- [ ] Implement `estimateTimeToReady()`
- [ ] Implement `getPassName()`
- [ ] Implement `updateDailyStats()`
### Testing
- [ ] Unit tests for each MCP tool
- [ ] Integration tests for revision workflow
- [ ] Integration tests for metrics recording
- [ ] Test QA checklist with mock data
- [ ] Load testing for metrics queries
- [ ] Test daily stats aggregation
### Documentation
- [ ] Update README with new tools
- [ ] Document QA checklist validation logic
- [ ] Document metrics types and usage
- [ ] Add examples for each tool
- [ ] Update API documentation
---
## Part 5: Testing Strategy
### Unit Tests
```javascript
// Example test structure
describe('Revision Workflow Tools', () => {
  test('start_revision_pass creates new pass', async () => {
    const result = await callTool('start_revision_pass', {
      workflow_id: 1,
      book_number: 1,
      pass_number: 1,
      pass_name: 'structural'
    });
    expect(result.pass_id).toBeDefined();
    expect(result.started_at).toBeDefined();
  });
  
  test('complete_revision_pass records duration', async () => {
    // Start pass
    await callTool('start_revision_pass', {...});
    
    // Wait 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Complete pass
    const result = await callTool('complete_revision_pass', {
      workflow_id: 1,
      book_number: 1,
      pass_number: 1,
      findings_summary: 'Test findings',
      edits_made: true,
      user_approved: true
    });
    
    expect(result.duration_minutes).toBeGreaterThan(0);
  });
});
```
### Integration Tests
```javascript
describe('Full Revision Workflow', () => {
  test('complete 6-pass revision workflow', async () => {
    const workflow_id = 1;
    const book_number = 1;
    
    // Execute all 6 passes
    for (let pass = 1; pass <= 6; pass++) {
      await callTool('start_revision_pass', {
        workflow_id,
        book_number,
        pass_number: pass,
        pass_name: getPassName(pass)
      });
      
      await callTool('complete_revision_pass', {
        workflow_id,
        book_number,
        pass_number: pass,
        findings_summary: `Pass ${pass} complete`,
        edits_made: true,
        user_approved: true
      });
    }
    
    // Check status
    const status = await callTool('get_revision_status', {
      workflow_id,
      book_number
    });
    
    expect(status.passes_completed).toBe(6);
    expect(status.ready_for_qa).toBe(true);
  });
});
```
---
## Part 6: Deployment Steps
1. **Local Development:**
   ```bash
   # Run migration
   psql -U writer -d mcp_series -f migrations/026_revision_and_metrics.sql
   
   # Restart MCP servers
   docker-compose restart mcp-servers
   
   # Test tools
   npm test
   ```
2. **Staging Deployment:**
   ```bash
   # Deploy to staging
   docker-compose -f docker-compose.staging.yml up -d
   
   # Run migration
   docker exec mcp-postgres psql -U writer -d mcp_series -f /migrations/026_revision_and_metrics.sql
   
   # Verify
   docker logs mcp-writing-servers
   ```
3. **Production Deployment:**
   ```bash
   # Backup database
   docker exec mcp-postgres pg_dump -U writer mcp_series > backup_$(date +%Y%m%d).sql
   
   # Deploy
   docker-compose pull
   docker-compose up -d
   
   # Run migration
   docker exec mcp-postgres psql -U writer -d mcp_series -f /migrations/026_revision_and_metrics.sql
   
   # Monitor
   docker logs -f mcp-writing-servers
   ```
---
## Part 7: Success Criteria
### Database
✅ All 5 new tables created successfully  
✅ All indexes created  
✅ Foreign key constraints working  
✅ Migration is idempotent (can run multiple times safely)
### MCP Tools
✅ All 13 tools registered and callable  
✅ All tools return valid JSON responses  
✅ Error handling works correctly  
✅ Input validation prevents invalid data
### Functionality
✅ Can track complete 6-pass revision workflow  
✅ Metrics recorded automatically during workflow  
✅ Daily stats aggregate correctly  
✅ QA checklist produces accurate reports  
✅ Velocity calculations are accurate
### Performance
✅ Metrics queries return in <500ms  
✅ Daily stats aggregation completes in <1s  
✅ QA checklist runs in <5s  
✅ No database deadlocks under load
---
## Appendix: Helper Function Implementations
### QA Validation Functions
```javascript
async function validateNPE(workflow_id, book_number) {
  // Query NPE server or database for validation results
  const npeResults = await pool.query(`
    SELECT * FROM workflow_quality_gates
    WHERE workflow_id = $1 
      AND gate_type = 'npe_series'
    ORDER BY executed_at DESC
    LIMIT 1
  `, [workflow_id]);
  
  if (npeResults.rows.length === 0) {
    return {
      status: 'FAIL',
      message: 'No NPE validation found',
      blockers: ['NPE validation not run']
    };
  }
  
  const npe = npeResults.rows[0];
  return {
    status: npe.passed ? 'PASS' : 'FAIL',
    score: npe.score,
    blockers: npe.passed ? [] : npe.violations
  };
}
// Similar implementations for:
// - validateContinuity()
// - validateKUOptimization()
// - validateProduction()
// - validateMetadata()
```
---
**End of Implementation Design Document**
This document provides complete specifications for implementing Phase 2 (Revision Workflow) and Phase 3 (Production Metrics) in the MCP-Writing-Servers repository.