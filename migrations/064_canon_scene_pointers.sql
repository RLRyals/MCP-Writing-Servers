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

    -- retire the per-chapter knowledge arrays
    ALTER TABLE character_chapter_presence DROP COLUMN IF EXISTS learns_this_chapter;
    ALTER TABLE character_chapter_presence DROP COLUMN IF EXISTS reveals_this_chapter;
    ALTER TABLE character_chapter_presence DROP COLUMN IF EXISTS suspects_this_chapter;

    INSERT INTO migrations (filename) VALUES ('064_canon_scene_pointers.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 064_canon_scene_pointers.sql completed successfully.';
END $$;
