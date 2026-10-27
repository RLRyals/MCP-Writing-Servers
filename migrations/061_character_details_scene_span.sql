-- Migration: 061_character_details_scene_span
-- Description: Canon Over Time (mws-4g8). character_details gain start/end
-- outline scene refs so rank/status/habits can expire (e.g. apprentice ->
-- journeyman). NULL start/end = always true. Additive; the old
-- (character_id, category, attribute) unique constraint is replaced by a
-- unique index that also keys on start scene, so a promotion can be a second
-- row for the same attribute that starts where the first one ends.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '061_character_details_scene_span.sql') THEN
        RAISE NOTICE 'Migration 061_character_details_scene_span.sql already applied, skipping.';
        RETURN;
    END IF;

    ALTER TABLE character_details
        ADD COLUMN IF NOT EXISTS start_scene_id INTEGER REFERENCES outline_works(id) ON DELETE SET NULL;
    ALTER TABLE character_details
        ADD COLUMN IF NOT EXISTS end_scene_id INTEGER REFERENCES outline_works(id) ON DELETE SET NULL;

    ALTER TABLE character_details
        DROP CONSTRAINT IF EXISTS character_details_character_id_category_attribute_key;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_character_details_span
        ON character_details (character_id, category, attribute, (COALESCE(start_scene_id, 0)));
    CREATE INDEX IF NOT EXISTS idx_character_details_start_scene ON character_details(start_scene_id);
    CREATE INDEX IF NOT EXISTS idx_character_details_end_scene ON character_details(end_scene_id);

    INSERT INTO migrations (filename) VALUES ('061_character_details_scene_span.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 061_character_details_scene_span.sql completed successfully.';
END $$;
