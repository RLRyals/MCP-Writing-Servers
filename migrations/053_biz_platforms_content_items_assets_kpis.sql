-- Migration: 053_biz_platforms_content_items_assets_kpis
-- Description: S15 slice 5 (business tracker) -- Content Manager tables:
-- biz_platforms, biz_content_items, biz_assets, biz_kpis.
-- Spec: FictIonLab-Downloads/specs/2026-07-07-broadquill-ops/
--   S15-broadquill-business-tracker.md §4b (DDL) + §0b (company_id NOT NULL
--   on every company-owned table; UNIQUE(company_id, name) on biz_platforms,
--   not a globally-unique name) + §5b pillar 2 (biz_assets.transaction_id,
--   receipt link, nullable until reconciled) + §7 slice 5.
--
-- company_id placement per §0b: biz_platforms and biz_content_items are
-- directly company-owned, so they carry company_id NOT NULL like every
-- other biz_* table. biz_assets is likewise directly company-owned (its
-- content_item_id/transaction_id/platform_id links are all nullable, so it
-- cannot rely on a transitive FK for scoping). biz_kpis is the one
-- exception, called out explicitly in §0b: "biz_kpis's (platform_id,
-- metric_name, metric_date) is already company-scoped transitively via
-- platform" -- no direct company_id column there.
--
-- Note on migration numbering: this repo had two other S15 slices in
-- flight as concurrent unmerged PRs at the same time as this one (mws-jcw /
-- migration 052); 053 is used here to avoid a filename collision.
--
-- Depends on: fictionlab.biz_companies (migration 048) and
-- fictionlab.biz_transactions (migration 050, for biz_assets.transaction_id).

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '053_biz_platforms_content_items_assets_kpis.sql') THEN
        RAISE NOTICE 'Migration 053_biz_platforms_content_items_assets_kpis.sql already applied, skipping.';
        RETURN;
    END IF;

    CREATE SCHEMA IF NOT EXISTS fictionlab;

    -- =========================================================
    -- 1. biz_platforms (S15 §4b, + company_id per §0b)
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.biz_platforms (
        id             BIGSERIAL PRIMARY KEY,
        company_id     BIGINT NOT NULL REFERENCES fictionlab.biz_companies(id),
        name           TEXT NOT NULL,                      -- e.g. "Amazon KDP", "Instagram", "Newsletter/Flodesk"
        platform_type  TEXT,                                -- retail|social|email|other
        handle_or_url  TEXT,
        notes          TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (company_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_biz_platforms_company ON fictionlab.biz_platforms(company_id);

    COMMENT ON TABLE fictionlab.biz_platforms IS 'Content/marketing platforms (S15 §4b). name is UNIQUE per company (§0b), not globally unique.';

    RAISE NOTICE 'Created fictionlab.biz_platforms';

    -- =========================================================
    -- 2. biz_content_items (S15 §4b, + company_id per §0b)
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.biz_content_items (
        id             BIGSERIAL PRIMARY KEY,
        company_id     BIGINT NOT NULL REFERENCES fictionlab.biz_companies(id),
        title          TEXT NOT NULL,
        content_type   TEXT NOT NULL DEFAULT 'social_post', -- newsletter_ref|blog|social_post|video|other
        platform_id    BIGINT REFERENCES fictionlab.biz_platforms(id) ON DELETE SET NULL,
        status         TEXT NOT NULL DEFAULT 'idea',        -- idea|draft|scheduled|published
        publish_date   DATE,
        book_ref       TEXT,                                 -- free-text, not FK (§0/§2)
        external_ref   TEXT,                                 -- URL, or for content_type='newsletter_ref' the issue filename
        notes          TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_biz_content_items_company ON fictionlab.biz_content_items(company_id);
    CREATE INDEX IF NOT EXISTS idx_biz_content_items_platform ON fictionlab.biz_content_items(platform_id);
    CREATE INDEX IF NOT EXISTS idx_biz_content_items_publish_date ON fictionlab.biz_content_items(publish_date);

    COMMENT ON TABLE fictionlab.biz_content_items IS 'Content calendar items (S15 §4b). content_type=newsletter_ref rows are a calendar projection only -- markdown files stay the source of truth for newsletter issues.';

    RAISE NOTICE 'Created fictionlab.biz_content_items';

    -- =========================================================
    -- 3. biz_assets (S15 §4b + §5b pillar 2, + company_id per §0b)
    -- transaction_id added here directly (not a later ALTER) since this
    -- slice is the first time biz_assets is created.
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.biz_assets (
        id              BIGSERIAL PRIMARY KEY,
        company_id      BIGINT NOT NULL REFERENCES fictionlab.biz_companies(id),
        content_item_id BIGINT REFERENCES fictionlab.biz_content_items(id) ON DELETE SET NULL,
        transaction_id  BIGINT REFERENCES fictionlab.biz_transactions(id) ON DELETE SET NULL,
            -- receipt photos link here (§5b pillar 2); NULL until reconciled
        title           TEXT NOT NULL,
        asset_type      TEXT NOT NULL DEFAULT 'image',       -- image|video|audio|doc|receipt
        path_or_url     TEXT NOT NULL,                        -- pointer only, not storage
        platform_id     BIGINT REFERENCES fictionlab.biz_platforms(id) ON DELETE SET NULL,
        tags            TEXT[] DEFAULT '{}',
        notes           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_biz_assets_company ON fictionlab.biz_assets(company_id);
    CREATE INDEX IF NOT EXISTS idx_biz_assets_content_item ON fictionlab.biz_assets(content_item_id);
    CREATE INDEX IF NOT EXISTS idx_biz_assets_transaction ON fictionlab.biz_assets(transaction_id);

    COMMENT ON TABLE fictionlab.biz_assets IS 'Asset pointers, incl. receipts (S15 §4b/§5b pillar 2). path_or_url points at files already produced elsewhere -- never a second copy of binary storage. transaction_id links a reconciled receipt to its transaction; NULL until matched.';

    RAISE NOTICE 'Created fictionlab.biz_assets';

    -- =========================================================
    -- 4. biz_kpis (S15 §4b -- transitively company-scoped via platform_id
    -- per §0b, no direct company_id column)
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.biz_kpis (
        id             BIGSERIAL PRIMARY KEY,
        platform_id    BIGINT REFERENCES fictionlab.biz_platforms(id) ON DELETE SET NULL,
        metric_name    TEXT NOT NULL,                        -- e.g. "kdp_units", "newsletter_open_rate"
        metric_date    DATE NOT NULL,
        value          NUMERIC NOT NULL,
        notes          TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (platform_id, metric_name, metric_date)
    );

    CREATE INDEX IF NOT EXISTS idx_biz_kpis_platform ON fictionlab.biz_kpis(platform_id);

    COMMENT ON TABLE fictionlab.biz_kpis IS 'Platform KPI time series (S15 §4b). No direct company_id -- already company-scoped transitively via platform_id (§0b).';

    RAISE NOTICE 'Created fictionlab.biz_kpis';

    -- =========================================================
    -- Triggers -- reuse the schema-generic updated_at trigger from
    -- migration 042 (fictionlab.kanban_update_timestamp only touches
    -- NEW.updated_at). biz_assets and biz_kpis are append-mostly and have
    -- no updated_at column (§4d), so no trigger for those two.
    -- =========================================================

    DROP TRIGGER IF EXISTS trigger_biz_platforms_update_timestamp ON fictionlab.biz_platforms;
    CREATE TRIGGER trigger_biz_platforms_update_timestamp
        BEFORE UPDATE ON fictionlab.biz_platforms
        FOR EACH ROW
        EXECUTE FUNCTION fictionlab.kanban_update_timestamp();

    DROP TRIGGER IF EXISTS trigger_biz_content_items_update_timestamp ON fictionlab.biz_content_items;
    CREATE TRIGGER trigger_biz_content_items_update_timestamp
        BEFORE UPDATE ON fictionlab.biz_content_items
        FOR EACH ROW
        EXECUTE FUNCTION fictionlab.kanban_update_timestamp();

    RAISE NOTICE 'Created updated_at triggers on biz_platforms, biz_content_items';

    INSERT INTO migrations (filename) VALUES ('053_biz_platforms_content_items_assets_kpis.sql')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Migration 053_biz_platforms_content_items_assets_kpis.sql completed successfully';
    RAISE NOTICE '=================================================================';
END $$;
