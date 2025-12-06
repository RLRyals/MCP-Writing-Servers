
-- Migration: 025_create_workflow_manager_tables.sql
-- Description: DEPRECATED - Logic moved to 027_workflow_manager.sql to resolve conflicts
-- Date: 2025-12-03
DO $$
BEGIN
    -- Check if migration was already applied
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '025_create_workflow_manager_tables.sql') THEN
        RAISE NOTICE 'Migration 025_create_workflow_manager_tables.sql already applied, skipping.';
        RETURN;
    END IF;

    -- NOTE: Table creation logic has been moved to 027_workflow_manager.sql
    -- This migration now only records itself as applied to satisfy migration history constraints.
    RAISE NOTICE 'Migration 025 is deprecated. Skipping table creation (handled by 027).';

    -- Record this migration
    INSERT INTO migrations (filename) VALUES ('025_create_workflow_manager_tables.sql')
        ON CONFLICT (filename) DO NOTHING;

END $$;
