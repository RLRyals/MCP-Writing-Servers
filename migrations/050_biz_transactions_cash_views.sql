-- Migration: 050_biz_transactions_cash_views
-- Description: S15 slice 2 (business tracker) -- biz_transactions plus the
-- read-only cash-position/category-totals reporting views.
-- Spec: FictIonLab-Downloads/specs/2026-07-07-broadquill-ops/
--   S15-broadquill-business-tracker.md §4a (biz_transactions DDL) + §4a
--   "Reports decision" (views instead of a materialized reports table) + §7
--   slice 2.
--
-- Note on migration numbering: this repo's slice 0 (biz_deadlines +
-- biz_pipeline_items, bead mws-4x1) was in flight as migration 049 at the
-- same time as this slice; 050 is used here to avoid a filename collision
-- between the two in-flight PRs.
--
-- Note on biz_transactions.subscription_id: the spec's DDL FKs this column
-- into fictionlab.biz_subscriptions, but that table is built in S15 slice 3
-- (bead mws-jcw), which is NOT a dependency of this slice. The column is
-- created here as a plain nullable BIGINT (no FK yet); slice 3 must add
-- `ALTER TABLE fictionlab.biz_transactions ADD CONSTRAINT
-- biz_transactions_subscription_id_fkey FOREIGN KEY (subscription_id)
-- REFERENCES fictionlab.biz_subscriptions(id) ON DELETE SET NULL` once
-- biz_subscriptions exists.
--
-- Note on the idempotent-import dedupe key (§5b pillar 1): the importer's
-- dedupe key is (account_id, occurred_on, amount, normalized_description).
-- "Normalized description" is a derived value the importer computes from
-- the `description` column at import time (lowercased/whitespace-collapsed
-- etc.) -- no separate stored column is needed for the schema to support it.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '050_biz_transactions_cash_views.sql') THEN
        RAISE NOTICE 'Migration 050_biz_transactions_cash_views.sql already applied, skipping.';
        RETURN;
    END IF;

    CREATE SCHEMA IF NOT EXISTS fictionlab;

    -- =========================================================
    -- 1. biz_transactions (S15 §4a)
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.biz_transactions (
        id                BIGSERIAL PRIMARY KEY,
        account_id        BIGINT NOT NULL REFERENCES fictionlab.biz_accounts(id) ON DELETE CASCADE,
        occurred_on       DATE NOT NULL,
        amount            NUMERIC(12,2) NOT NULL,             -- positive; sign comes from direction
        direction         TEXT NOT NULL,                      -- income|expense|transfer
        category          TEXT,
        vendor_contact_id BIGINT REFERENCES fictionlab.biz_contacts(id) ON DELETE SET NULL,
        book_ref          TEXT,                                -- free-text label, NOT an FK (§0/§2 -- canon DB is truth)
        subscription_id   BIGINT,                               -- FK added in S15 slice 3 once biz_subscriptions exists (see note above)
        description       TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_biz_transactions_account ON fictionlab.biz_transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_biz_transactions_occurred_on ON fictionlab.biz_transactions(occurred_on);
    -- Supports the importer's (account_id, occurred_on, amount, normalized_description)
    -- dedupe lookup (§5b pillar 1) -- description itself, not a normalized copy.
    CREATE INDEX IF NOT EXISTS idx_biz_transactions_dedupe_lookup
        ON fictionlab.biz_transactions(account_id, occurred_on, amount, description);

    COMMENT ON TABLE fictionlab.biz_transactions IS 'Finance transactions (S15 §4a). System of record is the card statement import (§5b pillar 1); manual quick-add is an edge-case fallback only.';

    RAISE NOTICE 'Created fictionlab.biz_transactions';

    -- =========================================================
    -- 2. Reporting views (S15 §4a "Reports decision" -- read-only views,
    -- not a materialized table needing its own write path)
    -- =========================================================

    -- Cash position per account: opening_balance plus net of income/expense
    -- transactions to date. Transfer rows have no destination-account column
    -- in this schema yet, so they are excluded from the running balance
    -- (flagged here, not guessed at) until a to_account_id (or a paired
    -- second leg convention) is designed.
    CREATE OR REPLACE VIEW fictionlab.biz_v_cash_position AS
    SELECT
        a.id AS account_id,
        a.company_id,
        a.name AS account_name,
        a.account_type,
        a.opening_balance,
        a.opening_balance + COALESCE(SUM(
            CASE
                WHEN t.direction = 'income' THEN t.amount
                WHEN t.direction = 'expense' THEN -t.amount
                ELSE 0  -- transfer: excluded until a destination-account column exists
            END
        ), 0) AS current_balance
    FROM fictionlab.biz_accounts a
    LEFT JOIN fictionlab.biz_transactions t ON t.account_id = a.id
    WHERE a.is_archived = FALSE
    GROUP BY a.id, a.company_id, a.name, a.account_type, a.opening_balance;

    COMMENT ON VIEW fictionlab.biz_v_cash_position IS 'Read-only cash position per active account (S15 §4a Reports decision). Transfer transactions net to 0 here pending a destination-account column.';

    -- Category rollups per company per month, net of income/expense.
    CREATE OR REPLACE VIEW fictionlab.biz_v_monthly_category_totals AS
    SELECT
        a.company_id,
        date_trunc('month', t.occurred_on)::date AS month,
        t.category,
        SUM(
            CASE
                WHEN t.direction = 'income' THEN t.amount
                WHEN t.direction = 'expense' THEN -t.amount
                ELSE 0
            END
        ) AS net_amount
    FROM fictionlab.biz_transactions t
    JOIN fictionlab.biz_accounts a ON a.id = t.account_id
    GROUP BY a.company_id, date_trunc('month', t.occurred_on), t.category;

    COMMENT ON VIEW fictionlab.biz_v_monthly_category_totals IS 'Read-only monthly category rollups per company (S15 §4a Reports decision).';

    RAISE NOTICE 'Created fictionlab.biz_v_cash_position, fictionlab.biz_v_monthly_category_totals';

    INSERT INTO migrations (filename) VALUES ('050_biz_transactions_cash_views.sql')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Migration 050_biz_transactions_cash_views.sql completed successfully';
    RAISE NOTICE '=================================================================';
END $$;
