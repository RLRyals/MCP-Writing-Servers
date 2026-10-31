-- Migration: 063_character_knowledge_anchors
-- Description: Canon Over Time (mws-2gk). character_knowledge gains "known
-- from" anchors: a scene | before the series | off-page (known by scene X);
-- links to the fact / reveal the knowledge is about; and a 'locked' level
-- (e.g. a location locked in a character's mind). Additive. Book/chapter
-- are derived from the scene, never stored.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '063_character_knowledge_anchors.sql') THEN
        RAISE NOTICE 'Migration 063_character_knowledge_anchors.sql already applied, skipping.';
        RETURN;
    END IF;

    ALTER TABLE character_knowledge
        ADD COLUMN IF NOT EXISTS known_from VARCHAR(20);
    ALTER TABLE character_knowledge
        ADD COLUMN IF NOT EXISTS known_scene_id INTEGER REFERENCES outline_works(id) ON DELETE SET NULL;
    ALTER TABLE character_knowledge
        ADD COLUMN IF NOT EXISTS fact_id INTEGER REFERENCES outline_facts(id) ON DELETE SET NULL;
    ALTER TABLE character_knowledge
        ADD COLUMN IF NOT EXISTS reveal_id INTEGER REFERENCES information_reveals(id) ON DELETE SET NULL;

    ALTER TABLE character_knowledge DROP CONSTRAINT IF EXISTS chk_character_knowledge_known_from;
    ALTER TABLE character_knowledge ADD CONSTRAINT chk_character_knowledge_known_from
        CHECK (known_from IS NULL OR known_from IN ('scene', 'before_series', 'off_page'));
    -- scene / off_page need the scene (learned there / known by then); before_series has none.
    ALTER TABLE character_knowledge DROP CONSTRAINT IF EXISTS chk_character_knowledge_anchor_scene;
    ALTER TABLE character_knowledge ADD CONSTRAINT chk_character_knowledge_anchor_scene
        CHECK (known_from IS NULL
               OR (known_from = 'before_series' AND known_scene_id IS NULL)
               OR (known_from <> 'before_series' AND known_scene_id IS NOT NULL));

    -- knowledge_level is free-form VARCHAR; 'locked' needs no schema change.
    COMMENT ON COLUMN character_knowledge.knowledge_level IS 'knows, suspects, unaware, forgot, locked';

    CREATE INDEX IF NOT EXISTS idx_character_knowledge_scene ON character_knowledge(known_scene_id);
    CREATE INDEX IF NOT EXISTS idx_character_knowledge_fact ON character_knowledge(fact_id);
    CREATE INDEX IF NOT EXISTS idx_character_knowledge_reveal ON character_knowledge(reveal_id);

    INSERT INTO migrations (filename) VALUES ('063_character_knowledge_anchors.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 063_character_knowledge_anchors.sql completed successfully.';
END $$;
