-- Migration 030: Transform to Graph-Based Workflows (n8n-style)
-- DEPRECATED: Table/function creation logic removed - FictionLab schema (migration 032) is the canonical source
-- This migration now only records itself as applied for migration history.

DO $$
BEGIN
    -- Check if migration was already applied
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '030_graph_based_workflows.sql') THEN
        RAISE NOTICE 'Migration 030_graph_based_workflows.sql already applied, skipping.';
        RETURN;
    END IF;

    -- NOTE: Table creation and function creation logic has been removed - FictionLab schema is the canonical source
    -- Original alterations to workflow_definitions and workflow_instances, plus helper functions
    -- (add_workflow_node, add_workflow_edge, delete_workflow_node, etc.)
    -- are now defined in fictionlab schema via migration 032.
    RAISE NOTICE 'Migration 030 is deprecated. Skipping table/function creation (handled by 032 fictionlab schema).';

    -- Record this migration
    INSERT INTO migrations (filename) VALUES ('030_graph_based_workflows.sql')
        ON CONFLICT (filename) DO NOTHING;

END $$;
