-- Migration: 062_reveal_scene_refs
-- Description: Canon Over Time (mws-7oa). Every chapter-number field on
-- information_reveals / reveal_evidence / information_flow becomes an
-- outline-scene ref (outline_works.id); book/chapter are derived from the
-- scene, never stored. information_flow can also name the READER as learner
-- (reader reveal = a reveal whose information_flow has learned_by_reader).
-- DATA SAFETY: the legacy chapter-number columns are NOT dropped. A chapter
-- number cannot be mapped to a scene id automatically, so any existing values
-- are left untouched; the columns are marked DEPRECATED and kept until their
-- data is migrated or confirmed empty, then dropped in a later migration.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '062_reveal_scene_refs.sql') THEN
        RAISE NOTICE 'Migration 062_reveal_scene_refs.sql already applied, skipping.';
        RETURN;
    END IF;

    ALTER TABLE information_reveals
        ADD COLUMN IF NOT EXISTS revealed_in_scene_id INTEGER REFERENCES outline_works(id) ON DELETE SET NULL;
    -- Array of scene ids (no FK possible on array elements; handlers validate).
    ALTER TABLE information_reveals
        ADD COLUMN IF NOT EXISTS foreshadowing_scene_ids INTEGER[];

    ALTER TABLE reveal_evidence
        ADD COLUMN IF NOT EXISTS discovery_scene_id INTEGER REFERENCES outline_works(id) ON DELETE SET NULL;

    ALTER TABLE information_flow
        ADD COLUMN IF NOT EXISTS learned_in_scene_id INTEGER REFERENCES outline_works(id) ON DELETE SET NULL;
    ALTER TABLE information_flow
        ADD COLUMN IF NOT EXISTS learned_by_reader BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE information_flow ALTER COLUMN learned_by_character_id DROP NOT NULL;
    ALTER TABLE information_flow DROP CONSTRAINT IF EXISTS chk_information_flow_learner;
    ALTER TABLE information_flow ADD CONSTRAINT chk_information_flow_learner
        CHECK (learned_by_reader OR learned_by_character_id IS NOT NULL);

    COMMENT ON COLUMN information_reveals.revealed_in_chapter IS 'DEPRECATED 2026-10-27 (mws-7oa): superseded by revealed_in_scene_id; kept until its data is migrated or confirmed empty, then dropped in a later migration';
    COMMENT ON COLUMN information_reveals.foreshadowing_chapters IS 'DEPRECATED 2026-10-27 (mws-7oa): superseded by foreshadowing_scene_ids; kept until its data is migrated or confirmed empty, then dropped in a later migration';
    COMMENT ON COLUMN reveal_evidence.discovery_chapter IS 'DEPRECATED 2026-10-27 (mws-7oa): superseded by discovery_scene_id; kept until its data is migrated or confirmed empty, then dropped in a later migration';
    COMMENT ON COLUMN information_flow.learned_in_chapter IS 'DEPRECATED 2026-10-27 (mws-7oa): superseded by learned_in_scene_id; kept until its data is migrated or confirmed empty, then dropped in a later migration';

    CREATE INDEX IF NOT EXISTS idx_information_reveals_scene ON information_reveals(revealed_in_scene_id);
    CREATE INDEX IF NOT EXISTS idx_reveal_evidence_scene ON reveal_evidence(discovery_scene_id);
    CREATE INDEX IF NOT EXISTS idx_information_flow_scene ON information_flow(learned_in_scene_id);
    CREATE INDEX IF NOT EXISTS idx_information_flow_reader ON information_flow(reveal_id) WHERE learned_by_reader;

    INSERT INTO migrations (filename) VALUES ('062_reveal_scene_refs.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 062_reveal_scene_refs.sql completed successfully.';
END $$;
