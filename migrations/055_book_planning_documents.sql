-- Migration: 055_book_planning_documents
-- Description: mws-0zk -- DB-first storage for per-book planning documents
-- (RATIFIED Rebecca 2026-09-02, PR #60 Q1: "I don't want to use markdown
-- files as the working documents, I do want to store them in a db and
-- export to .md for reading"). Adds:
--   1. book_worksheet_sections -- the 17-section EAW story-dossier worksheet
--      (story-dossier-cascade format), one row per book per section, keyed
--      by section_key so a section can be written/read/re-drafted in place.
--   2. book_parameters -- the per-book journey parameters from the First
--      Draft journey's "Project Info" station (genre, target chapter count,
--      act structure, POV, tense, target words/chapter), one row per book.
-- DB is the source of truth; the exported .md (see get_scene/journey work,
-- and the planning-document-handlers export tool) is a read-only projection
-- of these tables. Story canon separation rule unchanged: beads never hold
-- content, and neither table stores canon facts -- only planning documents.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '055_book_planning_documents.sql') THEN
        RAISE NOTICE 'Migration 055_book_planning_documents.sql already applied, skipping.';
        RETURN;
    END IF;

    -- =========================================================
    -- 1. book_worksheet_sections: the 17-section EAW dossier,
    --    keyed by book + section so each section round-trips
    --    independently (Draft with AI / edit / Approve per section).
    -- =========================================================
    CREATE TABLE IF NOT EXISTS book_worksheet_sections (
        id SERIAL PRIMARY KEY,
        book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        section_key TEXT NOT NULL, -- e.g. 'premise', 'protagonist', 'antagonist', ...
        section_title TEXT,
        content TEXT,
        status TEXT NOT NULL DEFAULT 'draft'
            CHECK (status IN ('draft', 'approved')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (book_id, section_key)
    );

    CREATE INDEX IF NOT EXISTS idx_book_worksheet_sections_book
        ON book_worksheet_sections(book_id, sort_order);

    RAISE NOTICE 'Created book_worksheet_sections';

    CREATE OR REPLACE FUNCTION book_worksheet_sections_update_timestamp()
    RETURNS TRIGGER AS $trigger$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $trigger$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trigger_book_worksheet_sections_update_timestamp ON book_worksheet_sections;
    CREATE TRIGGER trigger_book_worksheet_sections_update_timestamp
        BEFORE UPDATE ON book_worksheet_sections
        FOR EACH ROW
        EXECUTE FUNCTION book_worksheet_sections_update_timestamp();

    -- =========================================================
    -- 2. book_parameters: the journey's per-book "Project Info"
    --    station fields. One row per book (1:1).
    -- =========================================================
    CREATE TABLE IF NOT EXISTS book_parameters (
        book_id INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
        genre TEXT,
        target_chapters INTEGER,
        act_structure TEXT, -- e.g. 'No Act Structure', '9 Act Structure'
        pov TEXT,           -- e.g. 'First Person', 'Third Person Limited'
        narrative_tense TEXT, -- e.g. 'Past', 'Present'
        target_words_per_chapter INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    RAISE NOTICE 'Created book_parameters';

    CREATE OR REPLACE FUNCTION book_parameters_update_timestamp()
    RETURNS TRIGGER AS $trigger$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $trigger$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trigger_book_parameters_update_timestamp ON book_parameters;
    CREATE TRIGGER trigger_book_parameters_update_timestamp
        BEFORE UPDATE ON book_parameters
        FOR EACH ROW
        EXECUTE FUNCTION book_parameters_update_timestamp();

    INSERT INTO migrations (filename) VALUES ('055_book_planning_documents.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 055_book_planning_documents.sql completed successfully.';
END $$;
