-- Migration: 060_storyweave
-- Description: Canon DB storage for Dramatica encode tracks + storyweave
-- interleave beats (mws-ci9), so dramatica workflow nodes read upstream stages
-- from the DB instead of files. Additive only.
--   * storyforms: + storypoints (JSONB), catalyst, inhibitor, signposts (JSONB)
--     (the fields encode previously read from storyform_of_record.md)
--   * storyweave_tracks: 4 throughlines x 16 progressions per storyform
--   * storyweave_interleave: ordered beat list weaving the tracks together

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '060_storyweave.sql') THEN
        RAISE NOTICE 'Migration 060_storyweave.sql already applied, skipping.';
        RETURN;
    END IF;

    ALTER TABLE storyforms ADD COLUMN IF NOT EXISTS storypoints JSONB;
    ALTER TABLE storyforms ADD COLUMN IF NOT EXISTS catalyst VARCHAR(100);
    ALTER TABLE storyforms ADD COLUMN IF NOT EXISTS inhibitor VARCHAR(100);
    ALTER TABLE storyforms ADD COLUMN IF NOT EXISTS signposts JSONB;

    CREATE TABLE IF NOT EXISTS storyweave_tracks (
        id SERIAL PRIMARY KEY,
        storyform_id INTEGER NOT NULL REFERENCES storyforms(id) ON DELETE CASCADE,
        throughline VARCHAR(2) NOT NULL CHECK (throughline IN ('OS','MC','IC','RS')),
        progression INTEGER NOT NULL CHECK (progression BETWEEN 1 AND 16),
        signpost INTEGER CHECK (signpost IS NULL OR signpost BETWEEN 1 AND 4),
        appreciation VARCHAR(150),
        text TEXT,
        hidden_text TEXT,
        extra JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (storyform_id, throughline, progression)
    );
    CREATE INDEX IF NOT EXISTS idx_storyweave_tracks_storyform ON storyweave_tracks(storyform_id);

    CREATE TABLE IF NOT EXISTS storyweave_interleave (
        id SERIAL PRIMARY KEY,
        storyform_id INTEGER NOT NULL REFERENCES storyforms(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL CHECK (seq >= 1),
        throughline VARCHAR(2) CHECK (throughline IS NULL OR throughline IN ('OS','MC','IC','RS')),
        progression INTEGER CHECK (progression IS NULL OR progression BETWEEN 1 AND 16),
        beat TEXT NOT NULL,
        extra JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (storyform_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_storyweave_interleave_storyform ON storyweave_interleave(storyform_id);

    DROP TRIGGER IF EXISTS update_storyweave_tracks_timestamp ON storyweave_tracks;
    CREATE TRIGGER update_storyweave_tracks_timestamp
        BEFORE UPDATE ON storyweave_tracks
        FOR EACH ROW EXECUTE FUNCTION update_timestamp();
    DROP TRIGGER IF EXISTS update_storyweave_interleave_timestamp ON storyweave_interleave;
    CREATE TRIGGER update_storyweave_interleave_timestamp
        BEFORE UPDATE ON storyweave_interleave
        FOR EACH ROW EXECUTE FUNCTION update_timestamp();

    INSERT INTO migrations (filename) VALUES ('060_storyweave.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 060_storyweave.sql completed successfully.';
END $$;
