-- Migration: 031_active_workflow_registry
-- DEPRECATED: Table creation logic removed - FictionLab schema (migration 032) is the canonical source
-- This migration now only records itself as applied for migration history.

DO $migration$
BEGIN
    -- Check if migration was already applied
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '031_active_workflow_registry.sql') THEN
        RAISE NOTICE 'Migration 031_active_workflow_registry.sql already applied, skipping.';
        RETURN;
    END IF;

    -- NOTE: Table creation logic has been removed - FictionLab schema is the canonical source
    -- Original table (active_workflow_registry) is now fictionlab.active_workflows via migration 032.
    RAISE NOTICE 'Migration 031 is deprecated. Skipping table creation (handled by 032 fictionlab schema).';

    -- Record this migration
    INSERT INTO migrations (filename) VALUES ('031_active_workflow_registry.sql')
        ON CONFLICT (filename) DO NOTHING;

END $migration$;
