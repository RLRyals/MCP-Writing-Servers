-- Migration: 066_widen_world_text_columns
-- Description: bead mws-1ut. A planning model wrote a sentence into
-- world_elements.rarity (VARCHAR(50)) and create_world_element died with
-- "value too long for type character varying(50)". Widen the short columns that
-- receive model-written text to VARCHAR(100). Widening only: no drops, no
-- renames, existing rows are untouched. The handlers now also validate lengths
-- up front (src/shared/field-validation.js) and report field/limit/length.
-- Idempotent: ALTER ... TYPE VARCHAR(100) on an already-100 column is a no-op.

DO $$
BEGIN
    IF to_regclass('public.world_elements') IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'world_elements' AND column_name = 'rarity') THEN
        ALTER TABLE world_elements ALTER COLUMN rarity TYPE VARCHAR(100);
    END IF;

    IF to_regclass('public.organizations') IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'organizations' AND column_name = 'status') THEN
        ALTER TABLE organizations ALTER COLUMN status TYPE VARCHAR(100);
    END IF;

    INSERT INTO migrations (filename) VALUES ('066_widen_world_text_columns.sql')
    ON CONFLICT (filename) DO NOTHING;
END $$;
