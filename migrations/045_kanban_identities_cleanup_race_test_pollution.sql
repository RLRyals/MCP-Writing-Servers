-- Migration: 045_kanban_identities_cleanup_race_test_pollution
-- Description: One-time, idempotent cleanup for the identity pollution bug
-- fixed in bead mws-1783883496146-1 (GH issue #76). Before that fix,
-- test/kanban-server/concurrent-claim-test.js minted 40 throwaway agent ids
-- per run (claim_card auto-registers any first-seen claiming agent id as a
-- permanent kind='agent' row -- see claim-handlers.js / migration 044) and
-- never cleaned them up, so any run against a real database permanently
-- polluted the fictionlab.kanban_identities dropdown with rows like
-- 'claude-code:race-a-7' / 'local-qwen3-14b:race-b-7'.
--
-- This is a DOCUMENTED, RE-RUNNABLE migration for any deployment that still
-- carries that pollution (the specific instance this bug was filed from was
-- already hand-cleaned per the bead's "Already done" note -- this migration
-- exists so every OTHER clone/environment gets the same cleanup through the
-- normal migration path instead of someone hand-running DELETEs against a
-- live database again).
--
-- Matches BOTH the old un-namespaced ids the test used to mint
-- ('claude-code:race-a-<n>', 'local-qwen3-14b:race-b-<n>') and the new
-- 'test:'-namespaced ids the fixed test now mints, in case a test run was
-- ever interrupted before its own in-process cleanup (concurrent-claim-test.js
-- finally block) could run. Scoped tightly to kind='agent' and the exact
-- race-[ab]-<n> suffix pattern -- this can never touch a real
-- human/persona/agent identity, whose ids don't match this shape.

DO $$
DECLARE
    deleted_count INT;
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '045_kanban_identities_cleanup_race_test_pollution.sql') THEN
        RAISE NOTICE 'Migration 045_kanban_identities_cleanup_race_test_pollution.sql already applied, skipping.';
        RETURN;
    END IF;

    DELETE FROM fictionlab.kanban_identities
     WHERE kind = 'agent'
       AND (
            id ~ '^claude-code:race-[ab]-[0-9]+$'
         OR id ~ '^local-qwen3-14b:race-[ab]-[0-9]+$'
         OR id ~ '^test:claude-code:race-[ab]-[0-9]+$'
         OR id ~ '^test:local-qwen3-14b:race-[ab]-[0-9]+$'
       );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    INSERT INTO migrations (filename) VALUES ('045_kanban_identities_cleanup_race_test_pollution.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Migration 045_kanban_identities_cleanup_race_test_pollution.sql completed';
    RAISE NOTICE 'Deleted % stray concurrent-claim-test.js identity row(s)', deleted_count;
    RAISE NOTICE '=================================================================';
END $$;
