-- Migration: 046_storyforms
-- Description: Canon-DB flip 01 (Dramatica storyform storage). Creates the
-- `storyforms` table: one row per series-master storyform (book_id IS NULL)
-- and one row per per-book storyform (book_id set). Spec:
--   FictIonLab-Downloads/specs/2026-07-10-canon-db-migration/01-storyform-storage.md
-- Scope is storyform-of-record level only (the ~12 core appreciations +
-- throughline domains + rationale) -- explicitly NOT the 64-track storyweave
-- encode / beat interleave, which stays scene-level (flip 07's outline
-- tables).
--
-- `story_analysis` (migration 045) is NOT resurrected/touched here -- its
-- shape is too thin for storyforms (see spec item 1's "decide-and-document"
-- note). This is intentionally a separate table.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '046_storyforms.sql') THEN
        RAISE NOTICE 'Migration 046_storyforms.sql already applied, skipping.';
        RETURN;
    END IF;

    CREATE TABLE IF NOT EXISTS storyforms (
        id SERIAL PRIMARY KEY,
        series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
        -- NULL book_id = the series-master storyform; a real book_id = that
        -- book's own storyform-of-record (per the nested-storyform rule --
        -- each book gets its own complete grand argument, constrained by
        -- but not identical to the series master).
        book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,

        -- Four-throughline casting (OS/MC/IC/RS Domains)
        os_domain VARCHAR(100),
        mc_domain VARCHAR(100),
        ic_domain VARCHAR(100),
        rs_domain VARCHAR(100),

        -- Core dynamics
        story_driver VARCHAR(50),
        story_limit VARCHAR(50),
        story_outcome_id INTEGER REFERENCES story_outcomes(id),
        story_judgment_id INTEGER REFERENCES story_judgments(id),
        story_concern_id INTEGER REFERENCES story_concerns(id),
        mc_resolve VARCHAR(50),
        mc_growth VARCHAR(50),
        mc_approach VARCHAR(50),
        mc_ps_style VARCHAR(50),

        -- Per-scope "best fit" rationale (why this storyform fits canon)
        rationale TEXT,

        -- Everything beyond the core set (signpost arcs, issue/problem per
        -- throughline, etc.) -- do NOT try to normalize all of Dramatica.
        appreciations JSONB,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- One series-master row per series (book_id IS NULL is not covered by a
    -- plain UNIQUE(series_id, book_id) constraint, since Postgres treats
    -- each NULL as distinct) ...
    CREATE UNIQUE INDEX IF NOT EXISTS idx_storyforms_series_master
        ON storyforms(series_id) WHERE book_id IS NULL;

    -- ... and one row per (series_id, book_id) for per-book storyforms.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_storyforms_series_book
        ON storyforms(series_id, book_id) WHERE book_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_storyforms_book_id ON storyforms(book_id);

    DROP TRIGGER IF EXISTS update_storyforms_timestamp ON storyforms;
    CREATE TRIGGER update_storyforms_timestamp
        BEFORE UPDATE ON storyforms
        FOR EACH ROW
        EXECUTE FUNCTION update_timestamp();

    INSERT INTO migrations (filename) VALUES ('046_storyforms.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 046_storyforms.sql completed successfully.';
END $$;
