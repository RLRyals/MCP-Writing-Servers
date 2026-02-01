-- Migration 032: FictionLab Schema Migration
-- Description: Migrate workflow tables from public schema to fictionlab schema
-- - Removes legacy phase-based system (phases_json, workflow_approvals)
-- - Removes version locking (workflow_version_locks)
-- - Renames columns: workflow_def_id → id, dependencies_json → dependencies, marketplace_metadata → metadata
-- - Creates clean graph-based workflow system in fictionlab schema

DO $$
BEGIN
    -- Check if migration was already applied
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '032_fictionlab_schema_migration.sql') THEN
        RAISE NOTICE 'Migration 032_fictionlab_schema_migration.sql already applied, skipping.';
        RETURN;
    END IF;

-- =============================================
-- CREATE FICTIONLAB SCHEMA
-- =============================================

CREATE SCHEMA IF NOT EXISTS fictionlab;
COMMENT ON SCHEMA fictionlab IS 'FictionLab workflow and domain data (isolated from public schema)';

RAISE NOTICE 'Created fictionlab schema';

-- =============================================
-- CREATE WORKFLOW DEFINITIONS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS fictionlab.workflow_definitions (
    workflow_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0.0',
    description TEXT,
    graph_json JSONB NOT NULL,
    dependencies JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by TEXT,
    is_system BOOLEAN DEFAULT FALSE,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(workflow_id, version)
);

CREATE INDEX IF NOT EXISTS idx_fictionlab_workflow_def_tags ON fictionlab.workflow_definitions USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_fictionlab_workflow_def_system ON fictionlab.workflow_definitions(is_system);
CREATE INDEX IF NOT EXISTS idx_fictionlab_workflow_def_created ON fictionlab.workflow_definitions(created_at);
CREATE INDEX IF NOT EXISTS idx_fictionlab_workflow_def_id_version ON fictionlab.workflow_definitions(workflow_id, version);

COMMENT ON TABLE fictionlab.workflow_definitions IS 'Workflow definition templates with graph-based structure (N8N-style nodes and edges)';
COMMENT ON COLUMN fictionlab.workflow_definitions.workflow_id IS 'Unique workflow identifier (renamed from id/workflow_def_id for consistency)';
COMMENT ON COLUMN fictionlab.workflow_definitions.graph_json IS 'Graph structure with nodes (workflow steps) and edges (connections) for visualization and execution';
COMMENT ON COLUMN fictionlab.workflow_definitions.dependencies IS 'Required components: agents, skills, MCP servers, sub-workflows (formerly dependencies_json)';
COMMENT ON COLUMN fictionlab.workflow_definitions.metadata IS 'Marketplace and display metadata (formerly marketplace_metadata)';
COMMENT ON COLUMN fictionlab.workflow_definitions.tags IS 'Searchable tags for categorization';

RAISE NOTICE 'Created fictionlab.workflow_definitions table';

-- =============================================
-- CREATE WORKFLOW VERSIONS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS fictionlab.workflow_versions (
    id SERIAL PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    version TEXT NOT NULL,
    definition_json JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by TEXT,
    changelog TEXT,
    parent_version TEXT,
    UNIQUE(workflow_id, version)
);

CREATE INDEX IF NOT EXISTS idx_fictionlab_workflow_ver_id ON fictionlab.workflow_versions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_fictionlab_workflow_ver_created ON fictionlab.workflow_versions(created_at);

COMMENT ON TABLE fictionlab.workflow_versions IS 'Version history for workflow definitions (enables audit trail and rollback)';
COMMENT ON COLUMN fictionlab.workflow_versions.workflow_id IS 'References workflow definition id (formerly workflow_def_id)';

RAISE NOTICE 'Created fictionlab.workflow_versions table';

-- =============================================
-- CREATE WORKFLOW IMPORTS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS fictionlab.workflow_imports (
    id SERIAL PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_path TEXT,
    imported_at TIMESTAMP DEFAULT NOW(),
    imported_by TEXT,
    installation_log JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT fk_workflow_imports_workflow
        FOREIGN KEY (workflow_id)
        REFERENCES fictionlab.workflow_definitions(workflow_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fictionlab_imports_workflow ON fictionlab.workflow_imports(workflow_id);
CREATE INDEX IF NOT EXISTS idx_fictionlab_imports_date ON fictionlab.workflow_imports(imported_at);

COMMENT ON TABLE fictionlab.workflow_imports IS 'Tracks workflow imports from folders, files, marketplace, or URLs';
COMMENT ON COLUMN fictionlab.workflow_imports.workflow_id IS 'References workflow definition id (formerly workflow_def_id)';
COMMENT ON COLUMN fictionlab.workflow_imports.source_type IS 'Import source: marketplace, folder, file, or url';
COMMENT ON COLUMN fictionlab.workflow_imports.installation_log IS 'Log of installed agents, skills, and MCP servers';

RAISE NOTICE 'Created fictionlab.workflow_imports table';

-- =============================================
-- CREATE ACTIVE WORKFLOWS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS fictionlab.active_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id VARCHAR(255) NOT NULL,
    workflow_name VARCHAR(255),
    source VARCHAR(50) NOT NULL CHECK (source IN ('fictionlab_ui', 'claude_code', 'typingmind')),
    project_folder VARCHAR(1000),
    project_name VARCHAR(255),
    current_node_id VARCHAR(255),
    current_node_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'failed', 'cancelled')),
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    total_nodes INTEGER DEFAULT 0,
    completed_nodes INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT fk_active_workflow_def
        FOREIGN KEY (workflow_id)
        REFERENCES fictionlab.workflow_definitions(workflow_id)
        ON DELETE SET NULL
        DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_fictionlab_active_status ON fictionlab.active_workflows(status);
CREATE INDEX IF NOT EXISTS idx_fictionlab_active_source ON fictionlab.active_workflows(source);
CREATE INDEX IF NOT EXISTS idx_fictionlab_active_workflow ON fictionlab.active_workflows(workflow_id);
CREATE INDEX IF NOT EXISTS idx_fictionlab_active_project ON fictionlab.active_workflows(project_folder);
CREATE INDEX IF NOT EXISTS idx_fictionlab_active_started ON fictionlab.active_workflows(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_fictionlab_active_updated ON fictionlab.active_workflows(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_fictionlab_active_running ON fictionlab.active_workflows(status, source)
    WHERE status IN ('running', 'paused');

COMMENT ON TABLE fictionlab.active_workflows IS 'Tracks active workflow instances across FictionLab UI, Claude Code, and TypingMind';
COMMENT ON COLUMN fictionlab.active_workflows.workflow_id IS 'References workflow definition id (formerly workflow_def_id)';
COMMENT ON COLUMN fictionlab.active_workflows.source IS 'Execution source: fictionlab_ui, claude_code, or typingmind';
COMMENT ON COLUMN fictionlab.active_workflows.status IS 'Execution status: running, paused, completed, failed, or cancelled';

-- Trigger for auto-updating timestamp
CREATE OR REPLACE FUNCTION fictionlab.update_active_workflow_timestamp()
RETURNS TRIGGER AS $func$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_active_workflow_timestamp ON fictionlab.active_workflows;
CREATE TRIGGER trigger_update_active_workflow_timestamp
    BEFORE UPDATE ON fictionlab.active_workflows
    FOR EACH ROW
    EXECUTE FUNCTION fictionlab.update_active_workflow_timestamp();

RAISE NOTICE 'Created fictionlab.active_workflows table with auto-update trigger';

-- =============================================
-- MIGRATE DATA FROM PUBLIC SCHEMA (if tables exist)
-- =============================================

-- Migrate workflow_definitions (exclude phases_json, rename columns)
-- Only if legacy table exists (existing installs)
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workflow_definitions') THEN
    INSERT INTO fictionlab.workflow_definitions (
        workflow_id, name, version, description, graph_json, dependencies,
        created_at, updated_at, created_by, is_system, tags, metadata
    )
    SELECT
        id,                   -- Rename id → workflow_id
        name,
        version,
        description,
        graph_json,
        dependencies_json,    -- Rename dependencies_json → dependencies
        created_at,
        updated_at,
        created_by,
        is_system,
        tags,
        marketplace_metadata  -- Rename marketplace_metadata → metadata
    FROM public.workflow_definitions
    ON CONFLICT (workflow_id, version) DO NOTHING;

    RAISE NOTICE 'Migrated % workflow definitions from public to fictionlab schema',
        (SELECT COUNT(*) FROM fictionlab.workflow_definitions);
ELSE
    RAISE NOTICE 'No legacy workflow_definitions table found - fresh install';
END IF;

-- Migrate workflow_versions (rename workflow_def_id → workflow_id)
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workflow_versions') THEN
    INSERT INTO fictionlab.workflow_versions (
        workflow_id, version, definition_json, created_at, created_by, changelog, parent_version
    )
    SELECT
        workflow_def_id,  -- Rename workflow_def_id → workflow_id
        version,
        definition_json,
        created_at,
        created_by,
        changelog,
        parent_version
    FROM public.workflow_versions
    ON CONFLICT (workflow_id, version) DO NOTHING;

    RAISE NOTICE 'Migrated % workflow versions from public to fictionlab schema',
        (SELECT COUNT(*) FROM fictionlab.workflow_versions);
ELSE
    RAISE NOTICE 'No legacy workflow_versions table found - fresh install';
END IF;

-- Migrate workflow_imports (rename workflow_def_id → workflow_id)
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workflow_imports') THEN
    INSERT INTO fictionlab.workflow_imports (
        workflow_id, source_type, source_path, imported_at, imported_by, installation_log
    )
    SELECT
        workflow_def_id,  -- Rename workflow_def_id → workflow_id
        source_type,
        source_path,
        imported_at,
        imported_by,
        installation_log
    FROM public.workflow_imports;

    RAISE NOTICE 'Migrated % workflow imports from public to fictionlab schema',
        (SELECT COUNT(*) FROM fictionlab.workflow_imports);
ELSE
    RAISE NOTICE 'No legacy workflow_imports table found - fresh install';
END IF;

-- Migrate active_workflow_registry → active_workflows (rename workflow_def_id → workflow_id)
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'active_workflow_registry') THEN
    INSERT INTO fictionlab.active_workflows (
        id, workflow_id, workflow_name, source, project_folder, project_name,
        current_node_id, current_node_name, status, progress_percent,
        total_nodes, completed_nodes, started_at, updated_at, completed_at,
        error_message, metadata
    )
    SELECT
        id,
        workflow_def_id,  -- Rename workflow_def_id → workflow_id
        workflow_name,
        source,
        project_folder,
        project_name,
        current_node_id,
        current_node_name,
        status,
        progress_percent,
        total_nodes,
        completed_nodes,
        started_at,
        updated_at,
        completed_at,
        error_message,
        metadata
    FROM public.active_workflow_registry
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Migrated % active workflows from public to fictionlab schema',
        (SELECT COUNT(*) FROM fictionlab.active_workflows);
ELSE
    RAISE NOTICE 'No legacy active_workflow_registry table found - fresh install';
END IF;

-- =============================================
-- CREATE HELPER FUNCTIONS (Migrated from 030)
-- =============================================

-- Function to add a node to a workflow
CREATE OR REPLACE FUNCTION fictionlab.add_workflow_node(
    p_workflow_id TEXT,
    p_workflow_version TEXT,
    p_node_data JSONB
) RETURNS JSONB AS $func$
DECLARE
    current_graph JSONB;
    new_graph JSONB;
BEGIN
    -- Get current graph
    SELECT graph_json INTO current_graph
    FROM fictionlab.workflow_definitions
    WHERE workflow_id = p_workflow_id AND version = p_workflow_version;

    IF current_graph IS NULL THEN
        RAISE EXCEPTION 'Workflow not found: % v%', p_workflow_id, p_workflow_version;
    END IF;

    -- Add node to nodes array
    new_graph := jsonb_set(
        current_graph,
        '{nodes}',
        (current_graph->'nodes') || p_node_data
    );

    -- Update workflow
    UPDATE fictionlab.workflow_definitions
    SET graph_json = new_graph,
        updated_at = NOW()
    WHERE workflow_id = p_workflow_id AND version = p_workflow_version;

    RETURN new_graph;
END;
$func$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fictionlab.add_workflow_node IS 'Adds a new node to workflow graph';

-- Function to add an edge between nodes
CREATE OR REPLACE FUNCTION fictionlab.add_workflow_edge(
    p_workflow_id TEXT,
    p_workflow_version TEXT,
    p_edge_data JSONB
) RETURNS JSONB AS $func$
DECLARE
    current_graph JSONB;
    new_graph JSONB;
BEGIN
    -- Get current graph
    SELECT graph_json INTO current_graph
    FROM fictionlab.workflow_definitions
    WHERE workflow_id = p_workflow_id AND version = p_workflow_version;

    IF current_graph IS NULL THEN
        RAISE EXCEPTION 'Workflow not found: % v%', p_workflow_id, p_workflow_version;
    END IF;

    -- Add edge to edges array
    new_graph := jsonb_set(
        current_graph,
        '{edges}',
        (current_graph->'edges') || p_edge_data
    );

    -- Update workflow
    UPDATE fictionlab.workflow_definitions
    SET graph_json = new_graph,
        updated_at = NOW()
    WHERE workflow_id = p_workflow_id AND version = p_workflow_version;

    RETURN new_graph;
END;
$func$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fictionlab.add_workflow_edge IS 'Creates connection between two nodes';

-- Function to delete a node (and its edges)
CREATE OR REPLACE FUNCTION fictionlab.delete_workflow_node(
    p_workflow_id TEXT,
    p_workflow_version TEXT,
    p_node_id TEXT
) RETURNS JSONB AS $func$
DECLARE
    current_graph JSONB;
    new_nodes JSONB;
    new_edges JSONB;
    new_graph JSONB;
BEGIN
    -- Get current graph
    SELECT graph_json INTO current_graph
    FROM fictionlab.workflow_definitions
    WHERE workflow_id = p_workflow_id AND version = p_workflow_version;

    -- Remove node from nodes array
    SELECT jsonb_agg(node)
    INTO new_nodes
    FROM jsonb_array_elements(current_graph->'nodes') AS node
    WHERE node->>'id' != p_node_id;

    -- Remove edges connected to this node
    SELECT jsonb_agg(edge)
    INTO new_edges
    FROM jsonb_array_elements(current_graph->'edges') AS edge
    WHERE edge->>'source' != p_node_id AND edge->>'target' != p_node_id;

    -- Build new graph
    new_graph := jsonb_build_object(
        'nodes', COALESCE(new_nodes, '[]'::jsonb),
        'edges', COALESCE(new_edges, '[]'::jsonb)
    );

    -- Update workflow
    UPDATE fictionlab.workflow_definitions
    SET graph_json = new_graph,
        updated_at = NOW()
    WHERE workflow_id = p_workflow_id AND version = p_workflow_version;

    RETURN new_graph;
END;
$func$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fictionlab.delete_workflow_node IS 'Removes node and all connected edges from graph';

-- Function to update node position
CREATE OR REPLACE FUNCTION fictionlab.update_node_position(
    p_workflow_id TEXT,
    p_workflow_version TEXT,
    p_node_id TEXT,
    p_x INTEGER,
    p_y INTEGER
) RETURNS JSONB AS $func$
DECLARE
    current_graph JSONB;
    new_graph JSONB;
    idx INTEGER;
BEGIN
    SELECT graph_json INTO current_graph
    FROM fictionlab.workflow_definitions
    WHERE workflow_id = p_workflow_id AND version = p_workflow_version;

    -- Find node index
    SELECT ordinality - 1 INTO idx
    FROM jsonb_array_elements(current_graph->'nodes') WITH ORDINALITY AS node(value, ordinality)
    WHERE node.value->>'id' = p_node_id;

    IF idx IS NULL THEN
        RAISE EXCEPTION 'Node not found: %', p_node_id;
    END IF;

    -- Update position
    new_graph := jsonb_set(
        current_graph,
        array['nodes', idx::text, 'position'],
        jsonb_build_object('x', p_x, 'y', p_y)
    );

    UPDATE fictionlab.workflow_definitions
    SET graph_json = new_graph,
        updated_at = NOW()
    WHERE workflow_id = p_workflow_id AND version = p_workflow_version;

    RETURN new_graph;
END;
$func$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fictionlab.update_node_position IS 'Updates node position on canvas';

-- Function to find start nodes (nodes with no incoming edges)
CREATE OR REPLACE FUNCTION fictionlab.find_start_nodes(
    p_graph JSONB
) RETURNS TEXT[] AS $func$
DECLARE
    all_node_ids TEXT[];
    target_node_ids TEXT[];
    start_nodes TEXT[];
BEGIN
    -- Get all node IDs
    SELECT array_agg(node->>'id')
    INTO all_node_ids
    FROM jsonb_array_elements(p_graph->'nodes') AS node;

    -- Get all target node IDs from edges
    SELECT array_agg(edge->>'target')
    INTO target_node_ids
    FROM jsonb_array_elements(p_graph->'edges') AS edge;

    -- Start nodes are those NOT in target list
    SELECT array_agg(id)
    INTO start_nodes
    FROM unnest(all_node_ids) AS id
    WHERE id NOT IN (SELECT unnest(COALESCE(target_node_ids, '{}')::text[]));

    RETURN COALESCE(start_nodes, '{}');
END;
$func$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fictionlab.find_start_nodes IS 'Finds entry points (nodes with no incoming edges)';

-- Function to find next nodes from a given node
CREATE OR REPLACE FUNCTION fictionlab.find_next_nodes(
    p_graph JSONB,
    p_current_node_id TEXT,
    p_context JSONB DEFAULT '{}'::jsonb
) RETURNS TEXT[] AS $func$
DECLARE
    next_nodes TEXT[];
BEGIN
    -- Find outgoing edges from current node
    -- Filter by condition evaluation
    SELECT array_agg(edge->>'target')
    INTO next_nodes
    FROM jsonb_array_elements(p_graph->'edges') AS edge
    WHERE edge->>'source' = p_current_node_id
      AND fictionlab.evaluate_edge_condition(edge->>'condition', p_context);

    RETURN COALESCE(next_nodes, '{}');
END;
$func$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fictionlab.find_next_nodes IS 'Finds nodes reachable from current node via outgoing edges';

-- Function to evaluate edge condition
CREATE OR REPLACE FUNCTION fictionlab.evaluate_edge_condition(
    p_condition TEXT,
    p_context JSONB
) RETURNS BOOLEAN AS $func$
BEGIN
    -- Simple condition evaluation (can be enhanced with JSONPath or jq)
    -- For now, supports basic comparisons:
    -- $.variableName >= 70
    -- $.approved == true
    -- $.count < 10

    IF p_condition IS NULL OR p_condition = '' THEN
        RETURN TRUE;  -- No condition = always true
    END IF;

    -- TODO: Implement full JSONPath condition evaluation
    -- For now, return TRUE for all conditional edges
    RETURN TRUE;
END;
$func$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fictionlab.evaluate_edge_condition IS 'Evaluates conditional edge (JSONPath expression)';

RAISE NOTICE 'Created 7 helper functions in fictionlab schema';

-- =============================================
-- CREATE VIEWS
-- =============================================

CREATE OR REPLACE VIEW fictionlab.active_workflows_view AS
SELECT
    aw.id,
    aw.workflow_id,
    COALESCE(aw.workflow_name, wd.name) as workflow_name,
    aw.source,
    aw.project_folder,
    aw.project_name,
    aw.current_node_id,
    aw.current_node_name,
    aw.status,
    aw.progress_percent,
    aw.total_nodes,
    aw.completed_nodes,
    aw.started_at,
    aw.updated_at,
    aw.metadata,
    -- Get available nodes from the workflow definition graph
    COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('id', n->>'id', 'name', n->'data'->>'name'))
         FROM jsonb_array_elements(wd.graph_json->'nodes') n),
        '[]'::jsonb
    ) as available_nodes
FROM fictionlab.active_workflows aw
LEFT JOIN fictionlab.workflow_definitions wd ON aw.workflow_id = wd.workflow_id
WHERE aw.status IN ('running', 'paused');

COMMENT ON VIEW fictionlab.active_workflows_view IS 'Shows active (running or paused) workflows with definition details and available nodes';

RAISE NOTICE 'Created fictionlab.active_workflows_view';

-- =============================================
-- DROP LEGACY TABLES
-- =============================================

-- Drop version locks table (no longer needed - workflows run independently)
DROP TABLE IF EXISTS public.workflow_version_locks CASCADE;
RAISE NOTICE 'Dropped public.workflow_version_locks (version locking removed)';

-- Drop approvals table (phase-based system, not used in graph model)
DROP TABLE IF EXISTS public.workflow_approvals CASCADE;
RAISE NOTICE 'Dropped public.workflow_approvals (legacy phase-based system)';

-- =============================================
-- RECORD MIGRATION
-- =============================================

INSERT INTO migrations (filename) VALUES ('032_fictionlab_schema_migration.sql')
ON CONFLICT DO NOTHING;

RAISE NOTICE '=================================================================';
RAISE NOTICE 'Migration 032_fictionlab_schema_migration.sql completed successfully';
RAISE NOTICE '=================================================================';
RAISE NOTICE 'Created fictionlab schema with 4 tables:';
RAISE NOTICE '  - workflow_definitions (graph-based, no phases_json)';
RAISE NOTICE '  - workflow_versions (audit trail)';
RAISE NOTICE '  - workflow_imports (installation tracking)';
RAISE NOTICE '  - active_workflows (execution tracking)';
RAISE NOTICE '';
RAISE NOTICE 'Migrated data:';
RAISE NOTICE '  - % workflow definitions', (SELECT COUNT(*) FROM fictionlab.workflow_definitions);
RAISE NOTICE '  - % workflow versions', (SELECT COUNT(*) FROM fictionlab.workflow_versions);
RAISE NOTICE '  - % workflow imports', (SELECT COUNT(*) FROM fictionlab.workflow_imports);
RAISE NOTICE '  - % active workflows', (SELECT COUNT(*) FROM fictionlab.active_workflows);
RAISE NOTICE '';
RAISE NOTICE 'Column renames applied:';
RAISE NOTICE '  - workflow_def_id → id';
RAISE NOTICE '  - dependencies_json → dependencies';
RAISE NOTICE '  - marketplace_metadata → metadata';
RAISE NOTICE '';
RAISE NOTICE 'Removed legacy components:';
RAISE NOTICE '  - phases_json column (graph-based only)';
RAISE NOTICE '  - workflow_version_locks table (independent execution)';
RAISE NOTICE '  - workflow_approvals table (phase-based system)';
RAISE NOTICE '';
RAISE NOTICE 'Created 7 helper functions and 1 view';
RAISE NOTICE '=================================================================';

END $$;
