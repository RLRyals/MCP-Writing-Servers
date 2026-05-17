-- Migration: 038_outline_extensions
-- Description: Outline-server extensions from first-round feedback.
--   * pov_character_id on outline_works (FK to existing characters table)
--     so scenes have a structured POV and get_scene_brief can auto-populate
--     present_character_ids.
--   * converted_fact_id on outline_evidence_chain (optional link from a
--     converted finding to the fact it produced).
--   * idx on outline_works(status) to support list-by-status queries.
-- No new tables. No duplication of fields already on legacy tables
-- (word counts stay on chapters/chapter_scenes; characters CRUD stays
-- in the existing characters MCP).

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '038_outline_extensions.sql') THEN
        RAISE NOTICE 'Migration 038_outline_extensions.sql already applied, skipping.';
        RETURN;
    END IF;

    ALTER TABLE outline_works
        ADD COLUMN IF NOT EXISTS pov_character_id INTEGER
            REFERENCES characters(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_outline_works_pov
        ON outline_works(pov_character_id);

    CREATE INDEX IF NOT EXISTS idx_outline_works_status
        ON outline_works(status);

    ALTER TABLE outline_evidence_chain
        ADD COLUMN IF NOT EXISTS converted_fact_id INTEGER
            REFERENCES outline_facts(id) ON DELETE SET NULL;

    INSERT INTO migrations (filename) VALUES ('038_outline_extensions.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 038_outline_extensions.sql completed successfully.';
END $$;
