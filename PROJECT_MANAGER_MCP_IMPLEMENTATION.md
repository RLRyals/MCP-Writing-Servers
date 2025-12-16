# Project Manager MCP - Implementation Guide

## Table of Contents
1. [Overview](#1-overview)
2. [Database Migration](#2-database-migration)
3. [MCP Server Implementation](#3-mcp-server-implementation)
4. [Tool Schemas](#4-tool-schemas)
5. [Handler Implementation](#5-handler-implementation)
6. [Example Usage](#6-example-usage)
7. [Integration with Electron App](#7-integration-with-electron-app)
8. [Testing Plan](#8-testing-plan)

---

## 1. Overview

### Purpose
The **Project Manager MCP** is designed to manage project folder locations where users save their writing work. It provides a lightweight reference system that links file system directories to the writing database without managing series/book creation.

### Key Concepts
- **Projects are folder references**: A project simply points to a directory on the user's file system
- **Optional metadata links**: Projects can optionally link to existing `author_id`, `series_id`, or `book_id`
- **No cascade deletion**: Deleting a series/book does NOT delete the project folder reference
- **Standalone operation**: Projects can exist without any database links (for standalone documents)

### Use Cases
1. **Standalone Writing Projects**: User wants to write a one-off document not tied to any series
2. **Series-Linked Projects**: User links a project folder to an existing series for organization
3. **Book-Specific Projects**: User creates a project folder for a specific book in a series
4. **Folder Management**: User needs to update or change where their files are stored

---

## 2. Database Migration

### Migration File
Create: `C:\github\MCP-Writing-Servers\migrations\029_create_projects_table.sql`

### Migration SQL

```sql
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
```

---

## 3. MCP Server Implementation

### Server Structure
Create: `C:\github\MCP-Writing-Servers\src\mcps\project-manager-server\index.js`

### Server Code

```javascript
// src/mcps/project-manager-server/index.js
// Project Manager MCP Server - Manages project folder references

// Protect stdout from debug logging in MCP stdio mode
if (process.env.MCP_STDIO_MODE === 'true') {
    const originalConsoleError = console.error;
    console.error = function() {
        process.stderr.write(Array.from(arguments).join(' ') + '\n');
    };
}

import { BaseMCPServer } from '../../shared/base-server.js';
import { ProjectHandlers } from './handlers/project-handlers.js';

class ProjectManagerServer extends BaseMCPServer {
    constructor() {
        super('project-manager', '1.0.0');

        // Initialize project handlers with shared DB connection
        this.projectHandlers = new ProjectHandlers(this.db);

        // Initialize tools after base constructor
        this.tools = this.getTools();

        // Defensive check to ensure tools are properly initialized
        if (!this.tools || !Array.isArray(this.tools) || this.tools.length === 0) {
            console.error('[PROJECT-SERVER] WARNING: Tools not properly initialized!');
            this.tools = this.getTools();
        }

        if (process.env.MCP_STDIO_MODE !== 'true') {
            console.error(`[PROJECT-SERVER] Initialized with ${this.tools.length} tools`);
        }

        // Test database connection on startup
        this.testDatabaseConnection();
    }

    async testDatabaseConnection() {
        try {
            if (this.db) {
                const healthPromise = this.db.healthCheck();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Database health check timed out')), 5000)
                );

                const health = await Promise.race([healthPromise, timeoutPromise]);
                if (health.healthy) {
                    console.error('[PROJECT-SERVER] Database connection verified');
                } else {
                    console.error('[PROJECT-SERVER] Database health check failed:', health.error);
                }
            }
        } catch (error) {
            console.error('[PROJECT-SERVER] Database connection test failed:', error.message);
        }
    }

    getTools() {
        return this.projectHandlers.getProjectTools();
    }

    getToolHandler(toolName) {
        const handlers = {
            'create_project': this.projectHandlers.handleCreateProject.bind(this.projectHandlers),
            'list_projects': this.projectHandlers.handleListProjects.bind(this.projectHandlers),
            'get_project': this.projectHandlers.handleGetProject.bind(this.projectHandlers),
            'update_project': this.projectHandlers.handleUpdateProject.bind(this.projectHandlers),
            'delete_project': this.projectHandlers.handleDeleteProject.bind(this.projectHandlers),
            'link_to_series': this.projectHandlers.handleLinkToSeries.bind(this.projectHandlers),
            'link_to_book': this.projectHandlers.handleLinkToBook.bind(this.projectHandlers),
            'unlink_project': this.projectHandlers.handleUnlinkProject.bind(this.projectHandlers)
        };
        return handlers[toolName];
    }
}

export { ProjectManagerServer };

// CLI runner when called directly
import { fileURLToPath } from 'url';

if (process.env.MCP_STDIO_MODE !== 'true') {
    console.error('[PROJECT-SERVER] Module loaded');
}

const normalizePath = (path) => {
    if (!path) return '';
    let normalizedPath = path.replace(/\\/g, '/');
    if (!normalizedPath.startsWith('file:')) {
        if (process.platform === 'win32') {
            normalizedPath = `file:///${normalizedPath}`;
        } else {
            normalizedPath = `file://${normalizedPath}`;
        }
    }
    normalizedPath = normalizedPath.replace(/^file:\/+/, 'file:///');
    return normalizedPath;
};

const currentModuleUrl = import.meta.url;
const scriptPath = process.argv[1];
const normalizedScriptPath = normalizePath(scriptPath);
const normalizedCurrentModuleUrl = currentModuleUrl.replace(/\/{3,}/g, '///')
    .replace(/^file:\/([^\/])/, 'file:///$1');

const isDirectExecution = normalizedCurrentModuleUrl === normalizedScriptPath ||
    decodeURIComponent(normalizedCurrentModuleUrl) === normalizedScriptPath;

if (process.env.MCP_STDIO_MODE) {
    console.error('[PROJECT-SERVER] Running in MCP stdio mode - starting server...');
    try {
        const server = new ProjectManagerServer();
        await server.run();
    } catch (error) {
        console.error('[PROJECT-SERVER] Failed to start MCP server:', error.message);
        console.error('[PROJECT-SERVER] Stack:', error.stack);
        process.exit(1);
    }
} else if (isDirectExecution) {
    if (process.env.MCP_STDIO_MODE !== 'true') {
        console.error('[PROJECT-SERVER] Starting CLI runner...');
    }
    try {
        const { CLIRunner } = await import('../../shared/cli-runner.js');
        const runner = new CLIRunner(ProjectManagerServer);
        await runner.run();
    } catch (error) {
        console.error('[PROJECT-SERVER] CLI runner failed:', error.message);
        if (process.env.MCP_STDIO_MODE !== 'true') {
            console.error('[PROJECT-SERVER] CLI runner stack:', error.stack);
        }
        throw error;
    }
} else {
    if (process.env.MCP_STDIO_MODE !== 'true') {
        console.error('[PROJECT-SERVER] Module imported - not starting server');
    }
}
```

---

## 4. Tool Schemas

### Schema File
Create: `C:\github\MCP-Writing-Servers\src\mcps\project-manager-server\schemas\project-tools-schema.js`

### Schema Code

```javascript
// src/mcps/project-manager-server/schemas/project-tools-schema.js
// Centralized tool schema definitions for the Project Manager MCP Server

export const projectToolsSchema = [
    {
        name: 'create_project',
        description: 'Create a new project folder reference with optional links to author/series/book',
        inputSchema: {
            type: 'object',
            properties: {
                project_name: {
                    type: 'string',
                    description: 'User-friendly name for the project'
                },
                folder_location: {
                    type: 'string',
                    description: 'Absolute path to the project folder on the file system'
                },
                description: {
                    type: 'string',
                    description: 'Optional description of the project purpose/content'
                },
                author_id: {
                    type: 'integer',
                    description: 'Optional ID of the author this project is linked to'
                },
                series_id: {
                    type: 'integer',
                    description: 'Optional ID of the series this project is linked to'
                },
                book_id: {
                    type: 'integer',
                    description: 'Optional ID of the book this project is linked to'
                }
            },
            required: ['project_name', 'folder_location']
        }
    },
    {
        name: 'list_projects',
        description: 'List all project folder references, optionally filtered by author/series/book',
        inputSchema: {
            type: 'object',
            properties: {
                author_id: {
                    type: 'integer',
                    description: 'Optional: Filter projects by author ID'
                },
                series_id: {
                    type: 'integer',
                    description: 'Optional: Filter projects by series ID'
                },
                book_id: {
                    type: 'integer',
                    description: 'Optional: Filter projects by book ID'
                },
                include_orphaned: {
                    type: 'boolean',
                    description: 'Optional: Include projects with broken links (default: true)'
                }
            },
            required: []
        }
    },
    {
        name: 'get_project',
        description: 'Get detailed information about a specific project by ID',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'integer',
                    description: 'ID of the project to retrieve'
                }
            },
            required: ['project_id']
        }
    },
    {
        name: 'update_project',
        description: 'Update project details (name, folder location, description, or links)',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'integer',
                    description: 'ID of the project to update'
                },
                project_name: {
                    type: 'string',
                    description: 'Optional: New project name'
                },
                folder_location: {
                    type: 'string',
                    description: 'Optional: New absolute path to project folder'
                },
                description: {
                    type: 'string',
                    description: 'Optional: New project description'
                },
                author_id: {
                    type: 'integer',
                    description: 'Optional: New author ID to link to (null to unlink)'
                },
                series_id: {
                    type: 'integer',
                    description: 'Optional: New series ID to link to (null to unlink)'
                },
                book_id: {
                    type: 'integer',
                    description: 'Optional: New book ID to link to (null to unlink)'
                }
            },
            required: ['project_id']
        }
    },
    {
        name: 'delete_project',
        description: 'Delete a project folder reference (does NOT delete the actual folder on disk)',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'integer',
                    description: 'ID of the project reference to delete'
                }
            },
            required: ['project_id']
        }
    },
    {
        name: 'link_to_series',
        description: 'Link an existing project to a series',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'integer',
                    description: 'ID of the project to link'
                },
                series_id: {
                    type: 'integer',
                    description: 'ID of the series to link to'
                }
            },
            required: ['project_id', 'series_id']
        }
    },
    {
        name: 'link_to_book',
        description: 'Link an existing project to a book',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'integer',
                    description: 'ID of the project to link'
                },
                book_id: {
                    type: 'integer',
                    description: 'ID of the book to link to'
                }
            },
            required: ['project_id', 'book_id']
        }
    },
    {
        name: 'unlink_project',
        description: 'Remove author/series/book links from a project',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'integer',
                    description: 'ID of the project to unlink'
                },
                unlink_author: {
                    type: 'boolean',
                    description: 'Set to true to remove author link'
                },
                unlink_series: {
                    type: 'boolean',
                    description: 'Set to true to remove series link'
                },
                unlink_book: {
                    type: 'boolean',
                    description: 'Set to true to remove book link'
                }
            },
            required: ['project_id']
        }
    }
];
```

---

## 5. Handler Implementation

### Handler File
Create: `C:\github\MCP-Writing-Servers\src\mcps\project-manager-server\handlers\project-handlers.js`

### Handler Code

```javascript
// src/mcps/project-manager-server/handlers/project-handlers.js
// Project Management Handlers - CRUD operations for project folder references

import { projectToolsSchema } from '../schemas/project-tools-schema.js';

export class ProjectHandlers {
    constructor(db) {
        this.db = db;
    }

    // =============================================
    // PROJECT TOOL DEFINITIONS
    // =============================================
    getProjectTools() {
        return projectToolsSchema;
    }

    // =============================================
    // PROJECT MANAGEMENT HANDLERS
    // =============================================

    async handleCreateProject(args) {
        try {
            const {
                project_name,
                folder_location,
                description = null,
                author_id = null,
                series_id = null,
                book_id = null
            } = args;

            // Validate required fields
            if (!project_name || !folder_location) {
                throw new Error('project_name and folder_location are required');
            }

            // Check if folder location already exists
            const existingProject = await this.db.query(`
                SELECT id, project_name FROM projects
                WHERE folder_location = $1
            `, [folder_location]);

            if (existingProject.rows.length > 0) {
                throw new Error(
                    `A project already exists at this location: "${existingProject.rows[0].project_name}" (ID: ${existingProject.rows[0].id})`
                );
            }

            // Validate foreign keys if provided
            if (author_id) {
                const authorCheck = await this.db.query('SELECT id FROM authors WHERE id = $1', [author_id]);
                if (authorCheck.rows.length === 0) {
                    throw new Error(`Author with ID ${author_id} not found`);
                }
            }

            if (series_id) {
                const seriesCheck = await this.db.query('SELECT id FROM series WHERE id = $1', [series_id]);
                if (seriesCheck.rows.length === 0) {
                    throw new Error(`Series with ID ${series_id} not found`);
                }
            }

            if (book_id) {
                const bookCheck = await this.db.query('SELECT id FROM books WHERE id = $1', [book_id]);
                if (bookCheck.rows.length === 0) {
                    throw new Error(`Book with ID ${book_id} not found`);
                }
            }

            // Create the project
            const result = await this.db.query(`
                INSERT INTO projects (
                    project_name,
                    folder_location,
                    description,
                    author_id,
                    series_id,
                    book_id
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `, [project_name, folder_location, description, author_id, series_id, book_id]);

            const project = result.rows[0];

            // Get linked entity names for display
            const details = await this._getProjectDetails(project.id);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Created project successfully!\n\n` +
                              `ID: ${details.id}\n` +
                              `Name: ${details.project_name}\n` +
                              `Folder: ${details.folder_location}\n` +
                              `Description: ${details.description || 'None'}\n` +
                              `Author: ${details.author_name || 'Not linked'}\n` +
                              `Series: ${details.series_title || 'Not linked'}\n` +
                              `Book: ${details.book_title || 'Not linked'}\n` +
                              `Created: ${new Date(details.created_at).toLocaleString()}`
                    }
                ]
            };
        } catch (error) {
            if (error.code === '23505') { // Unique constraint violation
                throw new Error('A project already exists at this folder location');
            }
            throw new Error(`Failed to create project: ${error.message}`);
        }
    }

    async handleListProjects(args) {
        try {
            const {
                author_id = null,
                series_id = null,
                book_id = null,
                include_orphaned = true
            } = args;

            let query = `SELECT * FROM projects_with_details WHERE 1=1`;
            const params = [];
            let paramCount = 1;

            // Apply filters
            if (author_id !== null) {
                query += ` AND author_id = $${paramCount++}`;
                params.push(author_id);
            }

            if (series_id !== null) {
                query += ` AND series_id = $${paramCount++}`;
                params.push(series_id);
            }

            if (book_id !== null) {
                query += ` AND book_id = $${paramCount++}`;
                params.push(book_id);
            }

            query += ` ORDER BY created_at DESC`;

            const result = await this.db.query(query, params);
            const projects = result.rows;

            if (projects.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'No projects found matching the criteria.'
                        }
                    ]
                };
            }

            // Format output
            const projectList = projects.map(p => {
                const orphaned = (
                    (p.author_id && !p.author_name) ||
                    (p.series_id && !p.series_title) ||
                    (p.book_id && !p.book_title)
                ) ? ' [ORPHANED]' : '';

                return `ID: ${p.id}\n` +
                       `Name: ${p.project_name}${orphaned}\n` +
                       `Folder: ${p.folder_location}\n` +
                       `Author: ${p.author_name || 'Not linked'}\n` +
                       `Series: ${p.series_title || 'Not linked'}\n` +
                       `Book: ${p.book_title || 'Not linked'}\n` +
                       `Created: ${new Date(p.created_at).toLocaleString()}`;
            }).join('\n\n---\n\n');

            return {
                content: [
                    {
                        type: 'text',
                        text: `Found ${projects.length} project(s):\n\n${projectList}`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to list projects: ${error.message}`);
        }
    }

    async handleGetProject(args) {
        try {
            const { project_id } = args;

            if (!project_id) {
                throw new Error('project_id is required');
            }

            const details = await this._getProjectDetails(project_id);

            if (!details) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No project found with ID: ${project_id}`
                        }
                    ]
                };
            }

            const orphaned = (
                (details.author_id && !details.author_name) ||
                (details.series_id && !details.series_title) ||
                (details.book_id && !details.book_title)
            );

            return {
                content: [
                    {
                        type: 'text',
                        text: `Project Details:\n\n` +
                              `ID: ${details.id}\n` +
                              `Name: ${details.project_name}\n` +
                              `Folder: ${details.folder_location}\n` +
                              `Description: ${details.description || 'None'}\n` +
                              `Author: ${details.author_name || 'Not linked'}\n` +
                              `Series: ${details.series_title || 'Not linked'}\n` +
                              `Book: ${details.book_title || 'Not linked'}\n` +
                              `Status: ${orphaned ? 'ORPHANED (linked entity deleted)' : 'Active'}\n` +
                              `Created: ${new Date(details.created_at).toLocaleString()}\n` +
                              `Updated: ${new Date(details.updated_at).toLocaleString()}`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to get project: ${error.message}`);
        }
    }

    async handleUpdateProject(args) {
        try {
            const {
                project_id,
                project_name,
                folder_location,
                description,
                author_id,
                series_id,
                book_id
            } = args;

            if (!project_id) {
                throw new Error('project_id is required');
            }

            // Check if project exists
            const existingProject = await this.db.query('SELECT id FROM projects WHERE id = $1', [project_id]);
            if (existingProject.rows.length === 0) {
                throw new Error(`Project with ID ${project_id} not found`);
            }

            // Validate foreign keys if provided
            if (author_id !== undefined && author_id !== null) {
                const authorCheck = await this.db.query('SELECT id FROM authors WHERE id = $1', [author_id]);
                if (authorCheck.rows.length === 0) {
                    throw new Error(`Author with ID ${author_id} not found`);
                }
            }

            if (series_id !== undefined && series_id !== null) {
                const seriesCheck = await this.db.query('SELECT id FROM series WHERE id = $1', [series_id]);
                if (seriesCheck.rows.length === 0) {
                    throw new Error(`Series with ID ${series_id} not found`);
                }
            }

            if (book_id !== undefined && book_id !== null) {
                const bookCheck = await this.db.query('SELECT id FROM books WHERE id = $1', [book_id]);
                if (bookCheck.rows.length === 0) {
                    throw new Error(`Book with ID ${book_id} not found`);
                }
            }

            // Build dynamic update query
            const updates = [];
            const values = [];
            let paramCount = 1;

            if (project_name !== undefined) {
                updates.push(`project_name = $${paramCount++}`);
                values.push(project_name);
            }

            if (folder_location !== undefined) {
                updates.push(`folder_location = $${paramCount++}`);
                values.push(folder_location);
            }

            if (description !== undefined) {
                updates.push(`description = $${paramCount++}`);
                values.push(description);
            }

            if (author_id !== undefined) {
                updates.push(`author_id = $${paramCount++}`);
                values.push(author_id);
            }

            if (series_id !== undefined) {
                updates.push(`series_id = $${paramCount++}`);
                values.push(series_id);
            }

            if (book_id !== undefined) {
                updates.push(`book_id = $${paramCount++}`);
                values.push(book_id);
            }

            if (updates.length === 0) {
                throw new Error('No fields to update');
            }

            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(project_id);

            const query = `
                UPDATE projects
                SET ${updates.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            await this.db.query(query, values);

            // Get updated project details
            const details = await this._getProjectDetails(project_id);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Updated project successfully!\n\n` +
                              `ID: ${details.id}\n` +
                              `Name: ${details.project_name}\n` +
                              `Folder: ${details.folder_location}\n` +
                              `Description: ${details.description || 'None'}\n` +
                              `Author: ${details.author_name || 'Not linked'}\n` +
                              `Series: ${details.series_title || 'Not linked'}\n` +
                              `Book: ${details.book_title || 'Not linked'}\n` +
                              `Updated: ${new Date(details.updated_at).toLocaleString()}`
                    }
                ]
            };
        } catch (error) {
            if (error.code === '23505') {
                throw new Error('A project already exists at this folder location');
            }
            throw new Error(`Failed to update project: ${error.message}`);
        }
    }

    async handleDeleteProject(args) {
        try {
            const { project_id } = args;

            if (!project_id) {
                throw new Error('project_id is required');
            }

            // Get project details before deletion
            const details = await this._getProjectDetails(project_id);

            if (!details) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No project found with ID: ${project_id}`
                        }
                    ]
                };
            }

            // Delete the project reference
            await this.db.query('DELETE FROM projects WHERE id = $1', [project_id]);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Deleted project reference successfully!\n\n` +
                              `ID: ${details.id}\n` +
                              `Name: ${details.project_name}\n` +
                              `Folder: ${details.folder_location}\n\n` +
                              `NOTE: The actual folder on disk was NOT deleted, only the database reference.`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to delete project: ${error.message}`);
        }
    }

    async handleLinkToSeries(args) {
        try {
            const { project_id, series_id } = args;

            if (!project_id || !series_id) {
                throw new Error('project_id and series_id are required');
            }

            // Validate series exists
            const seriesCheck = await this.db.query('SELECT id, title FROM series WHERE id = $1', [series_id]);
            if (seriesCheck.rows.length === 0) {
                throw new Error(`Series with ID ${series_id} not found`);
            }

            // Update project
            const result = await this.db.query(`
                UPDATE projects
                SET series_id = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *
            `, [series_id, project_id]);

            if (result.rows.length === 0) {
                throw new Error(`Project with ID ${project_id} not found`);
            }

            const details = await this._getProjectDetails(project_id);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Linked project to series successfully!\n\n` +
                              `Project: ${details.project_name}\n` +
                              `Series: ${details.series_title}\n` +
                              `Updated: ${new Date(details.updated_at).toLocaleString()}`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to link project to series: ${error.message}`);
        }
    }

    async handleLinkToBook(args) {
        try {
            const { project_id, book_id } = args;

            if (!project_id || !book_id) {
                throw new Error('project_id and book_id are required');
            }

            // Validate book exists
            const bookCheck = await this.db.query('SELECT id, title FROM books WHERE id = $1', [book_id]);
            if (bookCheck.rows.length === 0) {
                throw new Error(`Book with ID ${book_id} not found`);
            }

            // Update project
            const result = await this.db.query(`
                UPDATE projects
                SET book_id = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *
            `, [book_id, project_id]);

            if (result.rows.length === 0) {
                throw new Error(`Project with ID ${project_id} not found`);
            }

            const details = await this._getProjectDetails(project_id);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Linked project to book successfully!\n\n` +
                              `Project: ${details.project_name}\n` +
                              `Book: ${details.book_title}\n` +
                              `Updated: ${new Date(details.updated_at).toLocaleString()}`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to link project to book: ${error.message}`);
        }
    }

    async handleUnlinkProject(args) {
        try {
            const {
                project_id,
                unlink_author = false,
                unlink_series = false,
                unlink_book = false
            } = args;

            if (!project_id) {
                throw new Error('project_id is required');
            }

            if (!unlink_author && !unlink_series && !unlink_book) {
                throw new Error('At least one unlink flag must be true');
            }

            const updates = [];
            if (unlink_author) updates.push('author_id = NULL');
            if (unlink_series) updates.push('series_id = NULL');
            if (unlink_book) updates.push('book_id = NULL');
            updates.push('updated_at = CURRENT_TIMESTAMP');

            const result = await this.db.query(`
                UPDATE projects
                SET ${updates.join(', ')}
                WHERE id = $1
                RETURNING *
            `, [project_id]);

            if (result.rows.length === 0) {
                throw new Error(`Project with ID ${project_id} not found`);
            }

            const details = await this._getProjectDetails(project_id);

            const unlinked = [];
            if (unlink_author) unlinked.push('Author');
            if (unlink_series) unlinked.push('Series');
            if (unlink_book) unlinked.push('Book');

            return {
                content: [
                    {
                        type: 'text',
                        text: `Unlinked project successfully!\n\n` +
                              `Project: ${details.project_name}\n` +
                              `Removed links: ${unlinked.join(', ')}\n` +
                              `Updated: ${new Date(details.updated_at).toLocaleString()}`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to unlink project: ${error.message}`);
        }
    }

    // =============================================
    // HELPER METHODS
    // =============================================

    async _getProjectDetails(project_id) {
        const result = await this.db.query(`
            SELECT * FROM projects_with_details
            WHERE id = $1
        `, [project_id]);

        return result.rows[0] || null;
    }
}
```

---

## 6. Example Usage

### Example 1: Create Standalone Project

```javascript
// User wants to create a standalone writing project (not linked to any series)
{
  tool: "create_project",
  args: {
    project_name: "Random Short Stories",
    folder_location: "C:\\Users\\Author\\Documents\\Stories",
    description: "Collection of standalone short stories"
  }
}

// Response:
// Created project successfully!
// ID: 1
// Name: Random Short Stories
// Folder: C:\Users\Author\Documents\Stories
// Description: Collection of standalone short stories
// Author: Not linked
// Series: Not linked
// Book: Not linked
```

### Example 2: Create Project Linked to Series

```javascript
// User wants to link a project to an existing series
{
  tool: "create_project",
  args: {
    project_name: "The Dragon Chronicles - Working Files",
    folder_location: "C:\\Users\\Author\\Writing\\DragonChronicles",
    description: "Series planning and draft materials",
    author_id: 1,
    series_id: 5
  }
}

// Response:
// Created project successfully!
// ID: 2
// Name: The Dragon Chronicles - Working Files
// Folder: C:\Users\Author\Writing\DragonChronicles
// Description: Series planning and draft materials
// Author: Jane Doe
// Series: The Dragon Chronicles
// Book: Not linked
```

### Example 3: List All Projects

```javascript
// List all projects
{
  tool: "list_projects",
  args: {}
}

// Response:
// Found 3 project(s):
// ID: 3
// Name: Book 2 Drafts
// Folder: C:\Users\Author\Writing\Book2
// Author: Jane Doe
// Series: The Dragon Chronicles
// Book: Dragon's Fury
// Created: 12/16/2025, 3:45 PM
//
// ---
//
// ID: 2
// Name: The Dragon Chronicles - Working Files
// Folder: C:\Users\Author\Writing\DragonChronicles
// Author: Jane Doe
// Series: The Dragon Chronicles
// Book: Not linked
// Created: 12/16/2025, 2:30 PM
```

### Example 4: Update Folder Location

```javascript
// User moved their project folder to a new location
{
  tool: "update_project",
  args: {
    project_id: 2,
    folder_location: "D:\\NewDrive\\Writing\\DragonChronicles"
  }
}

// Response:
// Updated project successfully!
// ID: 2
// Name: The Dragon Chronicles - Working Files
// Folder: D:\NewDrive\Writing\DragonChronicles
// Description: Series planning and draft materials
// Author: Jane Doe
// Series: The Dragon Chronicles
// Book: Not linked
```

### Example 5: Link Existing Project to Book

```javascript
// User wants to link a project to a specific book
{
  tool: "link_to_book",
  args: {
    project_id: 1,
    book_id: 8
  }
}

// Response:
// Linked project to book successfully!
// Project: Random Short Stories
// Book: The Final Chapter
// Updated: 12/16/2025, 4:15 PM
```

### Example 6: Unlink Project from Series

```javascript
// User wants to remove the series link but keep the project
{
  tool: "unlink_project",
  args: {
    project_id: 2,
    unlink_series: true
  }
}

// Response:
// Unlinked project successfully!
// Project: The Dragon Chronicles - Working Files
// Removed links: Series
// Updated: 12/16/2025, 4:30 PM
```

### Example 7: Delete Project Reference

```javascript
// User wants to delete the project reference (folder on disk remains)
{
  tool: "delete_project",
  args: {
    project_id: 1
  }
}

// Response:
// Deleted project reference successfully!
// ID: 1
// Name: Random Short Stories
// Folder: C:\Users\Author\Documents\Stories
//
// NOTE: The actual folder on disk was NOT deleted, only the database reference.
```

---

## 7. Integration with Electron App

### How the Electron App Will Use This MCP

The Electron app will communicate with the Project Manager MCP via **stdio** (standard input/output). Here's how it works:

### 7.1 Configuration

In the Electron app's MCP configuration file (e.g., `mcp-config.json`):

```json
{
  "mcpServers": {
    "project-manager": {
      "command": "node",
      "args": [
        "C:\\github\\MCP-Writing-Servers\\src\\mcps\\project-manager-server\\index.js"
      ],
      "env": {
        "MCP_STDIO_MODE": "true",
        "DATABASE_URL": "postgresql://user:pass@localhost:5432/writing_db"
      }
    }
  }
}
```

### 7.2 Calling Tools from Electron

The Electron app will use the MCP SDK to call tools:

```javascript
// Example: Create a project from Electron app
async function createProject(projectName, folderPath, seriesId = null) {
  const client = await getMCPClient('project-manager');

  const result = await client.callTool('create_project', {
    project_name: projectName,
    folder_location: folderPath,
    series_id: seriesId
  });

  return result;
}

// Example: List projects filtered by series
async function getProjectsForSeries(seriesId) {
  const client = await getMCPClient('project-manager');

  const result = await client.callTool('list_projects', {
    series_id: seriesId
  });

  return result;
}

// Example: Update project folder location
async function updateProjectFolder(projectId, newFolderPath) {
  const client = await getMCPClient('project-manager');

  const result = await client.callTool('update_project', {
    project_id: projectId,
    folder_location: newFolderPath
  });

  return result;
}
```

### 7.3 UI Components

The Electron app will need UI components to:

1. **Browse and select folders** - Use Electron's `dialog.showOpenDialog()` to let users choose project folders
2. **Display project list** - Show projects in a table/list with folder locations and links
3. **Create/Edit project forms** - Forms for creating and editing project references
4. **Link management** - Dropdowns to select author/series/book to link to

### 7.4 Example Electron Renderer Code

```javascript
// renderer.js - Example of creating a project from UI
const { ipcRenderer } = require('electron');

// User clicks "Create Project" button
document.getElementById('createProjectBtn').addEventListener('click', async () => {
  const projectName = document.getElementById('projectName').value;
  const folderPath = document.getElementById('folderPath').value;
  const seriesId = document.getElementById('seriesSelect').value || null;

  try {
    const result = await ipcRenderer.invoke('mcp-call', {
      server: 'project-manager',
      tool: 'create_project',
      args: {
        project_name: projectName,
        folder_location: folderPath,
        series_id: seriesId ? parseInt(seriesId) : null
      }
    });

    alert('Project created successfully!');
    // Refresh project list
    loadProjects();
  } catch (error) {
    alert(`Error creating project: ${error.message}`);
  }
});

// Load projects on page load
async function loadProjects() {
  const result = await ipcRenderer.invoke('mcp-call', {
    server: 'project-manager',
    tool: 'list_projects',
    args: {}
  });

  // Parse result and populate UI table
  displayProjects(result.content[0].text);
}
```

---

## 8. Testing Plan

### 8.1 Unit Tests

Create test file: `C:\github\MCP-Writing-Servers\tests\project-manager.test.js`

#### Test Cases

1. **Test: Create project with required fields only**
   - Input: `{ project_name, folder_location }`
   - Expected: Project created with no links
   - Verify: Database row exists, all link fields are NULL

2. **Test: Create project with all fields**
   - Input: `{ project_name, folder_location, description, author_id, series_id, book_id }`
   - Expected: Project created with all links
   - Verify: Foreign keys resolve correctly

3. **Test: Create duplicate folder location**
   - Input: Same `folder_location` as existing project
   - Expected: Error thrown
   - Verify: Error message mentions duplicate

4. **Test: Create project with invalid author_id**
   - Input: `author_id` that doesn't exist
   - Expected: Error thrown
   - Verify: Foreign key violation caught

5. **Test: List all projects**
   - Setup: Create 3 projects with different links
   - Expected: Returns all 3 projects
   - Verify: Output contains all project names

6. **Test: List projects filtered by series_id**
   - Setup: Create projects with series_id = 1 and series_id = 2
   - Input: `{ series_id: 1 }`
   - Expected: Returns only projects with series_id = 1

7. **Test: Get project by ID**
   - Setup: Create a project
   - Input: `{ project_id }`
   - Expected: Returns full project details
   - Verify: All fields match created project

8. **Test: Update project name**
   - Setup: Create a project
   - Input: `{ project_id, project_name: "New Name" }`
   - Expected: Project name updated
   - Verify: updated_at timestamp changed

9. **Test: Update project folder location**
   - Setup: Create a project
   - Input: `{ project_id, folder_location: "C:\\NewPath" }`
   - Expected: Folder location updated
   - Verify: No duplicate constraint violation

10. **Test: Delete project**
    - Setup: Create a project
    - Input: `{ project_id }`
    - Expected: Project deleted from database
    - Verify: Query returns 0 rows

11. **Test: Link project to series**
    - Setup: Create project without series link
    - Input: `{ project_id, series_id }`
    - Expected: Project now linked to series
    - Verify: series_id field updated

12. **Test: Unlink project from series**
    - Setup: Create project with series link
    - Input: `{ project_id, unlink_series: true }`
    - Expected: series_id set to NULL
    - Verify: Project still exists but series_id is NULL

13. **Test: Orphaned project detection**
    - Setup: Create project linked to series, then delete the series
    - Expected: Project remains, series_id becomes NULL
    - Verify: ON DELETE SET NULL works correctly

14. **Test: List orphaned projects**
    - Setup: Create project linked to deleted series
    - Input: Query `orphaned_projects` view
    - Expected: Project appears in orphaned list

### 8.2 Integration Tests

1. **Test: Full project lifecycle**
   - Create project → Link to series → Update folder → Unlink → Delete
   - Verify each step succeeds

2. **Test: Multiple projects for same series**
   - Create 3 projects all linked to series_id = 1
   - List by series_id
   - Verify all 3 returned

3. **Test: Cascade behavior when series deleted**
   - Create project linked to series
   - Delete series
   - Verify project still exists with series_id = NULL

### 8.3 Manual Testing Checklist

- [ ] Create project via Electron app UI
- [ ] Browse for folder using file dialog
- [ ] Link project to existing series via dropdown
- [ ] View project list in UI table
- [ ] Edit project name and folder location
- [ ] Unlink project from series
- [ ] Delete project and verify folder still exists on disk
- [ ] Test with non-existent folder path
- [ ] Test with Windows paths (backslashes)
- [ ] Test with Unix paths (forward slashes)

### 8.4 Test Script Example

```javascript
// tests/project-manager.test.js
import { ProjectManagerServer } from '../src/mcps/project-manager-server/index.js';
import { expect } from 'chai';

describe('Project Manager MCP', () => {
  let server;

  before(async () => {
    server = new ProjectManagerServer();
    await server.db.connect();
  });

  after(async () => {
    await server.cleanup();
  });

  describe('create_project', () => {
    it('should create project with required fields only', async () => {
      const handler = server.getToolHandler('create_project');
      const result = await handler({
        project_name: 'Test Project',
        folder_location: 'C:\\Test\\Folder'
      });

      expect(result.content[0].text).to.include('Created project successfully');
    });

    it('should reject duplicate folder location', async () => {
      const handler = server.getToolHandler('create_project');

      // Create first project
      await handler({
        project_name: 'Project 1',
        folder_location: 'C:\\Duplicate\\Path'
      });

      // Try to create second with same folder
      try {
        await handler({
          project_name: 'Project 2',
          folder_location: 'C:\\Duplicate\\Path'
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('already exists');
      }
    });
  });

  describe('list_projects', () => {
    it('should list all projects', async () => {
      const handler = server.getToolHandler('list_projects');
      const result = await handler({});

      expect(result.content[0].text).to.include('Found');
    });

    it('should filter by series_id', async () => {
      const handler = server.getToolHandler('list_projects');
      const result = await handler({ series_id: 1 });

      // Verify all results have series_id = 1
      expect(result.content[0].text).to.not.include('Not linked');
    });
  });

  // Add more test cases...
});
```

---

## Implementation Checklist

### Database Setup
- [ ] Create migration file `029_create_projects_table.sql`
- [ ] Run migration on development database
- [ ] Verify tables created: `projects`
- [ ] Verify views created: `projects_with_details`, `orphaned_projects`
- [ ] Verify indexes created
- [ ] Test foreign key constraints (SET NULL on delete)

### Server Implementation
- [ ] Create directory: `src/mcps/project-manager-server`
- [ ] Create `index.js` (server entry point)
- [ ] Create `schemas/project-tools-schema.js`
- [ ] Create `handlers/project-handlers.js`
- [ ] Test server starts without errors
- [ ] Test CLI runner mode
- [ ] Test stdio mode

### Tool Implementation
- [ ] Implement `create_project` tool
- [ ] Implement `list_projects` tool
- [ ] Implement `get_project` tool
- [ ] Implement `update_project` tool
- [ ] Implement `delete_project` tool
- [ ] Implement `link_to_series` tool
- [ ] Implement `link_to_book` tool
- [ ] Implement `unlink_project` tool

### Testing
- [ ] Write unit tests for all handlers
- [ ] Write integration tests
- [ ] Test with real database
- [ ] Test error handling
- [ ] Test edge cases (NULL values, invalid IDs)
- [ ] Manual testing via CLI
- [ ] Manual testing via Electron app

### Documentation
- [ ] Update main README with project-manager MCP
- [ ] Add API documentation
- [ ] Add examples to wiki
- [ ] Update Electron app docs with project features

---

## Notes & Best Practices

### Path Handling
- **Always use absolute paths** for `folder_location`
- Support both Windows (`C:\Users\...`) and Unix (`/home/user/...`) paths
- Do NOT create/delete folders on disk - only manage references
- Validate paths exist before creating projects (optional feature)

### Foreign Key Strategy
- Use `ON DELETE SET NULL` for all foreign keys
- This ensures projects survive when linked entities are deleted
- Projects become "orphaned" but remain accessible
- Use `orphaned_projects` view to find and clean up orphaned projects

### Performance
- Index all foreign key columns for fast filtering
- Index `created_at` for sorted list queries
- Use views for complex joins (performance + readability)

### Security
- Validate folder paths to prevent directory traversal attacks
- Sanitize user input for project names
- Use parameterized queries to prevent SQL injection
- Limit folder path length to prevent buffer overflow

### User Experience
- Clearly indicate when projects are orphaned
- Provide helpful error messages
- Allow bulk operations (e.g., unlink all orphaned projects)
- Support search/filter by project name

---

## Conclusion

This implementation guide provides everything needed to build the **Project Manager MCP** for the MCP-Writing-Servers project. The MCP follows the established patterns from existing servers (series-server, author-server) and integrates seamlessly with the database schema.

**Key Takeaways:**
1. Projects are lightweight folder references
2. No cascade deletes - projects survive when linked entities are deleted
3. Optional links to author/series/book enable flexible organization
4. Standalone projects support one-off writing tasks
5. Integration with Electron app is straightforward via stdio

Ready for implementation!
