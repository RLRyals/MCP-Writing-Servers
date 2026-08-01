-- Migration: 051_biz_savings_goals
-- Description: S15 slice 4 (business tracker) -- biz_savings_goals.
-- Spec: FictIonLab-Downloads/specs/2026-07-07-broadquill-ops/
--   S15-broadquill-business-tracker.md §4a (biz_savings_goals DDL) + §0b
--   (company_id NOT NULL on every company-owned table) + §7 slice 4.
--
-- Note on migration numbering: slices 0 and 2 of this same design doc
-- (beads mws-4x1 / migration 049, mws-s7v / migration 050) were in flight
-- as concurrent unmerged PRs at the same time as this slice; 051 is used
-- here to avoid a filename collision between the three in-flight PRs.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '051_biz_savings_goals.sql') THEN
        RAISE NOTICE 'Migration 051_biz_savings_goals.sql already applied, skipping.';
        RETURN;
    END IF;

    CREATE SCHEMA IF NOT EXISTS fictionlab;

    -- =========================================================
    -- biz_savings_goals (S15 §4a, + company_id per §0b)
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.biz_savings_goals (
        id             BIGSERIAL PRIMARY KEY,
        company_id     BIGINT NOT NULL REFERENCES fictionlab.biz_companies(id),
        name           TEXT NOT NULL,
        target_amount  NUMERIC(12,2) NOT NULL,
        current_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        target_date    DATE,
        account_id     BIGINT REFERENCES fictionlab.biz_accounts(id) ON DELETE SET NULL,
        status         TEXT NOT NULL DEFAULT 'active',     -- active|reached|abandoned
        notes          TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_biz_savings_goals_company ON fictionlab.biz_savings_goals(company_id);

    COMMENT ON TABLE fictionlab.biz_savings_goals IS 'Savings goals (S15 §4a). Dashboard-only, deliberately not wired to notifications -- low progress is not a deadline (§6).';

    RAISE NOTICE 'Created fictionlab.biz_savings_goals';

    -- =========================================================
    -- Trigger -- reuse the schema-generic updated_at trigger from
    -- migration 042 (fictionlab.kanban_update_timestamp only touches
    -- NEW.updated_at).
    -- =========================================================

    DROP TRIGGER IF EXISTS trigger_biz_savings_goals_update_timestamp ON fictionlab.biz_savings_goals;
    CREATE TRIGGER trigger_biz_savings_goals_update_timestamp
        BEFORE UPDATE ON fictionlab.biz_savings_goals
        FOR EACH ROW
        EXECUTE FUNCTION fictionlab.kanban_update_timestamp();

    RAISE NOTICE 'Created updated_at trigger on biz_savings_goals';

    INSERT INTO migrations (filename) VALUES ('051_biz_savings_goals.sql')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Migration 051_biz_savings_goals.sql completed successfully';
    RAISE NOTICE '=================================================================';
END $$;
