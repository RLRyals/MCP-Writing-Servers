-- Migration 028: Workflow Definitions & Generic Workflow Support
-- DEPRECATED: Table creation logic removed - FictionLab schema (migration 032) is the canonical source
-- This migration now only records itself as applied for migration history.

DO $$
BEGIN
    -- Check if migration was already applied
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '028_workflow_definitions.sql') THEN
        RAISE NOTICE 'Migration 028_workflow_definitions.sql already applied, skipping.';
        RETURN;
    END IF;

    -- NOTE: Table creation logic has been removed - FictionLab schema is the canonical source
    -- Original tables (workflow_definitions, workflow_versions, workflow_version_locks, etc.)
    -- are no longer created. Use fictionlab.* tables instead via migration 032.
    RAISE NOTICE 'Migration 028 is deprecated. Skipping table creation (handled by 032 fictionlab schema).';

    -- Record this migration
    INSERT INTO migrations (filename) VALUES ('028_workflow_definitions.sql')
        ON CONFLICT (filename) DO NOTHING;

END $$;
