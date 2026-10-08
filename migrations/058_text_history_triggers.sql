-- Migration: 058_text_history_triggers
-- Description: Trigger-backed text history for chapter_scenes.scene_content and
-- outline_works.content. A BEFORE UPDATE/DELETE trigger copies the OLD text into
-- a history table whenever the text actually changes (IS DISTINCT FROM), so every
-- write path (MCP tools, workflows, direct SQL) is versioned.
-- History rows carry no foreign key to the live row so they survive its deletion.
-- chapter_scenes.scene_revisions (TEXT[]) is left in place, unused and deprecated;
-- the history table supersedes it and it is not backfilled.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '058_text_history_triggers.sql') THEN
        RAISE NOTICE 'Migration 058_text_history_triggers.sql already applied, skipping.';
        RETURN;
    END IF;

    CREATE TABLE IF NOT EXISTS chapter_scenes_history (
        id SERIAL PRIMARY KEY,
        scene_id INTEGER NOT NULL,
        old_content TEXT,
        change_kind VARCHAR(10) NOT NULL DEFAULT 'update'
            CHECK (change_kind IN ('update','delete')),
        changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        changed_by TEXT NOT NULL DEFAULT current_user,
        application_name TEXT NOT NULL DEFAULT current_setting('application_name', true)
    );
    CREATE INDEX IF NOT EXISTS idx_chapter_scenes_history_scene
        ON chapter_scenes_history(scene_id, id DESC);

    CREATE TABLE IF NOT EXISTS outline_works_history (
        id SERIAL PRIMARY KEY,
        work_id INTEGER NOT NULL,
        old_content TEXT,
        change_kind VARCHAR(10) NOT NULL DEFAULT 'update'
            CHECK (change_kind IN ('update','delete')),
        changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        changed_by TEXT NOT NULL DEFAULT current_user,
        application_name TEXT NOT NULL DEFAULT current_setting('application_name', true)
    );
    CREATE INDEX IF NOT EXISTS idx_outline_works_history_work
        ON outline_works_history(work_id, id DESC);

    CREATE OR REPLACE FUNCTION record_scene_content_history() RETURNS TRIGGER AS $fn$
    BEGIN
        IF TG_OP = 'DELETE' THEN
            IF OLD.scene_content IS NOT NULL THEN
                INSERT INTO chapter_scenes_history (scene_id, old_content, change_kind)
                VALUES (OLD.id, OLD.scene_content, 'delete');
            END IF;
            RETURN OLD;
        END IF;
        IF NEW.scene_content IS DISTINCT FROM OLD.scene_content THEN
            INSERT INTO chapter_scenes_history (scene_id, old_content, change_kind)
            VALUES (OLD.id, OLD.scene_content, 'update');
        END IF;
        RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION record_outline_work_content_history() RETURNS TRIGGER AS $fn$
    BEGIN
        IF TG_OP = 'DELETE' THEN
            IF OLD.content IS NOT NULL THEN
                INSERT INTO outline_works_history (work_id, old_content, change_kind)
                VALUES (OLD.id, OLD.content, 'delete');
            END IF;
            RETURN OLD;
        END IF;
        IF NEW.content IS DISTINCT FROM OLD.content THEN
            INSERT INTO outline_works_history (work_id, old_content, change_kind)
            VALUES (OLD.id, OLD.content, 'update');
        END IF;
        RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS chapter_scenes_content_history ON chapter_scenes;
    CREATE TRIGGER chapter_scenes_content_history
        BEFORE UPDATE OR DELETE ON chapter_scenes
        FOR EACH ROW EXECUTE FUNCTION record_scene_content_history();

    DROP TRIGGER IF EXISTS outline_works_content_history ON outline_works;
    CREATE TRIGGER outline_works_content_history
        BEFORE UPDATE OR DELETE ON outline_works
        FOR EACH ROW EXECUTE FUNCTION record_outline_work_content_history();

    INSERT INTO migrations (filename) VALUES ('058_text_history_triggers.sql')
    ON CONFLICT (filename) DO NOTHING;
END
$$;
