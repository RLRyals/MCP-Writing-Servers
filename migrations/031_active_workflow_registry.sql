-- Migration: 031_active_workflow_registry
-- Description: Create table for tracking active workflow instances across all sources
-- (FictionLab UI, Claude Code, TypingMind)

DO $migration$
BEGIN
    -- Check if migration was already applied
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '031_active_workflow_registry.sql') THEN
        RAISE NOTICE 'Migration 031_active_workflow_registry.sql already applied, skipping.';
        RETURN;
    END IF;

-- Active workflow registry table
CREATE TABLE IF NOT EXISTS active_workflow_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_def_id VARCHAR(255) NOT NULL,
    workflow_name VARCHAR(255),
    source VARCHAR(50) NOT NULL CHECK (source IN ('fictionlab_ui', 'claude_code', 'typingmind')),
    project_folder VARCHAR(1000),
    project_name VARCHAR(255),
    current_node_id VARCHAR(255),
    current_node_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'failed', 'cancelled')),
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    total_nodes INTEGER DEFAULT 0,
    completed_nodes INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',

    -- Foreign key to workflow definitions (optional, may reference external workflows)
    CONSTRAINT fk_workflow_def FOREIGN KEY (workflow_def_id)
        REFERENCES workflow_definitions(id) ON DELETE SET NULL
        DEFERRABLE INITIALLY DEFERRED
);

-- Make foreign key optional by allowing NULL or non-existent references
ALTER TABLE active_workflow_registry DROP CONSTRAINT IF EXISTS fk_workflow_def;
ALTER TABLE active_workflow_registry
    ADD CONSTRAINT fk_workflow_def FOREIGN KEY (workflow_def_id)
    REFERENCES workflow_definitions(id) ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_active_registry_status ON active_workflow_registry(status);
CREATE INDEX IF NOT EXISTS idx_active_registry_source ON active_workflow_registry(source);
CREATE INDEX IF NOT EXISTS idx_active_registry_workflow_def ON active_workflow_registry(workflow_def_id);
CREATE INDEX IF NOT EXISTS idx_active_registry_project ON active_workflow_registry(project_folder);
CREATE INDEX IF NOT EXISTS idx_active_registry_started ON active_workflow_registry(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_active_registry_updated ON active_workflow_registry(updated_at DESC);

-- Composite index for filtering active workflows
CREATE INDEX IF NOT EXISTS idx_active_registry_active ON active_workflow_registry(status, source)
    WHERE status IN ('running', 'paused');

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_active_workflow_registry_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating timestamp
DROP TRIGGER IF EXISTS trigger_update_active_workflow_registry_timestamp ON active_workflow_registry;
CREATE TRIGGER trigger_update_active_workflow_registry_timestamp
    BEFORE UPDATE ON active_workflow_registry
    FOR EACH ROW
    EXECUTE FUNCTION update_active_workflow_registry_timestamp();

-- View for active (running or paused) workflows only
CREATE OR REPLACE VIEW active_workflows_view AS
SELECT
    awr.id,
    awr.workflow_def_id,
    COALESCE(awr.workflow_name, wd.name) as workflow_name,
    awr.source,
    awr.project_folder,
    awr.project_name,
    awr.current_node_id,
    awr.current_node_name,
    awr.status,
    awr.progress_percent,
    awr.total_nodes,
    awr.completed_nodes,
    awr.started_at,
    awr.updated_at,
    awr.metadata,
    -- Get available nodes from the workflow definition graph
    COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('id', n->>'id', 'name', n->>'name'))
         FROM jsonb_array_elements(wd.graph_json->'nodes') n),
        '[]'::jsonb
    ) as available_nodes
FROM active_workflow_registry awr
LEFT JOIN workflow_definitions wd ON awr.workflow_def_id = wd.id
WHERE awr.status IN ('running', 'paused');

-- Comment on table
COMMENT ON TABLE active_workflow_registry IS 'Tracks all active workflow instances across FictionLab UI, Claude Code, and TypingMind';
COMMENT ON COLUMN active_workflow_registry.source IS 'Origin of the workflow: fictionlab_ui, claude_code, or typingmind';
COMMENT ON COLUMN active_workflow_registry.status IS 'Current status: running, paused, completed, failed, or cancelled';

-- Record this migration
INSERT INTO migrations (filename) VALUES ('031_active_workflow_registry.sql')
ON CONFLICT DO NOTHING;

RAISE NOTICE 'Migration 031_active_workflow_registry.sql completed successfully.';
END $migration$;
