-- Migration 035: Add available_nodes column to active_workflows
-- This stores a snapshot of available nodes at registration time for quick access
-- Used by get-active-details command to show node names without re-querying workflow definition

DO $$
BEGIN
    -- Add available_nodes column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'fictionlab'
        AND table_name = 'active_workflows'
        AND column_name = 'available_nodes'
    ) THEN
        ALTER TABLE fictionlab.active_workflows
        ADD COLUMN available_nodes JSONB DEFAULT '[]'::jsonb;

        COMMENT ON COLUMN fictionlab.active_workflows.available_nodes IS
            'Array of available nodes in format [{id, name}]. Snapshot taken at workflow registration for quick status display.';

        RAISE NOTICE 'Added available_nodes column to fictionlab.active_workflows';
    ELSE
        RAISE NOTICE 'available_nodes column already exists in fictionlab.active_workflows';
    END IF;
END $$;
