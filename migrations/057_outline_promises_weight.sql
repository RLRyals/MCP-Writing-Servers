-- Migration: 057_outline_promises_weight
-- Description: Add a nullable weight grade (low/medium/high/critical) to the
-- promise ledger so the drafting brief can rank what a scene owes.
-- Nullable, no backfill: existing rows are unaffected.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '057_outline_promises_weight.sql') THEN
        RAISE NOTICE 'Migration 057_outline_promises_weight.sql already applied, skipping.';
        RETURN;
    END IF;

    ALTER TABLE outline_promises ADD COLUMN IF NOT EXISTS weight VARCHAR(10);
    ALTER TABLE outline_promises DROP CONSTRAINT IF EXISTS outline_promises_weight_check;
    ALTER TABLE outline_promises ADD CONSTRAINT outline_promises_weight_check
        CHECK (weight IS NULL OR weight IN ('low','medium','high','critical'));

    INSERT INTO migrations (filename) VALUES ('057_outline_promises_weight.sql')
    ON CONFLICT (filename) DO NOTHING;
END
$$;
