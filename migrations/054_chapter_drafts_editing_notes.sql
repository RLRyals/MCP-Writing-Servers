-- Migration: 054_chapter_drafts_editing_notes
-- Description: mws-00b -- structured, queryable per-line editing notes and
-- cross-chapter lessons for the chapter-by-chapter editing process
-- (RATIFIED Rebecca 2026-08-22): draft 1 -> notes -> draft 2 -> notes 2 -> ...
-- Git remains the draft-blob version store (shared-tpi); this migration adds
-- what the DB uniquely enables: chapter_drafts (versioned draft snapshots)
-- and editing_notes (quote-anchored line notes with an extracted "lesson"
-- field that get_lessons() surfaces to the drafting lane for later chapters).
--
-- Does not touch existing tables' data. Self-contained: chapter_drafts and
-- editing_notes both FK to the existing public.chapters table only.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '054_chapter_drafts_editing_notes.sql') THEN
        RAISE NOTICE 'Migration 054_chapter_drafts_editing_notes.sql already applied, skipping.';
        RETURN;
    END IF;

    -- =========================================================
    -- 1. chapter_drafts: versioned draft snapshots for a chapter
    -- =========================================================
    CREATE TABLE IF NOT EXISTS chapter_drafts (
        id SERIAL PRIMARY KEY,
        chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
        draft_number INTEGER NOT NULL,
        content TEXT NOT NULL,
        word_count INTEGER,
        source TEXT, -- e.g. 'drafting-lane', 'edit-pass-2'
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (chapter_id, draft_number)
    );

    CREATE INDEX IF NOT EXISTS idx_chapter_drafts_chapter
        ON chapter_drafts(chapter_id);

    RAISE NOTICE 'Created chapter_drafts';

    -- =========================================================
    -- 2. editing_notes: quote-anchored line-level notes + lessons
    --    line_quote is quote-anchored (not line-number-anchored) so a note
    --    survives re-drafts that shift line numbers.
    -- =========================================================
    CREATE TABLE IF NOT EXISTS editing_notes (
        id SERIAL PRIMARY KEY,
        chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
        draft_number INTEGER NOT NULL, -- the draft the note was made ON
        line_quote TEXT NOT NULL,
        reason TEXT NOT NULL,
        suggested_fix TEXT,
        status TEXT NOT NULL DEFAULT 'open'
            CHECK (status IN ('open', 'applied', 'rejected')),
        lesson TEXT, -- generalized takeaway, filled in when the fix is applied
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_editing_notes_chapter_draft
        ON editing_notes(chapter_id, draft_number);
    CREATE INDEX IF NOT EXISTS idx_editing_notes_status
        ON editing_notes(status);

    RAISE NOTICE 'Created editing_notes';

    -- =========================================================
    -- updated_at trigger for editing_notes
    -- =========================================================
    CREATE OR REPLACE FUNCTION editing_notes_update_timestamp()
    RETURNS TRIGGER AS $trigger$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $trigger$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trigger_editing_notes_update_timestamp ON editing_notes;
    CREATE TRIGGER trigger_editing_notes_update_timestamp
        BEFORE UPDATE ON editing_notes
        FOR EACH ROW
        EXECUTE FUNCTION editing_notes_update_timestamp();

    INSERT INTO migrations (filename) VALUES ('054_chapter_drafts_editing_notes.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 054_chapter_drafts_editing_notes.sql completed successfully.';
END $$;
