-- Migration: 049_biz_deadlines_pipeline_items
-- Description: S15 slice 0 (S14 foundation) -- creates the two S14-spec'd
-- tables that were never built, with the S15 §0b `biz_` rename + company_id
-- rule applied retroactively.
-- Spec: FictIonLab-Downloads/specs/2026-07-07-broadquill-ops/
--   S14-broadquill-dashboard-plugin.md §4 (bq_deadlines/bq_pipeline_items DDL)
--   S15-broadquill-business-tracker.md §0b (biz_ rename + company_id NOT NULL
--   on every company-owned table, applied retroactively to S14's tables).
--
-- biz_deadlines and biz_pipeline_items depend on biz_companies (migration 048).

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '049_biz_deadlines_pipeline_items.sql') THEN
        RAISE NOTICE 'Migration 049_biz_deadlines_pipeline_items.sql already applied, skipping.';
        RETURN;
    END IF;

    CREATE SCHEMA IF NOT EXISTS fictionlab;

    -- =========================================================
    -- 1. biz_deadlines (S14 §4, renamed bq_ -> biz_ + company_id per S15 §0b)
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.biz_deadlines (
        id            BIGSERIAL PRIMARY KEY,
        company_id    BIGINT NOT NULL REFERENCES fictionlab.biz_companies(id),
        title         TEXT NOT NULL,
        due_date      DATE NOT NULL,
        recurrence    TEXT NOT NULL DEFAULT 'none',      -- none|monthly|quarterly|annual
        category      TEXT NOT NULL DEFAULT 'compliance',-- compliance|renewal|launch|custom
        notes         TEXT,
        done_at       TIMESTAMPTZ,                       -- set only for recurrence='none'
        snoozed_until DATE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_biz_deadlines_company ON fictionlab.biz_deadlines(company_id);

    COMMENT ON TABLE fictionlab.biz_deadlines IS 'Deadlines with recurrence rolling (S14 §4/§5, renamed from bq_deadlines per S15 §0b). complete rolls due_date forward one period for recurring rows instead of duplicating rows.';

    RAISE NOTICE 'Created fictionlab.biz_deadlines';

    -- =========================================================
    -- 2. biz_pipeline_items (S14 §4, renamed bq_ -> biz_ + company_id per S15 §0b)
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.biz_pipeline_items (
        id          BIGSERIAL PRIMARY KEY,
        company_id  BIGINT NOT NULL REFERENCES fictionlab.biz_companies(id),
        title       TEXT NOT NULL,                        -- book title
        persona     TEXT,                                 -- pen name / imprint
        stage       TEXT NOT NULL DEFAULT 'dossier',
            -- dossier|outline|draft|edit|cover|format|upload|live
        target_date DATE,
        notes       TEXT,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_biz_pipeline_items_company ON fictionlab.biz_pipeline_items(company_id);

    COMMENT ON TABLE fictionlab.biz_pipeline_items IS 'Book pipeline stage tracker (S14 §4, renamed from bq_pipeline_items per S15 §0b).';

    RAISE NOTICE 'Created fictionlab.biz_pipeline_items';

    -- =========================================================
    -- Trigger -- reuse the schema-generic updated_at trigger from migration
    -- 042 (fictionlab.kanban_update_timestamp only touches NEW.updated_at).
    -- biz_deadlines has no updated_at column (S14 spec), so no trigger there.
    -- =========================================================

    DROP TRIGGER IF EXISTS trigger_biz_pipeline_items_update_timestamp ON fictionlab.biz_pipeline_items;
    CREATE TRIGGER trigger_biz_pipeline_items_update_timestamp
        BEFORE UPDATE ON fictionlab.biz_pipeline_items
        FOR EACH ROW
        EXECUTE FUNCTION fictionlab.kanban_update_timestamp();

    RAISE NOTICE 'Created updated_at trigger on biz_pipeline_items';

    INSERT INTO migrations (filename) VALUES ('049_biz_deadlines_pipeline_items.sql')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Migration 049_biz_deadlines_pipeline_items.sql completed successfully';
    RAISE NOTICE '=================================================================';
END $$;
