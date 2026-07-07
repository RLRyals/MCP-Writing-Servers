-- Migration: 042_kanban_tables
-- Description: Kanban board plugin (S11) — boards, columns, cards, card links,
-- comments, and an append-only activity log. All tables live in schema
-- `fictionlab`, prefixed `kanban_`. Seeds the single `dev-backlog` board + its
-- 8 columns (idempotent).
--
-- Numbered 042 (not 041): 041 is reserved for S9 model-testing
-- (041_model_testing_tables.sql, not yet on disk at the time this migration
-- was written) — see GH issue #58 / S11-kanban-plugin.md §1. Re-scan
-- migrations/ for the true next free number if that has changed by the time
-- this is applied, and keep the filename + the guard string in sync.
--
-- Card lifecycle status: backlog -> ready -> claimed -> in_progress -> review
-- -> done -> archived, with `blocked` as a side state. `kanban_cards.status`
-- is the single source of truth for "where a card is" — `kanban_columns` is
-- display config keyed 1:1 to a status (no column_id FK on the card, no
-- dual-write to keep the two in sync).
--
-- review_policy (§11.5 resolution, an addition on top of the original §3a
-- column table): per-card, risk-based review gate. Defaulted by the
-- `create_card` handler (not by the DB column default alone, since the DB
-- can't inspect card content/labels to pick a risk class) to 'review-required'
-- unless the caller/handler determines the card is docs/specs/reports/
-- analysis-only, in which case 'auto-done'. Agents may escalate a card to
-- review-required but must never downgrade it themselves.
--
-- kanban_enforce_human_reserve is belt-and-suspenders: a card with
-- assignee='rebecca' can NEVER be agent-claimable regardless of what the
-- caller passed. claim_card's WHERE clause independently checks the same
-- condition (defense in depth, not redundant — see kanban-server
-- claim-handlers.js).

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '042_kanban_tables.sql') THEN
        RAISE NOTICE 'Migration 042_kanban_tables.sql already applied, skipping.';
        RETURN;
    END IF;

    CREATE SCHEMA IF NOT EXISTS fictionlab;

    -- =========================================================
    -- 1. kanban_boards
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.kanban_boards (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        board_key   VARCHAR(100) UNIQUE NOT NULL,
        name        VARCHAR(255) NOT NULL,
        description TEXT,
        is_archived BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        created_by  VARCHAR(100) DEFAULT 'rebecca',
        metadata    JSONB DEFAULT '{}'::jsonb
    );

    COMMENT ON TABLE fictionlab.kanban_boards IS 'Kanban boards. v1 seeds exactly one (dev-backlog); schema supports many.';

    RAISE NOTICE 'Created fictionlab.kanban_boards';

    -- =========================================================
    -- 2. kanban_columns — ordered display lanes, 1:1 with a card status
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.kanban_columns (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        board_id         UUID NOT NULL REFERENCES fictionlab.kanban_boards(id) ON DELETE CASCADE,
        status_key       VARCHAR(50) NOT NULL,
        name             VARCHAR(255) NOT NULL,
        position         INTEGER NOT NULL DEFAULT 0,
        color            VARCHAR(20),
        wip_limit        INTEGER,
        is_agent_pickup  BOOLEAN DEFAULT FALSE,
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (board_id, status_key)
    );

    CREATE INDEX IF NOT EXISTS idx_kanban_columns_board_position
        ON fictionlab.kanban_columns(board_id, position);

    COMMENT ON TABLE fictionlab.kanban_columns IS 'Display lanes keyed 1:1 to kanban_cards.status. No column_id FK on the card — move_card only ever touches kanban_cards.status.';
    COMMENT ON COLUMN fictionlab.kanban_columns.is_agent_pickup IS 'TRUE only on the ready lane — cards here are the agent pool.';

    RAISE NOTICE 'Created fictionlab.kanban_columns';

    -- =========================================================
    -- 3. kanban_cards
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.kanban_cards (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        board_id              UUID NOT NULL REFERENCES fictionlab.kanban_boards(id) ON DELETE CASCADE,
        title                 VARCHAR(500) NOT NULL,
        body                  TEXT,
        status                VARCHAR(50) NOT NULL DEFAULT 'backlog'
            CHECK (status IN ('backlog','ready','claimed','in_progress','review','blocked','done','archived')),
        assignee              VARCHAR(100),
        agent_claimable       BOOLEAN NOT NULL DEFAULT TRUE,
        priority              VARCHAR(20) DEFAULT 'normal'
            CHECK (priority IN ('low','normal','high','urgent')),
        labels                TEXT[] DEFAULT '{}',
        position              INTEGER DEFAULT 0,
        claimed_by            VARCHAR(100),
        claimed_at            TIMESTAMPTZ,
        workflow_registry_id  UUID REFERENCES fictionlab.active_workflows(id)
            ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
        spec_ref              VARCHAR(500),
        issue_ref             VARCHAR(500),
        review_policy         VARCHAR(20) NOT NULL DEFAULT 'review-required'
            CHECK (review_policy IN ('auto-done','review-required')),
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW(),
        created_by            VARCHAR(100) DEFAULT 'rebecca',
        metadata              JSONB DEFAULT '{}'::jsonb
    );

    CREATE INDEX IF NOT EXISTS idx_kanban_cards_board_status ON fictionlab.kanban_cards(board_id, status);
    CREATE INDEX IF NOT EXISTS idx_kanban_cards_assignee ON fictionlab.kanban_cards(assignee);
    CREATE INDEX IF NOT EXISTS idx_kanban_cards_status ON fictionlab.kanban_cards(status);
    CREATE INDEX IF NOT EXISTS idx_kanban_cards_labels ON fictionlab.kanban_cards USING GIN(labels);
    CREATE INDEX IF NOT EXISTS idx_kanban_cards_workflow_registry ON fictionlab.kanban_cards(workflow_registry_id);
    CREATE INDEX IF NOT EXISTS idx_kanban_cards_ready_pool
        ON fictionlab.kanban_cards(board_id, position)
        WHERE status = 'ready' AND agent_claimable;

    COMMENT ON TABLE fictionlab.kanban_cards IS 'A kanban card — the detailed issue spec (file:line, plan, acceptance criteria) lives in body.';
    COMMENT ON COLUMN fictionlab.kanban_cards.agent_claimable IS 'Set FALSE by trigger when assignee=''rebecca''; the hard gate for agent claims.';
    COMMENT ON COLUMN fictionlab.kanban_cards.review_policy IS 'auto-done | review-required. Defaulted by risk class at create_card time (handler-level, not just this column default). Agents may escalate, never downgrade.';

    RAISE NOTICE 'Created fictionlab.kanban_cards';

    -- =========================================================
    -- 4. kanban_card_links — 0..n typed links beyond the two inline refs
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.kanban_card_links (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        card_id    UUID NOT NULL REFERENCES fictionlab.kanban_cards(id) ON DELETE CASCADE,
        link_type  VARCHAR(30) NOT NULL
            CHECK (link_type IN ('spec','github_issue','workflow_run','file','url','card')),
        ref        TEXT NOT NULL,
        label      VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_kanban_card_links_card ON fictionlab.kanban_card_links(card_id);

    RAISE NOTICE 'Created fictionlab.kanban_card_links';

    -- =========================================================
    -- 5. kanban_comments — comment thread
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.kanban_comments (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        card_id    UUID NOT NULL REFERENCES fictionlab.kanban_cards(id) ON DELETE CASCADE,
        author     VARCHAR(100) NOT NULL,
        body       TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        metadata   JSONB DEFAULT '{}'::jsonb
    );

    CREATE INDEX IF NOT EXISTS idx_kanban_comments_card_created ON fictionlab.kanban_comments(card_id, created_at);

    RAISE NOTICE 'Created fictionlab.kanban_comments';

    -- =========================================================
    -- 6. kanban_activity — append-only audit / activity log
    -- =========================================================
    CREATE TABLE IF NOT EXISTS fictionlab.kanban_activity (
        id          BIGSERIAL PRIMARY KEY,
        board_id    UUID REFERENCES fictionlab.kanban_boards(id) ON DELETE CASCADE,
        card_id     UUID REFERENCES fictionlab.kanban_cards(id) ON DELETE CASCADE,
        actor       VARCHAR(100) NOT NULL,
        action      VARCHAR(50) NOT NULL,
        from_status VARCHAR(50),
        to_status   VARCHAR(50),
        detail      JSONB DEFAULT '{}'::jsonb,
        created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_kanban_activity_board_created ON fictionlab.kanban_activity(board_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_kanban_activity_card_created ON fictionlab.kanban_activity(card_id, created_at DESC);

    COMMENT ON TABLE fictionlab.kanban_activity IS 'Append-only audit feed. action IN (created, claimed, claim_denied, moved, assigned, commented, updated, linked, archived).';

    RAISE NOTICE 'Created fictionlab.kanban_activity';

    -- =========================================================
    -- Triggers
    -- =========================================================

    -- BEFORE UPDATE timestamp trigger, shared by kanban_boards + kanban_cards
    CREATE OR REPLACE FUNCTION fictionlab.kanban_update_timestamp()
    RETURNS TRIGGER AS $func$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trigger_kanban_boards_update_timestamp ON fictionlab.kanban_boards;
    CREATE TRIGGER trigger_kanban_boards_update_timestamp
        BEFORE UPDATE ON fictionlab.kanban_boards
        FOR EACH ROW
        EXECUTE FUNCTION fictionlab.kanban_update_timestamp();

    DROP TRIGGER IF EXISTS trigger_kanban_cards_update_timestamp ON fictionlab.kanban_cards;
    CREATE TRIGGER trigger_kanban_cards_update_timestamp
        BEFORE UPDATE ON fictionlab.kanban_cards
        FOR EACH ROW
        EXECUTE FUNCTION fictionlab.kanban_update_timestamp();

    -- Human-reserve guard: a card assigned to rebecca is NEVER agent-claimable,
    -- no matter what the caller passed for agent_claimable.
    CREATE OR REPLACE FUNCTION fictionlab.kanban_enforce_human_reserve()
    RETURNS TRIGGER AS $func$
    BEGIN
        IF NEW.assignee = 'rebecca' THEN
            NEW.agent_claimable := FALSE;
        END IF;
        RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trigger_kanban_cards_enforce_human_reserve ON fictionlab.kanban_cards;
    CREATE TRIGGER trigger_kanban_cards_enforce_human_reserve
        BEFORE INSERT OR UPDATE ON fictionlab.kanban_cards
        FOR EACH ROW
        EXECUTE FUNCTION fictionlab.kanban_enforce_human_reserve();

    RAISE NOTICE 'Created kanban_update_timestamp + kanban_enforce_human_reserve triggers';

    -- =========================================================
    -- Seed: the ONE board + its 8 columns (idempotent)
    -- =========================================================
    INSERT INTO fictionlab.kanban_boards (board_key, name, description)
    VALUES (
        'dev-backlog',
        'Development backlog',
        'Live pipeline dev + personal task board. Archive/history: WORKFLOW-FIXES.md.'
    )
    ON CONFLICT (board_key) DO NOTHING;

    INSERT INTO fictionlab.kanban_columns (board_id, status_key, name, position, is_agent_pickup)
    SELECT b.id, c.status_key, c.name, c.position, c.is_agent_pickup
    FROM fictionlab.kanban_boards b
    CROSS JOIN (VALUES
        ('backlog',     'Backlog',              0, FALSE),
        ('ready',       'Ready to work',         1, TRUE),
        ('in_progress', 'In progress',           2, FALSE),
        ('review',      'In review',             3, FALSE),
        ('blocked',     'Blocked / decision',    4, FALSE),
        ('done',        'Done',                  5, FALSE),
        ('archived',    'Archived',              6, FALSE),
        ('claimed',     'Claimed',                7, FALSE)
    ) AS c(status_key, name, position, is_agent_pickup)
    WHERE b.board_key = 'dev-backlog'
    ON CONFLICT (board_id, status_key) DO NOTHING;

    RAISE NOTICE 'Seeded dev-backlog board + 8 columns';

    INSERT INTO migrations (filename) VALUES ('042_kanban_tables.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Migration 042_kanban_tables.sql completed successfully';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Created 6 tables in schema fictionlab: kanban_boards, kanban_columns,';
    RAISE NOTICE 'kanban_cards, kanban_card_links, kanban_comments, kanban_activity';
    RAISE NOTICE 'Created 2 trigger functions: kanban_update_timestamp, kanban_enforce_human_reserve';
    RAISE NOTICE 'Seeded board: dev-backlog (8 columns)';
    RAISE NOTICE '=================================================================';
END $$;
