-- Migration: 052_biz_subscriptions_debts_book_pnl
-- Description: S15 slice 3 (business tracker) -- biz_subscriptions +
-- biz_debts, both FK'd into the existing biz_deadlines (S14/slice 0) so
-- renewal/payment-due dates ride S14's recurrence-rolling/snooze/alert-window
-- logic instead of a second copy, plus the per-book P&L reporting view.
-- Spec: FictIonLab-Downloads/specs/2026-07-07-broadquill-ops/
--   S15-broadquill-business-tracker.md §4a (biz_subscriptions/biz_debts DDL +
--   "Reports decision" for biz_v_book_pnl) + §7 slice 3.
--
-- Also backfills the FK on biz_transactions.subscription_id that migration
-- 050 deliberately left as a plain BIGINT (biz_subscriptions did not exist
-- yet at that point -- see 050's note).
--
-- Depends on: fictionlab.biz_companies + biz_contacts + biz_accounts
-- (migration 048), fictionlab.biz_deadlines (migration 049), and
-- fictionlab.biz_transactions (migration 050).

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '052_biz_subscriptions_debts_book_pnl.sql') THEN
        RAISE NOTICE 'Migration 052_biz_subscriptions_debts_book_pnl.sql already applied, skipping.';
        RETURN;
    END IF;

    CREATE SCHEMA IF NOT EXISTS fictionlab;

    -- =========================================================
    -- 1. biz_subscriptions (S15 §4a)
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.biz_subscriptions (
        id                BIGSERIAL PRIMARY KEY,
        company_id        BIGINT NOT NULL REFERENCES fictionlab.biz_companies(id),
        name              TEXT NOT NULL,
        vendor_contact_id BIGINT REFERENCES fictionlab.biz_contacts(id) ON DELETE SET NULL,
        account_id        BIGINT REFERENCES fictionlab.biz_accounts(id) ON DELETE SET NULL,
        amount            NUMERIC(12,2) NOT NULL,
        cadence           TEXT NOT NULL DEFAULT 'monthly',    -- monthly|quarterly|annual
        category          TEXT,
        deadline_id       BIGINT REFERENCES fictionlab.biz_deadlines(id) ON DELETE SET NULL,
            -- the renewal's due date lives in biz_deadlines (category='renewal'), reusing
            -- S14's recurrence-rolling/snooze/alert-window logic instead of a second copy
        is_active         BOOLEAN NOT NULL DEFAULT TRUE,
        notes             TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_biz_subscriptions_company ON fictionlab.biz_subscriptions(company_id);
    CREATE INDEX IF NOT EXISTS idx_biz_subscriptions_deadline ON fictionlab.biz_subscriptions(deadline_id);

    COMMENT ON TABLE fictionlab.biz_subscriptions IS 'Recurring subscriptions (S15 §4a). Renewal due date lives in biz_deadlines (category=renewal) via deadline_id, riding S14''s existing recurrence/snooze/alert logic.';

    RAISE NOTICE 'Created fictionlab.biz_subscriptions';

    -- =========================================================
    -- 2. biz_debts (S15 §4a)
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.biz_debts (
        id                  BIGSERIAL PRIMARY KEY,
        company_id          BIGINT NOT NULL REFERENCES fictionlab.biz_companies(id),
        name                TEXT NOT NULL,
        creditor_contact_id BIGINT REFERENCES fictionlab.biz_contacts(id) ON DELETE SET NULL,
        principal           NUMERIC(12,2) NOT NULL,
        balance             NUMERIC(12,2) NOT NULL,
        apr                 NUMERIC(5,2),
        minimum_payment     NUMERIC(12,2),
        deadline_id         BIGINT REFERENCES fictionlab.biz_deadlines(id) ON DELETE SET NULL,
            -- recurring payment-due date, same reuse pattern as biz_subscriptions
        payoff_target_date  DATE,
        status              TEXT NOT NULL DEFAULT 'active',     -- active|paid_off
        notes               TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_biz_debts_company ON fictionlab.biz_debts(company_id);
    CREATE INDEX IF NOT EXISTS idx_biz_debts_deadline ON fictionlab.biz_debts(deadline_id);

    COMMENT ON TABLE fictionlab.biz_debts IS 'Debts with payoff tracking (S15 §4a). Payment-due date lives in biz_deadlines via deadline_id, same reuse pattern as biz_subscriptions.';

    RAISE NOTICE 'Created fictionlab.biz_debts';

    -- =========================================================
    -- 3. Backfill the biz_transactions.subscription_id FK (deferred by
    -- migration 050 since biz_subscriptions did not exist yet)
    -- =========================================================
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'biz_transactions_subscription_id_fkey'
    ) THEN
        ALTER TABLE fictionlab.biz_transactions
            ADD CONSTRAINT biz_transactions_subscription_id_fkey
            FOREIGN KEY (subscription_id) REFERENCES fictionlab.biz_subscriptions(id) ON DELETE SET NULL;
    END IF;

    RAISE NOTICE 'Backfilled biz_transactions.subscription_id FK -> biz_subscriptions';

    -- =========================================================
    -- 4. biz_v_book_pnl -- read-only per-book_ref P&L (S15 §4a "Reports
    -- decision": computed view, not a materialized table with its own
    -- write path).
    -- =========================================================
    CREATE OR REPLACE VIEW fictionlab.biz_v_book_pnl AS
    SELECT
        a.company_id,
        t.book_ref,
        SUM(CASE WHEN t.direction = 'income' THEN t.amount ELSE 0 END) AS total_income,
        SUM(CASE WHEN t.direction = 'expense' THEN t.amount ELSE 0 END) AS total_expense,
        SUM(
            CASE
                WHEN t.direction = 'income' THEN t.amount
                WHEN t.direction = 'expense' THEN -t.amount
                ELSE 0  -- transfer: excluded, same convention as biz_v_cash_position
            END
        ) AS net
    FROM fictionlab.biz_transactions t
    JOIN fictionlab.biz_accounts a ON a.id = t.account_id
    WHERE t.book_ref IS NOT NULL
    GROUP BY a.company_id, t.book_ref;

    COMMENT ON VIEW fictionlab.biz_v_book_pnl IS 'Read-only per-book P&L, grouped by biz_transactions.book_ref (S15 §4a Reports decision). book_ref is a free-text label, not an FK into the canon DB (§0/§2).';

    RAISE NOTICE 'Created fictionlab.biz_v_book_pnl';

    -- =========================================================
    -- Triggers -- reuse the schema-generic updated_at trigger from
    -- migration 042 (fictionlab.kanban_update_timestamp only touches
    -- NEW.updated_at, no kanban-specific logic, safe for any table)
    -- =========================================================

    DROP TRIGGER IF EXISTS trigger_biz_subscriptions_update_timestamp ON fictionlab.biz_subscriptions;
    CREATE TRIGGER trigger_biz_subscriptions_update_timestamp
        BEFORE UPDATE ON fictionlab.biz_subscriptions
        FOR EACH ROW
        EXECUTE FUNCTION fictionlab.kanban_update_timestamp();

    DROP TRIGGER IF EXISTS trigger_biz_debts_update_timestamp ON fictionlab.biz_debts;
    CREATE TRIGGER trigger_biz_debts_update_timestamp
        BEFORE UPDATE ON fictionlab.biz_debts
        FOR EACH ROW
        EXECUTE FUNCTION fictionlab.kanban_update_timestamp();

    RAISE NOTICE 'Created updated_at triggers on biz_subscriptions, biz_debts';

    INSERT INTO migrations (filename) VALUES ('052_biz_subscriptions_debts_book_pnl.sql')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Migration 052_biz_subscriptions_debts_book_pnl.sql completed successfully';
    RAISE NOTICE '=================================================================';
END $$;
