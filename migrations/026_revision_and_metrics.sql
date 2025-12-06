-- ============================================
-- Migration 026: Revision Workflow & Production Metrics
-- ============================================
-- Purpose: DEPRECATED - Logic moved to 027_workflow_manager.sql
-- Date: 2025-12-03
-- Dependencies: 025_wrapped.sql

DO $$ 
BEGIN
    RAISE NOTICE 'Migration 026 is deprecated. Skipping table creation (handled by 027).';
    -- No-op: Table creation logic for revision_passes, production_metrics, etc. 
    -- is now handled idempotently in 027_workflow_manager.sql
END $$;
