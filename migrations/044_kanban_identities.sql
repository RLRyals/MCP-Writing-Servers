-- Migration: 044_kanban_identities
-- Description: Replace the kanban human-gate's hardcoded 'rebecca' literal
-- with an identities model (GH issue #62). Cards will be assigned to more
-- than one human/identity: Rebecca's mother (running her own books through
-- the same system), pen names acting as themselves ("post to socials as
-- Blake Merrick"), and future hires (PA, editor). Before this migration only
-- assignee='rebecca' ever set agent_claimable=FALSE -- a card assigned to
-- 'mom' or 'assistant' stayed agent-claimable, so an agent could legally
-- claim work meant for a human. The gate must be identity-kind-driven, not
-- name-driven.
--
-- Numbered 044 (next free after 043_kanban_cards_add_due_at.sql; 041 remains
-- reserved for S9 model-testing per 042's own header note). Re-scan
-- migrations/ for the true next free number if that has changed by the time
-- this is applied.
--
-- fictionlab.kanban_identities: id VARCHAR(100) PK (matches assignee values
-- 1:1 -- no FK enforced on kanban_cards.assignee, by design: a card may be
-- pre-assigned to an identity string before it's formally registered, and an
-- unrecognized string may still reach the table via raw SQL bypassing the
-- app layer -- the trigger below fails safe in that case rather than a hard
-- FK violation). kind IN ('human','persona','agent'):
--   - human   -> NEVER agent-claimable. The hard gate.
--   - persona -> agent-claimable. A pen-name/persona card ("post to socials
--     as Blake Merrick") may be executed by an agent acting AS that persona
--     -- including claim_card claiming using the persona's own id as
--     `agent` (kanban-server claim-handlers.js).
--   - agent   -> agent-claimable. A registered agent/worker identity.
--     claim_card self-registers any first-seen claiming agent id as
--     kind='agent' (ON CONFLICT DO NOTHING) so the fail-safe below never
--     misfires on a claim's own UPDATE and flips agent_claimable back off
--     for a card an agent legitimately just won.
-- Seed: ('rebecca','Rebecca','human') -- existing behavior unchanged.
--
-- kanban_enforce_human_reserve (rewritten): agent_claimable is forced FALSE
-- when NEW.assignee resolves to an active 'human' identity, OR when
-- NEW.assignee is set at all but matches NO active identity row --
-- fail-safe: an unrecognized assignee is treated as human (not claimable)
-- rather than silently staying agent-claimable. A NULL assignee (unassigned
-- pool) is never touched. A known active 'persona' or 'agent' identity is
-- left alone -- whatever agent_claimable the caller/default passed stands.
-- This remains belt-and-suspenders, same spirit as the original 042 trigger:
-- kanban-server's create_card/update_card independently REJECT an
-- unrecognized assignee before it ever reaches this trigger (see
-- kanban-helpers.js validateAssignee) -- the trigger's fail-safe branch is
-- defense-in-depth for a write that bypasses that validation, not the
-- primary gate.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '044_kanban_identities.sql') THEN
        RAISE NOTICE 'Migration 044_kanban_identities.sql already applied, skipping.';
        RETURN;
    END IF;

    -- =========================================================
    -- 1. kanban_identities
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.kanban_identities (
        id           VARCHAR(100) PRIMARY KEY,
        display_name TEXT,
        kind         TEXT NOT NULL CHECK (kind IN ('human', 'persona', 'agent')),
        active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    COMMENT ON TABLE fictionlab.kanban_identities IS 'Identities that a kanban_cards.assignee value may resolve to. Drives the human-claimable gate (see kanban_enforce_human_reserve) -- replaces the old hardcoded assignee=''rebecca'' literal (GH issue #62).';
    COMMENT ON COLUMN fictionlab.kanban_identities.kind IS 'human = never agent-claimable (hard gate; also the fail-safe default for any unrecognized assignee). persona = pen-name/actor identity, agent-claimable (an agent may act AS this persona, including claiming with the persona''s own id). agent = a registered agent/worker identity, agent-claimable.';

    RAISE NOTICE 'Created fictionlab.kanban_identities';

    INSERT INTO fictionlab.kanban_identities (id, display_name, kind)
    VALUES ('rebecca', 'Rebecca', 'human')
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Seeded kanban_identities: rebecca (human)';

    -- =========================================================
    -- 2. Rewrite kanban_enforce_human_reserve to be identity-kind-driven
    --    (function body only -- the existing BEFORE INSERT OR UPDATE trigger
    --    on kanban_cards from migration 042 already points at this function
    --    name, so no DROP/CREATE TRIGGER is needed here).
    -- =========================================================
    CREATE OR REPLACE FUNCTION fictionlab.kanban_enforce_human_reserve()
    RETURNS TRIGGER AS $func$
    DECLARE
        identity_kind TEXT;
    BEGIN
        IF NEW.assignee IS NOT NULL THEN
            SELECT kind INTO identity_kind
            FROM fictionlab.kanban_identities
            WHERE id = NEW.assignee AND active;

            -- NULL identity_kind = no active identity row matches this
            -- assignee at all -- fail-safe: treat as human, never claimable.
            IF identity_kind IS NULL OR identity_kind = 'human' THEN
                NEW.agent_claimable := FALSE;
            END IF;
        END IF;
        RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

    RAISE NOTICE 'Rewrote kanban_enforce_human_reserve trigger function (identity-kind-driven)';

    -- Column comment update (was: "Set FALSE by trigger when assignee='rebecca'").
    COMMENT ON COLUMN fictionlab.kanban_cards.agent_claimable IS 'Set FALSE by trigger (kanban_enforce_human_reserve) when assignee resolves to an active human identity, or to no known identity at all (fail-safe). The hard gate for agent claims.';

    INSERT INTO migrations (filename) VALUES ('044_kanban_identities.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Migration 044_kanban_identities.sql completed successfully';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Created table fictionlab.kanban_identities (human|persona|agent)';
    RAISE NOTICE 'Seeded identity: rebecca (human)';
    RAISE NOTICE 'Rewrote kanban_enforce_human_reserve: identity-kind-driven, fail-safe on unknown assignee';
    RAISE NOTICE '=================================================================';
END $$;
