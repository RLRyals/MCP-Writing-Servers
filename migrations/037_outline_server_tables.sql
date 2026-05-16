-- Migration: 037_outline_server_tables
-- Description: Schema for the outline-server MCP.
-- Adds a self-referential hierarchy (outline_works) plus a polymorphic
-- scene_events log and three small entity tables (facts, promises,
-- evidence_chain). Designed to be self-contained: does NOT replace or
-- write to series/books/chapters/chapter_scenes. Cross-link via the
-- optional legacy_*_id columns if you want to point at existing rows.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '037_outline_server_tables.sql') THEN
        RAISE NOTICE 'Migration 037_outline_server_tables.sql already applied, skipping.';
        RETURN;
    END IF;

    -- =========================================================
    -- 1. outline_works: the zoom-pyramid hierarchy
    --    series -> book -> act -> chapter -> scene  (also: beat)
    --    Self-referential. Multiple top-level series supported.
    -- =========================================================
    CREATE TABLE IF NOT EXISTS outline_works (
        id SERIAL PRIMARY KEY,
        parent_id INTEGER REFERENCES outline_works(id) ON DELETE CASCADE,
        work_type VARCHAR(20) NOT NULL
            CHECK (work_type IN ('series','book','act','beat','chapter','scene')),
        sequence INTEGER NOT NULL DEFAULT 0,
        title VARCHAR(500),
        summary TEXT,
        content TEXT,
        status VARCHAR(50) DEFAULT 'planned',

        -- Optional soft links to existing legacy tables. Never required.
        legacy_series_id INTEGER REFERENCES series(id) ON DELETE SET NULL,
        legacy_book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
        legacy_chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
        legacy_scene_id INTEGER REFERENCES chapter_scenes(id) ON DELETE SET NULL,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT outline_works_root_or_parent CHECK (
            (parent_id IS NULL AND work_type = 'series') OR
            (parent_id IS NOT NULL AND work_type <> 'series')
        )
    );

    CREATE INDEX IF NOT EXISTS idx_outline_works_parent
        ON outline_works(parent_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_outline_works_type
        ON outline_works(work_type);

    DROP TRIGGER IF EXISTS update_outline_works_timestamp ON outline_works;
    CREATE TRIGGER update_outline_works_timestamp
        BEFORE UPDATE ON outline_works
        FOR EACH ROW
        EXECUTE FUNCTION update_timestamp();

    -- =========================================================
    -- 2. outline_facts: atomic truth units. Anything a character
    --    can know or not know. Statement is the canonical wording.
    -- =========================================================
    CREATE TABLE IF NOT EXISTS outline_facts (
        id SERIAL PRIMARY KEY,
        series_root_id INTEGER REFERENCES outline_works(id) ON DELETE CASCADE,
        statement TEXT NOT NULL,
        fact_type VARCHAR(50),  -- world, case, conspiracy, character, etc. (free-form)
        canonical_source TEXT,  -- why this is true / where it becomes true
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_outline_facts_series
        ON outline_facts(series_root_id);
    CREATE INDEX IF NOT EXISTS idx_outline_facts_type
        ON outline_facts(fact_type);

    DROP TRIGGER IF EXISTS update_outline_facts_timestamp ON outline_facts;
    CREATE TRIGGER update_outline_facts_timestamp
        BEFORE UPDATE ON outline_facts
        FOR EACH ROW
        EXECUTE FUNCTION update_timestamp();

    -- =========================================================
    -- 3. outline_promises: unified ledger for clues, setups,
    --    foreshadowing, threads, romance beats. One row per
    --    "thing that needs to pay off." Status is hand-set;
    --    "open with no payoff_work_id" is the killer query.
    -- =========================================================
    CREATE TABLE IF NOT EXISTS outline_promises (
        id SERIAL PRIMARY KEY,
        series_root_id INTEGER REFERENCES outline_works(id) ON DELETE CASCADE,
        promise_type VARCHAR(50),  -- clue, red_herring, foreshadow, thread, romance_beat, setup
        label VARCHAR(500) NOT NULL,
        description TEXT,
        planted_work_id INTEGER REFERENCES outline_works(id) ON DELETE SET NULL,
        payoff_work_id INTEGER REFERENCES outline_works(id) ON DELETE SET NULL,
        status VARCHAR(30) DEFAULT 'open'
            CHECK (status IN ('open','progressing','paid','carried','abandoned')),
        carries_to_series BOOLEAN DEFAULT FALSE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_outline_promises_series
        ON outline_promises(series_root_id);
    CREATE INDEX IF NOT EXISTS idx_outline_promises_status
        ON outline_promises(status);
    CREATE INDEX IF NOT EXISTS idx_outline_promises_planted
        ON outline_promises(planted_work_id);
    CREATE INDEX IF NOT EXISTS idx_outline_promises_payoff
        ON outline_promises(payoff_work_id);

    DROP TRIGGER IF EXISTS update_outline_promises_timestamp ON outline_promises;
    CREATE TRIGGER update_outline_promises_timestamp
        BEFORE UPDATE ON outline_promises
        FOR EACH ROW
        EXECUTE FUNCTION update_timestamp();

    -- =========================================================
    -- 4. outline_evidence_chain: the forensic-tech agency gap.
    --    Protagonist produces a finding but cannot act on it
    --    directly. Tracks who_acts_on_it, the action_gap_note
    --    (cost of conversion), and converted_work_id (when/where
    --    the evidence becomes plot).
    -- =========================================================
    CREATE TABLE IF NOT EXISTS outline_evidence_chain (
        id SERIAL PRIMARY KEY,
        series_root_id INTEGER REFERENCES outline_works(id) ON DELETE CASCADE,
        produced_work_id INTEGER REFERENCES outline_works(id) ON DELETE SET NULL,
        finding TEXT NOT NULL,
        who_acts_on_it TEXT,
        action_gap_note TEXT,
        converted_work_id INTEGER REFERENCES outline_works(id) ON DELETE SET NULL,
        status VARCHAR(30) DEFAULT 'unconverted'
            CHECK (status IN ('unconverted','converted','off_books','lost')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_outline_evidence_series
        ON outline_evidence_chain(series_root_id);
    CREATE INDEX IF NOT EXISTS idx_outline_evidence_status
        ON outline_evidence_chain(status);
    CREATE INDEX IF NOT EXISTS idx_outline_evidence_produced
        ON outline_evidence_chain(produced_work_id);

    DROP TRIGGER IF EXISTS update_outline_evidence_timestamp ON outline_evidence_chain;
    CREATE TRIGGER update_outline_evidence_timestamp
        BEFORE UPDATE ON outline_evidence_chain
        FOR EACH ROW
        EXECUTE FUNCTION update_timestamp();

    -- =========================================================
    -- 5. outline_scene_events: the polymorphic event log.
    --    One row per "structural thing the work does." This is
    --    the projection source for character knowledge, open
    --    promises, etc. Soft polymorphism via nullable FKs --
    --    populate the relevant one for the event_type.
    -- =========================================================
    CREATE TABLE IF NOT EXISTS outline_scene_events (
        id SERIAL PRIMARY KEY,
        work_id INTEGER NOT NULL REFERENCES outline_works(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL
            CHECK (event_type IN (
                'reveals_fact','plants_promise','pays_promise',
                'character_choice','consequence','evidence_produced',
                'evidence_converted'
            )),
        fact_id INTEGER REFERENCES outline_facts(id) ON DELETE SET NULL,
        promise_id INTEGER REFERENCES outline_promises(id) ON DELETE SET NULL,
        evidence_id INTEGER REFERENCES outline_evidence_chain(id) ON DELETE SET NULL,
        character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
        ordering INTEGER DEFAULT 0,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_outline_scene_events_work
        ON outline_scene_events(work_id, ordering);
    CREATE INDEX IF NOT EXISTS idx_outline_scene_events_fact
        ON outline_scene_events(fact_id);
    CREATE INDEX IF NOT EXISTS idx_outline_scene_events_promise
        ON outline_scene_events(promise_id);
    CREATE INDEX IF NOT EXISTS idx_outline_scene_events_evidence
        ON outline_scene_events(evidence_id);
    CREATE INDEX IF NOT EXISTS idx_outline_scene_events_character
        ON outline_scene_events(character_id);
    CREATE INDEX IF NOT EXISTS idx_outline_scene_events_type
        ON outline_scene_events(event_type);

    INSERT INTO migrations (filename) VALUES ('037_outline_server_tables.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 037_outline_server_tables.sql completed successfully.';
END $$;
