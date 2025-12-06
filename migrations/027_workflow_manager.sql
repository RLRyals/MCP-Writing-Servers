-- Migration 027: Workflow Manager Tables
-- Creates tables for workflow orchestration, approvals, quality gates, and production metrics
-- This migration is idempotent and can be run multiple times safely

DO $$
BEGIN
    -- Check if migration was already applied
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '027_workflow_manager.sql') THEN
        RAISE NOTICE 'Migration 027_workflow_manager.sql already applied, skipping.';
        RETURN;
    END IF;

-- =============================================
-- CORE WORKFLOW TABLES
-- =============================================

-- Workflow instances (main workflow state)
CREATE TABLE IF NOT EXISTS workflow_instances (
    id SERIAL PRIMARY KEY,
    series_id INTEGER REFERENCES series(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES authors(id) ON DELETE SET NULL,
    current_phase INTEGER NOT NULL DEFAULT -1, -- -1 (not started) to 12
    phase_status TEXT NOT NULL DEFAULT 'in_progress', 
        -- 'in_progress', 'waiting_approval', 'waiting_quality_gate', 'completed', 'failed'
    current_book INTEGER DEFAULT 1, -- 1-5
    current_chapter INTEGER DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP DEFAULT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_workflow_author ON workflow_instances(author_id);
CREATE INDEX IF NOT EXISTS idx_workflow_series ON workflow_instances(series_id);
CREATE INDEX IF NOT EXISTS idx_workflow_status ON workflow_instances(phase_status);
CREATE INDEX IF NOT EXISTS idx_workflow_phase ON workflow_instances(current_phase);

-- Workflow phase history (audit trail)
CREATE TABLE IF NOT EXISTS workflow_phase_history (
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
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phase_history_workflow ON workflow_phase_history(workflow_id);
CREATE INDEX IF NOT EXISTS idx_phase_history_phase ON workflow_phase_history(phase_number);
CREATE INDEX IF NOT EXISTS idx_phase_history_status ON workflow_phase_history(status);

-- Workflow approvals (user checkpoints)
CREATE TABLE IF NOT EXISTS workflow_approvals (
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
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approvals_workflow ON workflow_approvals(workflow_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON workflow_approvals(status);
CREATE INDEX IF NOT EXISTS idx_approvals_type ON workflow_approvals(approval_type);

-- Workflow quality gates (NPE, Commercial validation)
CREATE TABLE IF NOT EXISTS workflow_quality_gates (
    id SERIAL PRIMARY KEY,
    workflow_id INTEGER REFERENCES workflow_instances(id) ON DELETE CASCADE,
    phase_number INTEGER NOT NULL,
    gate_type TEXT NOT NULL, -- 'npe_series', 'npe_scene', 'commercial'
    score DECIMAL(5,2) NOT NULL,
    passed BOOLEAN NOT NULL,
    violations JSONB DEFAULT '[]'::jsonb, -- Array of violation objects
    executed_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gates_workflow ON workflow_quality_gates(workflow_id);
CREATE INDEX IF NOT EXISTS idx_gates_type ON workflow_quality_gates(gate_type);
CREATE INDEX IF NOT EXISTS idx_gates_passed ON workflow_quality_gates(passed);

-- =============================================
-- PRODUCTION METRICS TABLES
-- =============================================

-- Production metrics (individual metrics)
CREATE TABLE IF NOT EXISTS production_metrics (
    id SERIAL PRIMARY KEY,
    workflow_id INTEGER REFERENCES workflow_instances(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
        -- 'words_written', 'chapters_completed', 'scenes_validated',
        -- 'planning_time_minutes', 'writing_time_minutes', 'revision_time_minutes',
        -- 'npe_score', 'commercial_score', 'agent_invocations', 'phase_duration_minutes'
    metric_value DECIMAL(10,2) NOT NULL,
    phase_number INTEGER,
    book_number INTEGER,
    chapter_number INTEGER,
    recorded_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_metrics_workflow ON production_metrics(workflow_id);
CREATE INDEX IF NOT EXISTS idx_metrics_type ON production_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_metrics_phase ON production_metrics(phase_number);
CREATE INDEX IF NOT EXISTS idx_metrics_book ON production_metrics(book_number);
CREATE INDEX IF NOT EXISTS idx_metrics_recorded ON production_metrics(recorded_at);

-- Daily writing stats (aggregated daily statistics)
CREATE TABLE IF NOT EXISTS daily_writing_stats (
    id SERIAL PRIMARY KEY,
    workflow_id INTEGER REFERENCES workflow_instances(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES authors(id) ON DELETE SET NULL,
    stat_date DATE NOT NULL,
    words_written INTEGER DEFAULT 0,
    chapters_completed INTEGER DEFAULT 0,
    scenes_written INTEGER DEFAULT 0,
    writing_time_minutes INTEGER DEFAULT 0,
    phases_completed INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(workflow_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_workflow ON daily_writing_stats(workflow_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_author ON daily_writing_stats(author_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_writing_stats(stat_date);

-- Phase performance analytics (system-wide analytics)
CREATE TABLE IF NOT EXISTS phase_performance (
    id SERIAL PRIMARY KEY,
    phase_number INTEGER NOT NULL UNIQUE,
    phase_name TEXT NOT NULL,
    total_executions INTEGER DEFAULT 0,
    successful_executions INTEGER DEFAULT 0,
    failed_executions INTEGER DEFAULT 0,
    avg_duration_minutes DECIMAL(10,2),
    avg_quality_score DECIMAL(5,2),
    last_execution TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_phase_perf_number ON phase_performance(phase_number);

-- Initialize phase performance rows for all 12 phases
INSERT INTO phase_performance (phase_number, phase_name) VALUES
    (-1, 'Not Started'),
    (0, 'Premise Development'),
    (1, 'Genre Pack Management'),
    (2, 'Market Research'),
    (3, 'Series Architect'),
    (4, 'NPE Validation'),
    (5, 'Commercial Validation'),
    (6, 'Writing Team Review'),
    (7, 'User Approval'),
    (8, 'MCP Commit'),
    (9, 'Chapter Planning'),
    (10, 'Scene Validation'),
    (11, 'Writing Execution'),
    (12, 'Book Production Loop')
ON CONFLICT (phase_number) DO NOTHING;

-- =============================================
-- REVISION WORKFLOW TABLES
-- =============================================

-- Revision passes (6-pass revision workflow)
CREATE TABLE IF NOT EXISTS revision_passes (
    id SERIAL PRIMARY KEY,
    workflow_id INTEGER REFERENCES workflow_instances(id) ON DELETE CASCADE,
    book_number INTEGER NOT NULL,
    pass_number INTEGER NOT NULL, -- 1-6
    pass_name TEXT NOT NULL, 
        -- 'structural', 'continuity', 'dialogue', 'emotional', 'line_edit', 'final_qa'
    status TEXT NOT NULL DEFAULT 'not_started', -- 'not_started', 'in_progress', 'complete'
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    duration_minutes DECIMAL(10,2),
    findings_summary TEXT,
    edits_made BOOLEAN DEFAULT FALSE,
    user_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(workflow_id, book_number, pass_number)
);

CREATE INDEX IF NOT EXISTS idx_revision_workflow ON revision_passes(workflow_id);
CREATE INDEX IF NOT EXISTS idx_revision_book ON revision_passes(book_number);
CREATE INDEX IF NOT EXISTS idx_revision_status ON revision_passes(status);

-- QA reports (publishing readiness checklists)
CREATE TABLE IF NOT EXISTS qa_reports (
    id SERIAL PRIMARY KEY,
    workflow_id INTEGER REFERENCES workflow_instances(id) ON DELETE CASCADE,
    book_number INTEGER NOT NULL,
    status TEXT NOT NULL, -- 'READY_TO_PUBLISH', 'NOT_READY', 'PENDING'
    npe_validation JSONB DEFAULT '{}'::jsonb,
    continuity_validation JSONB DEFAULT '{}'::jsonb,
    ku_optimization JSONB DEFAULT '{}'::jsonb,
    production_completeness JSONB DEFAULT '{}'::jsonb,
    metadata_validation JSONB DEFAULT '{}'::jsonb,
    blockers JSONB DEFAULT '[]'::jsonb,
    blocker_count INTEGER DEFAULT 0,
    recommendations JSONB DEFAULT '[]'::jsonb,
    estimated_time_to_ready_hours DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_qa_workflow ON qa_reports(workflow_id);
CREATE INDEX IF NOT EXISTS idx_qa_book ON qa_reports(book_number);
CREATE INDEX IF NOT EXISTS idx_qa_status ON qa_reports(status);

-- =============================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =============================================

-- Only create triggers if update_timestamp function exists
DO $trigger_block$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_timestamp') THEN
        -- Workflow instances trigger
        DROP TRIGGER IF EXISTS update_workflow_instances_timestamp ON workflow_instances;
        CREATE TRIGGER update_workflow_instances_timestamp
            BEFORE UPDATE ON workflow_instances
            FOR EACH ROW
            EXECUTE FUNCTION update_timestamp();

        -- Workflow phase history trigger
        DROP TRIGGER IF EXISTS update_workflow_phase_history_timestamp ON workflow_phase_history;
        CREATE TRIGGER update_workflow_phase_history_timestamp
            BEFORE UPDATE ON workflow_phase_history
            FOR EACH ROW
            EXECUTE FUNCTION update_timestamp();

        -- Workflow approvals trigger
        DROP TRIGGER IF EXISTS update_workflow_approvals_timestamp ON workflow_approvals;
        CREATE TRIGGER update_workflow_approvals_timestamp
            BEFORE UPDATE ON workflow_approvals
            FOR EACH ROW
            EXECUTE FUNCTION update_timestamp();

        -- Daily writing stats trigger
        DROP TRIGGER IF EXISTS update_daily_writing_stats_timestamp ON daily_writing_stats;
        CREATE TRIGGER update_daily_writing_stats_timestamp
            BEFORE UPDATE ON daily_writing_stats
            FOR EACH ROW
            EXECUTE FUNCTION update_timestamp();

        -- Phase performance trigger
        DROP TRIGGER IF EXISTS update_phase_performance_timestamp ON phase_performance;
        CREATE TRIGGER update_phase_performance_timestamp
            BEFORE UPDATE ON phase_performance
            FOR EACH ROW
            EXECUTE FUNCTION update_timestamp();

        -- Revision passes trigger
        DROP TRIGGER IF EXISTS update_revision_passes_timestamp ON revision_passes;
        CREATE TRIGGER update_revision_passes_timestamp
            BEFORE UPDATE ON revision_passes
            FOR EACH ROW
            EXECUTE FUNCTION update_timestamp();
    END IF;
END $trigger_block$;

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON TABLE workflow_instances IS 'Main workflow state tracking for novel series production';
COMMENT ON TABLE workflow_phase_history IS 'Audit trail of all phase executions';
COMMENT ON TABLE workflow_approvals IS 'User approval checkpoints throughout workflow';
COMMENT ON TABLE workflow_quality_gates IS 'NPE and commercial validation gate results';
COMMENT ON TABLE production_metrics IS 'Individual production metrics (words, time, scores)';
COMMENT ON TABLE daily_writing_stats IS 'Aggregated daily writing statistics for dashboards';
COMMENT ON TABLE phase_performance IS 'System-wide analytics for phase execution performance';
COMMENT ON TABLE revision_passes IS '6-pass revision workflow tracking per book';
COMMENT ON TABLE qa_reports IS 'Publishing readiness QA validation reports';

COMMENT ON COLUMN workflow_instances.current_phase IS 'Current phase (-1 to 12): -1=not started, 0=premise, 1=genre, 2=market, 3=series arch, 4=npe, 5=commercial, 6=team review, 7=user approval, 8=commit, 9=chapter planning, 10=scene validation, 11=writing, 12=book loop';
COMMENT ON COLUMN workflow_instances.phase_status IS 'Current status: in_progress, waiting_approval, waiting_quality_gate, completed, failed';
COMMENT ON COLUMN workflow_approvals.approval_type IS 'Type: series_plan (Phase 7), book_completion (Phase 12), chapter_plan (Phase 9)';
COMMENT ON COLUMN workflow_quality_gates.gate_type IS 'Type: npe_series (Phase 4), npe_scene (Phase 10), commercial (Phase 5)';
COMMENT ON COLUMN production_metrics.metric_type IS 'Metric type: words_written, chapters_completed, scenes_validated, planning_time_minutes, writing_time_minutes, revision_time_minutes, npe_score, commercial_score, agent_invocations, phase_duration_minutes';
COMMENT ON COLUMN revision_passes.pass_name IS '6 passes: structural, continuity, dialogue, emotional, line_edit, final_qa';

-- Record this migration
INSERT INTO migrations (filename) VALUES ('027_workflow_manager.sql')
ON CONFLICT DO NOTHING;

RAISE NOTICE 'Migration 027_workflow_manager.sql completed successfully.';
END $$;
