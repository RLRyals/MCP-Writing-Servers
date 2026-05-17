-- Migration: 039_outline_rename_cross_refs
-- Description: Rename outline_works cross-reference columns to drop the
-- "legacy_" prefix. The other MCPs in this system are not legacy — they
-- are current, working systems that the outline server complements.
-- Renaming the columns to bare names: series_id, book_id, chapter_id,
-- scene_id. FKs and indexes are preserved through RENAME COLUMN.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '039_outline_rename_cross_refs.sql') THEN
        RAISE NOTICE 'Migration 039_outline_rename_cross_refs.sql already applied, skipping.';
        RETURN;
    END IF;

    ALTER TABLE outline_works RENAME COLUMN legacy_series_id TO series_id;
    ALTER TABLE outline_works RENAME COLUMN legacy_book_id TO book_id;
    ALTER TABLE outline_works RENAME COLUMN legacy_chapter_id TO chapter_id;
    ALTER TABLE outline_works RENAME COLUMN legacy_scene_id TO scene_id;

    INSERT INTO migrations (filename) VALUES ('039_outline_rename_cross_refs.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 039_outline_rename_cross_refs.sql completed successfully.';
END $$;
