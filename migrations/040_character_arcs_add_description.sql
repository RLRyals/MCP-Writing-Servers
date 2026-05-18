-- Migration: 040_character_arcs_add_description
-- Description: Add arc_description TEXT to character_arcs so the long-form
-- description has somewhere to live. Until now, create_character_arc has
-- been writing its `arc_description` parameter into the arc_name column
-- (VARCHAR(255)), silently truncating anything longer.
--
-- Schema change:
--   * ADD arc_description TEXT  (long-form, unbounded)
--   * arc_name remains VARCHAR(255) for a short label
--
-- Data backfill:
--   * Copy existing arc_name into arc_description so historical content
--     is preserved on the side that can hold the full text. arc_name is
--     left untouched — callers can decide later whether to clean it up
--     into an actual short label or leave it as-is.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '040_character_arcs_add_description.sql') THEN
        RAISE NOTICE 'Migration 040_character_arcs_add_description.sql already applied, skipping.';
        RETURN;
    END IF;

    ALTER TABLE character_arcs
        ADD COLUMN IF NOT EXISTS arc_description TEXT;

    UPDATE character_arcs
       SET arc_description = arc_name
     WHERE arc_description IS NULL
       AND arc_name IS NOT NULL;

    INSERT INTO migrations (filename) VALUES ('040_character_arcs_add_description.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 040_character_arcs_add_description.sql completed successfully.';
END $$;
