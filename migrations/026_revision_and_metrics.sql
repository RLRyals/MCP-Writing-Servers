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
