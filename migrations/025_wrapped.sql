
-- Migration: 025_create_workflow_manager_tables.sql
-- Description: Workflow Manager tables for orchestrating the 12-phase novel writing pipeline
-- Date: 2025-12-03
DO $$
BEGIN
    -- Check if migration was already applied
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '025_create_workflow_manager_tables.sql') THEN
        RAISE NOTICE 'Migration 025_create_workflow_manager_tables.sql already applied, skipping.';
        RETURN;
    END IF;

-- Workflow Manager Tables

-- workflow_instances
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

-- workflow_phase_history
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

-- workflow_approvals
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

-- workflow_quality_gates
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

-- Record this migration
INSERT INTO migrations (filename) VALUES ('025_create_workflow_manager_tables.sql')
    ON CONFLICT (filename) DO NOTHING;

END $$;
