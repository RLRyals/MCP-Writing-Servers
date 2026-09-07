-- Migration: 056_drop_book_planning_documents
-- Description: Down-migration for 055 (reverted). Rebecca's 2026-09-05 ruling
-- on PR #107 ("I don't think we need new tables for worksheets. I can already
-- write books with the current tables.") was recorded BEFORE merge, but the
-- unreworked branch merged 2026-09-07 and migration 055 ran on live DBs.
-- PRs #107 + #109 are git-reverted (bead mws-0zk reopened for the
-- existing-tables rework — universal metadata table, see FictionLab-Online
-- design doc Amendment 2 Ruling 1); this migration removes the two tables
-- from any DB that already applied 055, and clears 055's ledger row so a
-- future (correct) 055 numbering slot isn't blocked. Both tables held ZERO
-- rows at revert time (verified live 2026-09-07); the drops are guarded with
-- IF EXISTS so never-055 databases apply this as a no-op.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '056_drop_book_planning_documents.sql') THEN
        RAISE NOTICE 'Migration 056_drop_book_planning_documents.sql already applied, skipping.';
        RETURN;
    END IF;

    DROP TRIGGER IF EXISTS trigger_book_worksheet_sections_update_timestamp ON book_worksheet_sections;
    DROP FUNCTION IF EXISTS book_worksheet_sections_update_timestamp();
    DROP TRIGGER IF EXISTS trigger_book_parameters_update_timestamp ON book_parameters;
    DROP FUNCTION IF EXISTS book_parameters_update_timestamp();
    DROP TABLE IF EXISTS book_worksheet_sections;
    DROP TABLE IF EXISTS book_parameters;

    DELETE FROM migrations WHERE filename = '055_book_planning_documents.sql';

    INSERT INTO migrations (filename) VALUES ('056_drop_book_planning_documents.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Dropped book_worksheet_sections + book_parameters (055 reverted)';
END
$$;
