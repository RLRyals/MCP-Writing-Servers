-- Migration 029: Project Manager Tables
-- Purpose: Track user project folder locations with optional links to authors/series/books
-- Projects are standalone folder references - NO CASCADE DELETE

DO $$
BEGIN
    -- Check if migration was already applied
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '029_create_projects_table.sql') THEN
        RAISE NOTICE 'Migration 029_create_projects_table.sql already applied, skipping.';
        RETURN;
    END IF;

-- =============================================
-- PROJECTS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    project_name TEXT NOT NULL,
    folder_location TEXT NOT NULL,  -- Absolute path to user's chosen folder
    description TEXT,                -- Optional project description
    author_id INTEGER,               -- Optional link to authors table (no cascade)
    series_id INTEGER,               -- Optional link to series table (no cascade)
    book_id INTEGER,                 -- Optional link to books table (no cascade)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure unique folder locations (can't have duplicate project refs to same folder)
    CONSTRAINT unique_folder_location UNIQUE(folder_location)
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX IF NOT EXISTS idx_projects_author ON projects(author_id);
CREATE INDEX IF NOT EXISTS idx_projects_series ON projects(series_id);
CREATE INDEX IF NOT EXISTS idx_projects_book ON projects(book_id);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(project_name);
CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at);

-- =============================================
-- FOREIGN KEY CONSTRAINTS (NO CASCADE)
-- =============================================

-- Foreign keys WITHOUT CASCADE - projects are independent references
DO $fk_block$
BEGIN
    -- Author foreign key (SET NULL on delete - project survives if author deleted)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_projects_author'
    ) THEN
        ALTER TABLE projects
            ADD CONSTRAINT fk_projects_author
            FOREIGN KEY (author_id)
            REFERENCES authors(id)
            ON DELETE SET NULL;
    END IF;

    -- Series foreign key (SET NULL on delete - project survives if series deleted)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_projects_series'
    ) THEN
        ALTER TABLE projects
            ADD CONSTRAINT fk_projects_series
            FOREIGN KEY (series_id)
            REFERENCES series(id)
            ON DELETE SET NULL;
    END IF;

    -- Book foreign key (SET NULL on delete - project survives if book deleted)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_projects_book'
    ) THEN
        ALTER TABLE projects
            ADD CONSTRAINT fk_projects_book
            FOREIGN KEY (book_id)
            REFERENCES books(id)
            ON DELETE SET NULL;
    END IF;
END $fk_block$;

-- =============================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================

COMMENT ON TABLE projects IS 'Project folder references - tracks where users save their writing files';
COMMENT ON COLUMN projects.project_name IS 'User-friendly name for the project';
COMMENT ON COLUMN projects.folder_location IS 'Absolute file system path to project folder';
COMMENT ON COLUMN projects.author_id IS 'Optional link to authors table (orphaned if author deleted)';
COMMENT ON COLUMN projects.series_id IS 'Optional link to series table (orphaned if series deleted)';
COMMENT ON COLUMN projects.book_id IS 'Optional link to books table (orphaned if book deleted)';
COMMENT ON COLUMN projects.description IS 'User-provided description of project purpose/content';

-- =============================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =============================================

DO $trigger_block$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_timestamp') THEN
        DROP TRIGGER IF EXISTS update_projects_timestamp ON projects;
        CREATE TRIGGER update_projects_timestamp
            BEFORE UPDATE ON projects
            FOR EACH ROW
            EXECUTE FUNCTION update_timestamp();
    END IF;
END $trigger_block$;

-- =============================================
-- HELPER VIEWS
-- =============================================

-- View: Projects with linked entity names
CREATE OR REPLACE VIEW projects_with_details AS
SELECT
    p.id,
    p.project_name,
    p.folder_location,
    p.description,
    p.author_id,
    a.name AS author_name,
    p.series_id,
    s.title AS series_title,
    p.book_id,
    b.title AS book_title,
    p.created_at,
    p.updated_at
FROM projects p
LEFT JOIN authors a ON p.author_id = a.id
LEFT JOIN series s ON p.series_id = s.id
LEFT JOIN books b ON p.book_id = b.id
ORDER BY p.created_at DESC;

COMMENT ON VIEW projects_with_details IS 'Projects with resolved author/series/book names for display';

-- View: Orphaned projects (linked entities were deleted)
CREATE OR REPLACE VIEW orphaned_projects AS
SELECT
    p.id,
    p.project_name,
    p.folder_location,
    CASE
        WHEN p.author_id IS NOT NULL AND a.id IS NULL THEN 'author_deleted'
        WHEN p.series_id IS NOT NULL AND s.id IS NULL THEN 'series_deleted'
        WHEN p.book_id IS NOT NULL AND b.id IS NULL THEN 'book_deleted'
        ELSE 'none'
    END AS orphan_type,
    p.created_at
FROM projects p
LEFT JOIN authors a ON p.author_id = a.id
LEFT JOIN series s ON p.series_id = s.id
LEFT JOIN books b ON p.book_id = b.id
WHERE
    (p.author_id IS NOT NULL AND a.id IS NULL) OR
    (p.series_id IS NOT NULL AND s.id IS NULL) OR
    (p.book_id IS NOT NULL AND b.id IS NULL);

COMMENT ON VIEW orphaned_projects IS 'Projects with broken links (linked entity was deleted)';

-- =============================================
-- RECORD MIGRATION
-- =============================================

INSERT INTO migrations (filename) VALUES ('029_create_projects_table.sql')
ON CONFLICT DO NOTHING;

RAISE NOTICE 'Migration 029_create_projects_table.sql completed successfully.';
RAISE NOTICE 'Created projects table with optional author/series/book links';
RAISE NOTICE 'Projects are independent - deleting series/books does NOT delete projects';

END $$;
