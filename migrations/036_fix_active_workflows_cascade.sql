-- Migration: 036_fix_active_workflows_cascade
-- Description: Fix foreign key constraint on active_workflows to use ON DELETE CASCADE
-- Problem: workflow_id is NOT NULL but FK uses ON DELETE SET NULL, causing constraint violation

DO $$
BEGIN
    -- Check if migration was already applied
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '036_fix_active_workflows_cascade.sql') THEN
        RAISE NOTICE 'Migration 036_fix_active_workflows_cascade.sql already applied, skipping.';
        RETURN;
    END IF;

    -- Drop the existing foreign key constraint
    ALTER TABLE fictionlab.active_workflows
        DROP CONSTRAINT IF EXISTS fk_active_workflow_def;

    -- Re-create with ON DELETE CASCADE
    ALTER TABLE fictionlab.active_workflows
        ADD CONSTRAINT fk_active_workflow_def
        FOREIGN KEY (workflow_id)
        REFERENCES fictionlab.workflow_definitions(workflow_id)
        ON DELETE CASCADE
        DEFERRABLE INITIALLY DEFERRED;

    RAISE NOTICE 'Changed active_workflows.workflow_id FK from ON DELETE SET NULL to ON DELETE CASCADE';

    -- Record migration
    INSERT INTO migrations (filename) VALUES ('036_fix_active_workflows_cascade.sql')
        ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 036_fix_active_workflows_cascade.sql completed successfully';

END $$;
