-- Migration: 059_scene_staging
-- Description: Scene staging data (mws-5ad). Additive only.
--   * scene_staging: one row per outline scene/beat (location, time, weather, light, beat kind)
--   * trackers + tracker_changes: genre-neutral numbers/values that change over the story
--   * outline_scene_events: staging event types + location_id/element_id/channel
--   * locations: position_note, x_m, z_m
--   * character_chapter_presence: work_id (outline scene reference), hidden-layer columns;
--     chapter_id becomes nullable so outline-scene rows can exist without a chapter
--   * reveal_evidence: found_where, spotted_by_character_id, recorded_text, withheld, discovery_work_id
-- Numbered 059 because 058 was taken by 058_text_history_triggers.sql.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '059_scene_staging.sql') THEN
        RAISE NOTICE 'Migration 059_scene_staging.sql already applied, skipping.';
        RETURN;
    END IF;

    -- scene_staging
    CREATE TABLE IF NOT EXISTS scene_staging (
        id SERIAL PRIMARY KEY,
        work_id INTEGER NOT NULL UNIQUE REFERENCES outline_works(id) ON DELETE CASCADE,
        location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
        shows_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
        time_of_day VARCHAR(50),
        story_datetime TEXT,
        weather TEXT,
        light TEXT,
        beat_kind VARCHAR(20) CHECK (beat_kind IS NULL OR beat_kind IN ('picture','not_picture','memory')),
        memory_age INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_scene_staging_location ON scene_staging(location_id);
    CREATE INDEX IF NOT EXISTS idx_scene_staging_shows_location ON scene_staging(shows_location_id);

    -- trackers
    CREATE TABLE IF NOT EXISTS trackers (
        id SERIAL PRIMARY KEY,
        series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        owner_kind VARCHAR(20) NOT NULL CHECK (owner_kind IN ('character','scene','world')),
        value_kind VARCHAR(10) NOT NULL DEFAULT 'number' CHECK (value_kind IN ('number','text')),
        unit VARCHAR(30),
        min_value NUMERIC,
        max_value NUMERIC,
        direction VARCHAR(10) NOT NULL DEFAULT 'none' CHECK (direction IN ('up','down','none')),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (series_id, name)
    );

    CREATE TABLE IF NOT EXISTS tracker_changes (
        id SERIAL PRIMARY KEY,
        tracker_id INTEGER NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
        character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
        work_id INTEGER NOT NULL REFERENCES outline_works(id) ON DELETE CASCADE,
        value_number NUMERIC,
        value_text TEXT,
        delta NUMERIC,
        reason TEXT,
        ordering INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT tracker_changes_has_value CHECK (value_number IS NOT NULL OR value_text IS NOT NULL OR delta IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS idx_tracker_changes_tracker ON tracker_changes(tracker_id);
    CREATE INDEX IF NOT EXISTS idx_tracker_changes_work ON tracker_changes(work_id, ordering);
    CREATE INDEX IF NOT EXISTS idx_tracker_changes_character ON tracker_changes(character_id);

    -- outline_scene_events
    ALTER TABLE outline_scene_events DROP CONSTRAINT IF EXISTS outline_scene_events_event_type_check;
    ALTER TABLE outline_scene_events ADD CONSTRAINT outline_scene_events_event_type_check
        CHECK (event_type IN (
            'reveals_fact','plants_promise','pays_promise','character_choice','consequence',
            'evidence_produced','evidence_converted',
            'action','position','line','display','sound','prop_state','dressing'));
    ALTER TABLE outline_scene_events ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL;
    ALTER TABLE outline_scene_events ADD COLUMN IF NOT EXISTS element_id INTEGER REFERENCES world_elements(id) ON DELETE SET NULL;
    ALTER TABLE outline_scene_events ADD COLUMN IF NOT EXISTS channel VARCHAR(20);
    ALTER TABLE outline_scene_events DROP CONSTRAINT IF EXISTS outline_scene_events_channel_check;
    ALTER TABLE outline_scene_events ADD CONSTRAINT outline_scene_events_channel_check
        CHECK (channel IS NULL OR channel IN ('in_room','comm','ai','off_screen'));
    CREATE INDEX IF NOT EXISTS idx_outline_scene_events_location ON outline_scene_events(location_id);
    CREATE INDEX IF NOT EXISTS idx_outline_scene_events_element ON outline_scene_events(element_id);

    -- locations
    ALTER TABLE locations ADD COLUMN IF NOT EXISTS position_note TEXT;
    ALTER TABLE locations ADD COLUMN IF NOT EXISTS x_m NUMERIC;
    ALTER TABLE locations ADD COLUMN IF NOT EXISTS z_m NUMERIC;

    -- character_chapter_presence
    ALTER TABLE character_chapter_presence ALTER COLUMN chapter_id DROP NOT NULL;
    ALTER TABLE character_chapter_presence ADD COLUMN IF NOT EXISTS work_id INTEGER REFERENCES outline_works(id) ON DELETE CASCADE;
    ALTER TABLE character_chapter_presence ADD COLUMN IF NOT EXISTS pressure TEXT;
    ALTER TABLE character_chapter_presence ADD COLUMN IF NOT EXISTS performance TEXT;
    ALTER TABLE character_chapter_presence ADD COLUMN IF NOT EXISTS unadmitted TEXT;
    ALTER TABLE character_chapter_presence ADD COLUMN IF NOT EXISTS pattern TEXT;
    ALTER TABLE character_chapter_presence ADD COLUMN IF NOT EXISTS sabotage TEXT;
    ALTER TABLE character_chapter_presence ADD COLUMN IF NOT EXISTS emotional_build TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_character_presence_work_character
        ON character_chapter_presence(work_id, character_id) WHERE work_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_character_chapter_presence_work ON character_chapter_presence(work_id);

    -- reveal_evidence
    ALTER TABLE reveal_evidence ADD COLUMN IF NOT EXISTS found_where TEXT;
    ALTER TABLE reveal_evidence ADD COLUMN IF NOT EXISTS spotted_by_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL;
    ALTER TABLE reveal_evidence ADD COLUMN IF NOT EXISTS recorded_text TEXT;
    ALTER TABLE reveal_evidence ADD COLUMN IF NOT EXISTS withheld BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE reveal_evidence ADD COLUMN IF NOT EXISTS discovery_work_id INTEGER REFERENCES outline_works(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_reveal_evidence_spotted_by ON reveal_evidence(spotted_by_character_id);
    CREATE INDEX IF NOT EXISTS idx_reveal_evidence_discovery_work ON reveal_evidence(discovery_work_id);

    -- updated_at triggers (update_timestamp() exists in the base schema)
    DROP TRIGGER IF EXISTS update_scene_staging_timestamp ON scene_staging;
    CREATE TRIGGER update_scene_staging_timestamp BEFORE UPDATE ON scene_staging
        FOR EACH ROW EXECUTE FUNCTION update_timestamp();
    DROP TRIGGER IF EXISTS update_trackers_timestamp ON trackers;
    CREATE TRIGGER update_trackers_timestamp BEFORE UPDATE ON trackers
        FOR EACH ROW EXECUTE FUNCTION update_timestamp();

    INSERT INTO migrations (filename) VALUES ('059_scene_staging.sql')
    ON CONFLICT (filename) DO NOTHING;
END
$$;
