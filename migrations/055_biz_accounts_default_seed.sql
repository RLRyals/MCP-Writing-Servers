-- Migration: 055_biz_accounts_default_seed
-- Description: mws-s0l -- seeds one default fictionlab.biz_accounts row under
-- the existing default 'Broad Quill' company (migration 048) so
-- FictionLab-Online's BUSINESS_STATEMENTS_ACCOUNT_ID env var has a real id to
-- point at. S15 v1 is single-account only (S15-broadquill-business-tracker.md
-- §15) -- no account picker UI, so a row must already exist rather than be
-- created on first use.
--
-- Depends on: fictionlab.biz_companies (migration 048, seeds 'Broad Quill'),
-- fictionlab.biz_accounts (migration 048).

DO $$
DECLARE
    v_company_id BIGINT;
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '055_biz_accounts_default_seed.sql') THEN
        RAISE NOTICE 'Migration 055_biz_accounts_default_seed.sql already applied, skipping.';
        RETURN;
    END IF;

    SELECT id INTO v_company_id FROM fictionlab.biz_companies WHERE name = 'Broad Quill';

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'fictionlab.biz_companies has no "Broad Quill" row -- migration 048 must run first';
    END IF;

    INSERT INTO fictionlab.biz_accounts (company_id, name, account_type)
    SELECT v_company_id, 'Primary Checking', 'checking'
    WHERE NOT EXISTS (
        SELECT 1 FROM fictionlab.biz_accounts WHERE company_id = v_company_id AND name = 'Primary Checking'
    );

    RAISE NOTICE 'Seeded fictionlab.biz_accounts default row (Primary Checking)';

    INSERT INTO migrations (filename) VALUES ('055_biz_accounts_default_seed.sql')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Migration 055_biz_accounts_default_seed.sql completed successfully';
    RAISE NOTICE '=================================================================';
END $$;
