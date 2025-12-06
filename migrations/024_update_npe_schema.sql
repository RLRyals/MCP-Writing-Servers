-- =============================================
-- Migration 024: NPE Schema Check (Neutralized)
-- =============================================
-- This migration previously updated the NPE tables but has been neutralized
-- because the full schema is now correctly established in migration 023.
-- This file now serves as a pass-through check to ensure migration compatibility.
--
-- Run this migration on existing databases with:
-- psql -U your_user -d your_database -f migrations/024_update_npe_schema.sql

DO $$
BEGIN
    -- Check if migration was already applied
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '024_update_npe_schema.sql') THEN
        RAISE NOTICE 'Migration 024_update_npe_schema.sql already applied, skipping.';
        RETURN;
    END IF;

    -- =============================================
    -- NO ACTION REQUIRED
    -- =============================================
    -- The schema is fully defined in 023_npe_tables.sql.
    -- We perform no drops and no creations here to avoid conflicts.

    RAISE NOTICE 'Migration 024 verified (all work done in 023).';

    -- Record this migration
    INSERT INTO migrations (filename) VALUES ('024_update_npe_schema.sql')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Migration 024_update_npe_schema.sql completed successfully.';
END $$;
