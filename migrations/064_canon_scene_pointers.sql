-- Migration: 064_canon_scene_pointers
-- Description: Canon Over Time (mws-ntf, design mws-44u). outline_scene_events
-- POINT at the reveal / knowledge / detail / promise row (never copy it) and can
-- start or end a truth. Plot threads become the parent of promises. The
-- learns/reveals/suspects-this-chapter text arrays of character_chapter_presence
-- are retired (that knowledge now lives on character_knowledge + information_reveals).
-- Additive except the three retired array columns.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '064_canon_scene_pointers.sql') THEN
        RAISE NOTICE 'Migration 064_canon_scene_pointers.sql already applied, skipping.';
        RETURN;
    END IF;

    -- scene_events -> reveal / knowledge / detail pointers
    ALTER TABLE outline_scene_events
        ADD COLUMN IF NOT EXISTS reveal_id INTEGER REFERENCES information_reveals(id) ON DELETE SET NULL;
    ALTER TABLE outline_scene_events
        ADD COLUMN IF NOT EXISTS knowledge_id INTEGER REFERENCES character_knowledge(id) ON DELETE SET NULL;
    ALTER TABLE outline_scene_events
        ADD COLUMN IF NOT EXISTS detail_id INTEGER REFERENCES character_details(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_outline_scene_events_reveal ON outline_scene_events(reveal_id);
    CREATE INDEX IF NOT EXISTS idx_outline_scene_events_knowledge ON outline_scene_events(knowledge_id);
    CREATE INDEX IF NOT EXISTS idx_outline_scene_events_detail ON outline_scene_events(detail_id);

    -- 'starts / ends a truth': the pointed-at fact/detail/knowledge row becomes true
    -- (or stops being true) at this scene.
    ALTER TABLE outline_scene_events DROP CONSTRAINT IF EXISTS outline_scene_events_event_type_check;
    ALTER TABLE outline_scene_events ADD CONSTRAINT outline_scene_events_event_type_check
        CHECK (event_type IN (
            'reveals_fact','plants_promise','pays_promise','character_choice','consequence',
            'evidence_produced','evidence_converted',
            'action','position','line','display','sound','prop_state','dressing',
            'reveals','learns','starts_truth','ends_truth'));

    -- plot_threads are the parent of promises
    ALTER TABLE outline_promises
        ADD COLUMN IF NOT EXISTS plot_thread_id INTEGER REFERENCES plot_threads(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_outline_promises_plot_thread ON outline_promises(plot_thread_id);

    -- DEPRECATE (do NOT drop) the per-chapter knowledge arrays
    COMMENT ON COLUMN character_chapter_presence.learns_this_chapter IS 'DEPRECATED 2026-10-27 (mws-ntf): superseded by character_knowledge (copied by migration 064); kept until its data is migrated or confirmed empty, then dropped in a later migration';
    COMMENT ON COLUMN character_chapter_presence.reveals_this_chapter IS 'DEPRECATED 2026-10-27 (mws-ntf): superseded by information_reveals (no automatic copy possible); kept until its data is migrated or confirmed empty, then dropped in a later migration';
    COMMENT ON COLUMN character_chapter_presence.suspects_this_chapter IS 'DEPRECATED 2026-10-27 (mws-ntf): superseded by character_knowledge level suspects (copied by migration 064); kept until its data is migrated or confirmed empty, then dropped in a later migration';

    -- Non-destructive, idempotent COPY into character_knowledge. Source arrays are untouched.
    -- knowledge_category is NOT NULL but not derivable from free text, so the explicit
    -- placeholder 'uncategorized' is used. learned_book_id comes from the chapter.
    -- Items already present for the character (any level) are not duplicated, which also
    -- makes re-runs no-ops. Blank items and items over 255 chars (the knowledge_item
    -- limit; copying would truncate) are skipped -- they remain in the kept column.
    -- reveals_this_chapter has no target table: not copied.
    INSERT INTO character_knowledge
        (character_id, knowledge_category, knowledge_item, knowledge_level, learned_book_id, learned_context)
    SELECT DISTINCT ON (ccp.character_id, item.txt)
        ccp.character_id, 'uncategorized', item.txt, 'knows', ch.book_id,
        'migrated from character_chapter_presence.learns_this_chapter (chapter ' || ccp.chapter_id || ')'
    FROM character_chapter_presence ccp
    CROSS JOIN LATERAL unnest(ccp.learns_this_chapter) AS item(txt)
    LEFT JOIN chapters ch ON ch.id = ccp.chapter_id
    WHERE item.txt IS NOT NULL AND btrim(item.txt) <> '' AND char_length(item.txt) <= 255
      AND NOT EXISTS (SELECT 1 FROM character_knowledge ck
                      WHERE ck.character_id = ccp.character_id AND ck.knowledge_item = item.txt)
    ORDER BY ccp.character_id, item.txt, ccp.chapter_id;

    INSERT INTO character_knowledge
        (character_id, knowledge_category, knowledge_item, knowledge_level, learned_book_id, learned_context)
    SELECT DISTINCT ON (ccp.character_id, item.txt)
        ccp.character_id, 'uncategorized', item.txt, 'suspects', ch.book_id,
        'migrated from character_chapter_presence.suspects_this_chapter (chapter ' || ccp.chapter_id || ')'
    FROM character_chapter_presence ccp
    CROSS JOIN LATERAL unnest(ccp.suspects_this_chapter) AS item(txt)
    LEFT JOIN chapters ch ON ch.id = ccp.chapter_id
    WHERE item.txt IS NOT NULL AND btrim(item.txt) <> '' AND char_length(item.txt) <= 255
      AND NOT EXISTS (SELECT 1 FROM character_knowledge ck
                      WHERE ck.character_id = ccp.character_id AND ck.knowledge_item = item.txt)
    ORDER BY ccp.character_id, item.txt, ccp.chapter_id;

    INSERT INTO migrations (filename) VALUES ('064_canon_scene_pointers.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 064_canon_scene_pointers.sql completed successfully.';
END $$;
