-- Migration 033: Add Breadcrumb Tracking to Active Workflows
-- Description: Adds breadcrumb and parent_workflow_id columns to track nested workflow execution
-- This enables clients to know the exact position within subworkflows when switching between
-- FictionLab UI, Claude Code, and TypingMind during a "workflow of workflows" execution.

DO $$
BEGIN
    -- Check if migration was already applied
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '033_add_workflow_breadcrumb.sql') THEN
        RAISE NOTICE 'Migration 033_add_workflow_breadcrumb.sql already applied, skipping.';
        RETURN;
    END IF;

-- =============================================
-- ADD BREADCRUMB COLUMN
-- =============================================

-- Add breadcrumb column to track navigation path through nested workflows
-- Format: Array of { workflowId, workflowName, nodeId, nodeName, subWorkflowRegistryId? }
ALTER TABLE fictionlab.active_workflows
ADD COLUMN IF NOT EXISTS breadcrumb JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN fictionlab.active_workflows.breadcrumb IS
    'Breadcrumb trail for nested workflow execution. Array of objects with workflowId, workflowName, nodeId, nodeName, and optional subWorkflowRegistryId';

-- =============================================
-- ADD PARENT WORKFLOW ID COLUMN
-- =============================================

-- Add parent_workflow_id to link subworkflow instances to their parent
ALTER TABLE fictionlab.active_workflows
ADD COLUMN IF NOT EXISTS parent_workflow_id UUID;

-- Add foreign key constraint (self-referencing for parent-child relationship)
-- Using DEFERRABLE for flexibility during inserts
ALTER TABLE fictionlab.active_workflows
ADD CONSTRAINT fk_parent_workflow
    FOREIGN KEY (parent_workflow_id)
    REFERENCES fictionlab.active_workflows(id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

COMMENT ON COLUMN fictionlab.active_workflows.parent_workflow_id IS
    'Parent workflow registry ID if this is a subworkflow execution';

-- =============================================
-- ADD INDEX FOR PARENT WORKFLOW QUERIES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_fictionlab_active_parent
    ON fictionlab.active_workflows(parent_workflow_id)
    WHERE parent_workflow_id IS NOT NULL;

RAISE NOTICE 'Added breadcrumb and parent_workflow_id columns to fictionlab.active_workflows';

-- =============================================
-- RECORD MIGRATION
-- =============================================

INSERT INTO migrations (filename, applied_at)
VALUES ('033_add_workflow_breadcrumb.sql', NOW());

RAISE NOTICE 'Migration 033_add_workflow_breadcrumb.sql completed successfully';

END $$;
