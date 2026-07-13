-- Migration: 045_story_analysis_tables
-- Description: Forward migration for the story-analysis-server's write tables.
-- GH #73 (refines #68; #68's "storyforms" table approach was explicitly
-- rejected in favor of creating the tables the server's handlers already
-- target). Do NOT resurrect #68's approach.
--
-- Creates: story_analysis, character_throughlines, story_appreciations,
-- problem_solutions.
--
-- Column shapes were taken directly from the live INSERT/UPDATE/SELECT
-- statements in
--   src/mcps/story-analysis-server/handlers/story-analysis-handlers.js
-- (the actual bug being fixed: the server writes to tables that were never
-- created). The commented-out DDL in init.sql (~L705-L731 for
-- story_analysis; ~L892-L927 for the other three) was used as a secondary
-- reference / starting point, not the source of truth.
--
-- Live-DB check performed before authoring this migration (2026-07-12):
-- connected to the running `fictionlab-postgres` container, database
-- `mcp_writing_db`. None of the four tables exist (\dt showed only
-- story_concerns/story_outcomes/story_judgments from the lookup-table
-- family). `migrations` table's latest applied entry is 044
-- (044_kanban_identities.sql); grepping migrations/ for the four table
-- names also returned nothing. This file does NOT touch init.sql and does
-- NOT re-run/re-initialize the database.
--
-- Design notes / deviations from the commented-out init.sql DDL:
--  * story_analysis gets UNIQUE(book_id). The handler's fallback branches
--    in handleTrackCharacterThroughlines / handleIdentifyStoryAppreciations /
--    handleMapProblemSolutions all do:
--        INSERT INTO story_analysis (book_id, analysis_notes) VALUES (...)
--        ON CONFLICT (book_id) DO UPDATE SET ...
--    which requires a unique constraint on book_id to even be valid SQL.
--    (Those fallback branches only fire when their own table doesn't
--    exist, so they become dead code once this migration runs -- but the
--    constraint must exist for the SQL itself to be valid, and it matches
--    the primary handleAnalyzeStoryDynamics path's own assumption of one
--    row per book, enforced there via a SELECT-before-insert check.)
--  * character_throughlines keeps UNIQUE(book_id, character_id,
--    throughline_type) from the original commented DDL -- the handler
--    already treats this triple as unique (SELECT-before-insert), so the
--    constraint just enforces the app's existing invariant.
--  * story_appreciations and problem_solutions do NOT get the UNIQUE
--    constraints that appear in the commented-out init.sql DDL
--    (UNIQUE(book_id, appreciation_type, appreciation_value) /
--    UNIQUE(book_id, problem, solution)). The live handlers for both do a
--    plain INSERT on every call with no existence check and no
--    ON CONFLICT clause -- adding those constraints would make a second,
--    legitimately-identical call throw an unhandled unique-violation
--    instead of the graceful multi-row behavior the code already has.
--    Indexes on book_id are added instead for lookup performance.
--  * problem_solutions.effectiveness gets a CHECK matching the tool
--    schema's enum (solves, complicates, redirects, unknown) --
--    src/mcps/story-analysis-server/schemas/story-analysis-tools-schema.js
--    already restricts callers to this exact value set.
--  * character_throughlines.throughline_type gets a CHECK matching
--    story-validators.js's validThroughlineTypes list, for the same
--    defense-in-depth reason.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '045_story_analysis_tables.sql') THEN
        RAISE NOTICE 'Migration 045_story_analysis_tables.sql already applied, skipping.';
        RETURN;
    END IF;

    -- =========================================================
    -- 1. story_analysis: one row per book, upserted by
    --    handleAnalyzeStoryDynamics (analyze_story_dynamics tool) and
    --    used as a text-notes fallback target by the other three
    --    handlers when their own table is missing.
    -- =========================================================
    CREATE TABLE IF NOT EXISTS story_analysis (
        id SERIAL PRIMARY KEY,
        book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,

        -- Plot elements (using existing lookup tables)
        story_concern_id INTEGER REFERENCES story_concerns(id),
        main_character_problem TEXT,
        influence_character_impact TEXT,
        story_outcome_id INTEGER REFERENCES story_outcomes(id),
        story_judgment_id INTEGER REFERENCES story_judgments(id),
        thematic_elements JSONB,

        -- General analysis notes (also the fallback-write target for the
        -- other three handlers when their table is unavailable)
        analysis_notes TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT story_analysis_book_id_key UNIQUE (book_id)
    );

    CREATE INDEX IF NOT EXISTS idx_story_analysis_book_id ON story_analysis(book_id);
    CREATE INDEX IF NOT EXISTS idx_story_analysis_concern ON story_analysis(story_concern_id);

    DROP TRIGGER IF EXISTS update_story_analysis_timestamp ON story_analysis;
    CREATE TRIGGER update_story_analysis_timestamp
        BEFORE UPDATE ON story_analysis
        FOR EACH ROW
        EXECUTE FUNCTION update_timestamp();

    -- =========================================================
    -- 2. character_throughlines: one row per (book_id, character_id,
    --    throughline_type), upserted by handleTrackCharacterThroughlines
    --    (track_character_throughlines tool).
    -- =========================================================
    CREATE TABLE IF NOT EXISTS character_throughlines (
        id SERIAL PRIMARY KEY,
        book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        throughline_type VARCHAR(50) NOT NULL
            CHECK (throughline_type IN ('main_character','influence_character','relationship','objective_story')),
        character_problem TEXT,
        character_solution TEXT,
        character_arc TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT character_throughlines_unique UNIQUE (book_id, character_id, throughline_type)
    );

    CREATE INDEX IF NOT EXISTS idx_character_throughlines_book ON character_throughlines(book_id);
    CREATE INDEX IF NOT EXISTS idx_character_throughlines_character ON character_throughlines(character_id);

    DROP TRIGGER IF EXISTS update_character_throughlines_timestamp ON character_throughlines;
    CREATE TRIGGER update_character_throughlines_timestamp
        BEFORE UPDATE ON character_throughlines
        FOR EACH ROW
        EXECUTE FUNCTION update_timestamp();

    -- =========================================================
    -- 3. story_appreciations: append-only log, inserted by
    --    handleIdentifyStoryAppreciations (identify_story_appreciations
    --    tool). No existence check / no ON CONFLICT in the handler, so
    --    deliberately no uniqueness constraint here (see header note).
    -- =========================================================
    CREATE TABLE IF NOT EXISTS story_appreciations (
        id SERIAL PRIMARY KEY,
        book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        appreciation_type VARCHAR(100) NOT NULL,
        appreciation_value TEXT NOT NULL,
        supporting_evidence TEXT,
        confidence_level INTEGER DEFAULT 5 CHECK (confidence_level BETWEEN 1 AND 10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_story_appreciations_book ON story_appreciations(book_id);
    CREATE INDEX IF NOT EXISTS idx_story_appreciations_type ON story_appreciations(appreciation_type);

    DROP TRIGGER IF EXISTS update_story_appreciations_timestamp ON story_appreciations;
    CREATE TRIGGER update_story_appreciations_timestamp
        BEFORE UPDATE ON story_appreciations
        FOR EACH ROW
        EXECUTE FUNCTION update_timestamp();

    -- =========================================================
    -- 4. problem_solutions: append-only log, inserted by
    --    handleMapProblemSolutions (map_problem_solutions tool). Same
    --    no-uniqueness rationale as story_appreciations.
    -- =========================================================
    CREATE TABLE IF NOT EXISTS problem_solutions (
        id SERIAL PRIMARY KEY,
        book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        problem TEXT NOT NULL,
        solution TEXT NOT NULL,
        problem_level VARCHAR(50) NOT NULL
            CHECK (problem_level IN ('overall_story','main_character','influence_character','relationship')),
        effectiveness VARCHAR(50) DEFAULT 'unknown'
            CHECK (effectiveness IN ('solves','complicates','redirects','unknown')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_problem_solutions_book ON problem_solutions(book_id);
    CREATE INDEX IF NOT EXISTS idx_problem_solutions_level ON problem_solutions(problem_level);

    DROP TRIGGER IF EXISTS update_problem_solutions_timestamp ON problem_solutions;
    CREATE TRIGGER update_problem_solutions_timestamp
        BEFORE UPDATE ON problem_solutions
        FOR EACH ROW
        EXECUTE FUNCTION update_timestamp();

    INSERT INTO migrations (filename) VALUES ('045_story_analysis_tables.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 045_story_analysis_tables.sql completed successfully.';
END $$;
