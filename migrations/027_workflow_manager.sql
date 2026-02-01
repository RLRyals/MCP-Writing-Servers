-- Migration 027: Workflow Manager Tables
-- DEPRECATED: Table creation logic removed - FictionLab schema (migration 032) is the canonical source
-- This migration now only records itself as applied for migration history.

DO $$
BEGIN
    -- Check if migration was already applied
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '027_workflow_manager.sql') THEN
        RAISE NOTICE 'Migration 027_workflow_manager.sql already applied, skipping.';
        RETURN;
    END IF;

    -- NOTE: Table creation logic has been removed - FictionLab schema is the canonical source
    -- Original tables (workflow_instances, workflow_phase_history, workflow_approvals, etc.)
    -- are no longer created. Use fictionlab.* tables instead via migration 032.
    RAISE NOTICE 'Migration 027 is deprecated. Skipping table creation (handled by 032 fictionlab schema).';

    -- Record this migration
    INSERT INTO migrations (filename) VALUES ('027_workflow_manager.sql')
        ON CONFLICT (filename) DO NOTHING;

END $$;
