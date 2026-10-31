-- Migration: 065_scene_state_notes
-- Description: Canon Over Time (mws-wm4, design mws-44u). One plain-words state
-- note per outline scene, written when the scene is approved: knowledge changes,
-- what stops being true, decisions (+ alternatives turned down), emotion carried
-- forward, open pressures. The next scene's brief receives it instead of
-- rereading prose. Additive (new table only).

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '065_scene_state_notes.sql') THEN
        RAISE NOTICE 'Migration 065_scene_state_notes.sql already applied, skipping.';
        RETURN;
    END IF;

    CREATE TABLE IF NOT EXISTS outline_scene_state_notes (
        id SERIAL PRIMARY KEY,
        work_id INTEGER NOT NULL UNIQUE REFERENCES outline_works(id) ON DELETE CASCADE,
        knowledge_changes TEXT,
        stops_being_true TEXT,
        decisions TEXT,
        alternatives_turned_down TEXT,
        emotion_carried_forward TEXT,
        open_pressures TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO migrations (filename) VALUES ('065_scene_state_notes.sql')
    ON CONFLICT (filename) DO NOTHING;

    RAISE NOTICE 'Migration 065_scene_state_notes.sql completed successfully.';
END $$;
