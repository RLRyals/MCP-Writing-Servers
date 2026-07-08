-- Migration: 043_kanban_cards_add_due_at
-- Description: S14 fold-in minimum (S14-broadquill-dashboard-plugin.md
-- Status header) — kanban cards need a due date so the S11 board can filter
-- "due / overdue" without waiting on the full S14 business panel
-- (bq_deadlines / bq_pipeline_items) follow-up. `assignee` already exists on
-- kanban_cards (migration 042) and already supports "assigned to Rebecca"
-- filtering via list_cards(assignee:'rebecca') — no schema change needed for
-- that half of the S14 minimum.
--
-- Numbered 043 (not 041): 041 remains reserved for S9 model-testing per
-- 042_kanban_tables.sql's own header note, even though it is still unclaimed
-- on disk at the time this migration was written — re-scan migrations/ for
-- the true next free number if that has changed by the time this is applied.
--
-- due_at is TIMESTAMPTZ (not DATE) to match every other timestamp column on
-- kanban_cards and to allow a specific time-of-day deadline, not just a
-- calendar date. NULL = no deadline (the common case).

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '043_kanban_cards_add_due_at.sql') THEN
        RAISE NOTICE 'Migration 043_kanban_cards_add_due_at.sql already applied, skipping.';
        RETURN;
    END IF;

    ALTER TABLE fictionlab.kanban_cards
        ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

    COMMENT ON COLUMN fictionlab.kanban_cards.due_at IS
        'Optional card due date/time (S14 fold-in minimum). NULL = no deadline. Drives list_cards(due_filter) and the board''s due/overdue filter.';

    -- Partial index: only rows that actually carry a deadline and are not
    -- already done/archived are ever relevant to an overdue/upcoming scan.
    CREATE INDEX IF NOT EXISTS idx_kanban_cards_due_at
        ON fictionlab.kanban_cards(due_at)
        WHERE due_at IS NOT NULL AND status NOT IN ('done', 'archived');

    INSERT INTO migrations (filename) VALUES ('043_kanban_cards_add_due_at.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 043_kanban_cards_add_due_at.sql completed successfully.';
END $$;
