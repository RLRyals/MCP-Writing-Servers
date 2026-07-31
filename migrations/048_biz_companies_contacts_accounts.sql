-- Migration: 048_biz_companies_contacts_accounts
-- Description: S15 slice 1 (business tracker) -- creates the company-neutral
-- `biz_` namespace root and the first two company-owned tables.
-- Spec: FictIonLab-Downloads/specs/2026-07-07-broadquill-ops/
--   S15-broadquill-business-tracker.md §0b (biz_companies DDL + the
--   "company_id on EVERY biz_* table" rule) + §4a (biz_accounts) + §4c
--   (biz_contacts) + §7 slice 1.
--
-- Table order matches the spec's dependency order (§4 note): biz_companies
-- FIRST, then biz_contacts, then biz_accounts (neither contacts nor accounts
-- FK into each other in this slice).
--
-- Follows the S11 §2e / migration-032 guard pattern (DO $$ ... IF EXISTS
-- (SELECT 1 FROM migrations ...) RETURN ... INSERT ... ON CONFLICT DO
-- NOTHING) and reuses the schema-generic fictionlab.kanban_update_timestamp()
-- BEFORE UPDATE trigger function created in migration 042 -- it only touches
-- NEW.updated_at, so it works for any table with that column regardless of
-- name.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '048_biz_companies_contacts_accounts.sql') THEN
        RAISE NOTICE 'Migration 048_biz_companies_contacts_accounts.sql already applied, skipping.';
        RETURN;
    END IF;

    CREATE SCHEMA IF NOT EXISTS fictionlab;

    -- =========================================================
    -- 1. biz_companies -- company identity is DATA, not schema (§0b)
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.biz_companies (
        id             BIGSERIAL PRIMARY KEY,
        name           TEXT NOT NULL UNIQUE,
        legal_name     TEXT,
        status         TEXT NOT NULL DEFAULT 'active',      -- active|closed
        closed_on      DATE,
        notes          TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    COMMENT ON TABLE fictionlab.biz_companies IS 'Root company-identity table (S15 §0b). Closing a company is a status change (status=closed + closed_on), never a delete -- history survives alongside successor companies.';

    -- Seed default company (idempotent) -- v1 UX carries no per-entry company
    -- picker; every surface operates on this default (§0b).
    INSERT INTO fictionlab.biz_companies (name) VALUES ('Broad Quill')
    ON CONFLICT (name) DO NOTHING;

    RAISE NOTICE 'Created fictionlab.biz_companies (+ Broad Quill seed)';

    -- =========================================================
    -- 2. biz_contacts -- per-company (§0b: company's books export/hand off cleanly)
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.biz_contacts (
        id             BIGSERIAL PRIMARY KEY,
        company_id     BIGINT NOT NULL REFERENCES fictionlab.biz_companies(id),
        name           TEXT NOT NULL,
        contact_type   TEXT NOT NULL DEFAULT 'vendor',      -- vendor|collaborator|reader|professional|other
        company        TEXT,
        email          TEXT,
        phone          TEXT,
        tags           TEXT[] DEFAULT '{}',
        notes          TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_biz_contacts_company ON fictionlab.biz_contacts(company_id);

    COMMENT ON TABLE fictionlab.biz_contacts IS 'Contacts & vendors (S15 §4c). Per-company (not shared across companies) so a company''s books export/hand off cleanly.';

    RAISE NOTICE 'Created fictionlab.biz_contacts';

    -- =========================================================
    -- 3. biz_accounts -- includes the folded-in Credit Cards fields (§4a)
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.biz_accounts (
        id              BIGSERIAL PRIMARY KEY,
        company_id      BIGINT NOT NULL REFERENCES fictionlab.biz_companies(id),
        name            TEXT NOT NULL,
        account_type    TEXT NOT NULL DEFAULT 'checking',
            -- checking|savings|credit_card|payment_processor|other
        institution     TEXT,
        currency        TEXT NOT NULL DEFAULT 'USD',
        opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
        -- credit-card-only fields (NULL for non-card accounts; folds "Credit
        -- Cards" into Accounts instead of a redundant parallel table)
        credit_limit    NUMERIC(12,2),
        apr             NUMERIC(5,2),
        statement_day   SMALLINT,                          -- day of month, 1-28
        is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
        notes           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_biz_accounts_company ON fictionlab.biz_accounts(company_id);

    COMMENT ON TABLE fictionlab.biz_accounts IS 'Finance accounts, incl. credit cards (S15 §4a). A credit card is account_type=credit_card + the three card-only columns, not a parallel table.';

    RAISE NOTICE 'Created fictionlab.biz_accounts';

    -- =========================================================
    -- Triggers -- reuse the schema-generic updated_at trigger from
    -- migration 042 (fictionlab.kanban_update_timestamp only touches
    -- NEW.updated_at, no kanban-specific logic, safe for any table)
    -- =========================================================

    DROP TRIGGER IF EXISTS trigger_biz_companies_update_timestamp ON fictionlab.biz_companies;
    CREATE TRIGGER trigger_biz_companies_update_timestamp
        BEFORE UPDATE ON fictionlab.biz_companies
        FOR EACH ROW
        EXECUTE FUNCTION fictionlab.kanban_update_timestamp();

    DROP TRIGGER IF EXISTS trigger_biz_contacts_update_timestamp ON fictionlab.biz_contacts;
    CREATE TRIGGER trigger_biz_contacts_update_timestamp
        BEFORE UPDATE ON fictionlab.biz_contacts
        FOR EACH ROW
        EXECUTE FUNCTION fictionlab.kanban_update_timestamp();

    DROP TRIGGER IF EXISTS trigger_biz_accounts_update_timestamp ON fictionlab.biz_accounts;
    CREATE TRIGGER trigger_biz_accounts_update_timestamp
        BEFORE UPDATE ON fictionlab.biz_accounts
        FOR EACH ROW
        EXECUTE FUNCTION fictionlab.kanban_update_timestamp();

    RAISE NOTICE 'Created updated_at triggers on biz_companies, biz_contacts, biz_accounts';

    INSERT INTO migrations (filename) VALUES ('048_biz_companies_contacts_accounts.sql')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Migration 048_biz_companies_contacts_accounts.sql completed successfully';
    RAISE NOTICE '=================================================================';
END $$;
