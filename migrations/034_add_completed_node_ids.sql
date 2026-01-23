-- Migration 034: Add Completed Node IDs Tracking
-- Description: Adds completed_node_ids column to track which specific nodes have completed.
-- This enables accurate status display when workflows have parallel node execution.
-- The UI can then show completed nodes in green regardless of execution order.

DO $$
BEGIN
    -- Check if migration was already applied
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '034_add_completed_node_ids.sql') THEN
        RAISE NOTICE 'Migration 034_add_completed_node_ids.sql already applied, skipping.';
        RETURN;
    END IF;

-- =============================================
-- ADD COMPLETED_NODE_IDS COLUMN
-- =============================================

-- Add completed_node_ids column to track specific completed nodes
-- This complements the existing completed_nodes count for parallel workflow support
ALTER TABLE fictionlab.active_workflows
ADD COLUMN IF NOT EXISTS completed_node_ids JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN fictionlab.active_workflows.completed_node_ids IS
    'Array of node IDs that have been completed. Supports parallel workflow execution where node completion order may not match node ID order.';

-- =============================================
-- ADD INDEX FOR COMPLETED NODE QUERIES
-- =============================================

-- Index to support queries filtering by specific completed nodes
CREATE INDEX IF NOT EXISTS idx_fictionlab_active_completed_node_ids
    ON fictionlab.active_workflows
    USING GIN (completed_node_ids);

RAISE NOTICE 'Added completed_node_ids column to fictionlab.active_workflows';

-- =============================================
-- RECORD MIGRATION
-- =============================================

INSERT INTO migrations (filename, applied_at)
VALUES ('034_add_completed_node_ids.sql', NOW());

RAISE NOTICE 'Migration 034_add_completed_node_ids.sql completed successfully';

END $$;
