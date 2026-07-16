-- Migration: 047_kanban_cards_pr_ref_unique
-- Description: bead mws-9e9 defect 2 -- create_card is not idempotent under
-- client retry. Live evidence: two byte-identical cards created 1
-- MILLISECOND apart (card ids 63758992.../b12c0bac..., same
-- created_by='claude-code:factory-dispatch'), the shape of two concurrent
-- inserts racing a plain SELECT-then-INSERT dedupe check (a check-then-act
-- guard in application code cannot close this window -- both callers can run
-- the SELECT before either commits the INSERT). A partial unique index lets
-- Postgres itself reject the second insert atomically; card-handlers.js
-- handleCreateCard then falls back to SELECTing the winner on conflict.
--
-- Scoped to (board_id, metadata->>pr_ref) WHERE status <> 'done' AND
-- metadata->>pr_ref IS NOT NULL: a card without a pr_ref never dedupes on
-- this key (falls back to the best-effort title+window check in the
-- handler), and once the original card reaches 'done' a fresh card with the
-- same pr_ref (e.g. a reopened PR) is allowed through again.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '047_kanban_cards_pr_ref_unique.sql') THEN
        RAISE NOTICE 'Migration 047_kanban_cards_pr_ref_unique.sql already applied, skipping.';
        RETURN;
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_kanban_cards_board_pr_ref_not_done
        ON fictionlab.kanban_cards (board_id, (metadata->>'pr_ref'))
        WHERE status <> 'done' AND metadata->>'pr_ref' IS NOT NULL;

    COMMENT ON INDEX fictionlab.idx_kanban_cards_board_pr_ref_not_done IS
        'Retry-safe create_card dedupe key (bead mws-9e9): at most one non-done card per board may carry a given metadata.pr_ref. Enforced via ON CONFLICT in handleCreateCard, not just relied on as a bare constraint.';

    INSERT INTO migrations (filename) VALUES ('047_kanban_cards_pr_ref_unique.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 047_kanban_cards_pr_ref_unique.sql completed successfully.';
END $$;
