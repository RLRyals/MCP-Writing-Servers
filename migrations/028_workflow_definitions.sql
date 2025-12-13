-- Migration 028: Workflow Definitions & Generic Workflow Support
-- Extends workflow-manager to support:
-- 1. Importing/storing workflow definitions (not just hardcoded 12-phase)
-- 2. Version control for workflows
-- 3. Graph visualization data
-- 4. Sub-workflow support (nested workflows)
-- 5. Workflow marketplace metadata

DO $$
BEGIN
    -- Check if migration was already applied
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '028_workflow_definitions.sql') THEN
        RAISE NOTICE 'Migration 028_workflow_definitions.sql already applied, skipping.';
        RETURN;
    END IF;

-- =============================================
-- WORKFLOW DEFINITIONS (Templates/Blueprints)
-- =============================================

-- Workflow definitions (reusable workflow templates)
CREATE TABLE IF NOT EXISTS workflow_definitions (
    id TEXT PRIMARY KEY,  -- e.g., "12-phase-novel-pipeline"
    name TEXT NOT NULL,   -- e.g., "12-Phase Novel Writing Pipeline"
    version TEXT NOT NULL DEFAULT '1.0.0',
    description TEXT,
    graph_json JSONB NOT NULL,  -- WorkflowGraph: nodes, edges, metadata
    dependencies_json JSONB NOT NULL,  -- agents, skills, mcpServers, subWorkflows
    phases_json JSONB NOT NULL,  -- Array of WorkflowPhase objects
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by TEXT,  -- Author/creator
    is_system BOOLEAN DEFAULT FALSE,  -- System-provided vs. user-created
    tags TEXT[] DEFAULT '{}',  -- ['writing', 'novel', 'fiction']
    marketplace_metadata JSONB DEFAULT '{}'::jsonb,  -- For marketplace display
    UNIQUE(id, version)
);

CREATE INDEX IF NOT EXISTS idx_workflow_def_tags ON workflow_definitions USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_workflow_def_system ON workflow_definitions(is_system);
CREATE INDEX IF NOT EXISTS idx_workflow_def_created ON workflow_definitions(created_at);

COMMENT ON TABLE workflow_definitions IS 'Reusable workflow templates/blueprints that can be imported and executed';
COMMENT ON COLUMN workflow_definitions.graph_json IS 'Complete graph structure with nodes, edges, and metadata for visualization';
COMMENT ON COLUMN workflow_definitions.dependencies_json IS 'Lists all required agents, skills, and MCP servers';
COMMENT ON COLUMN workflow_definitions.phases_json IS 'Array of phase definitions with agents, skills, gates, etc.';

-- =============================================
-- WORKFLOW VERSIONS
-- =============================================

-- Workflow version history (for version control)
CREATE TABLE IF NOT EXISTS workflow_versions (
    id SERIAL PRIMARY KEY,
    workflow_def_id TEXT NOT NULL,  -- References workflow_definitions.id
    version TEXT NOT NULL,
    definition_json JSONB NOT NULL,  -- Complete workflow definition at this version
    created_at TIMESTAMP DEFAULT NOW(),
    created_by TEXT,
    changelog TEXT,  -- What changed in this version
    parent_version TEXT,  -- Previous version for history chain
    UNIQUE(workflow_def_id, version)
);

CREATE INDEX IF NOT EXISTS idx_workflow_ver_def ON workflow_versions(workflow_def_id);
CREATE INDEX IF NOT EXISTS idx_workflow_ver_created ON workflow_versions(created_at);

COMMENT ON TABLE workflow_versions IS 'Version history for workflow definitions (enables rollback and change tracking)';

-- =============================================
-- WORKFLOW VERSION LOCKS
-- =============================================

-- Version locks (prevent editing running workflows)
CREATE TABLE IF NOT EXISTS workflow_version_locks (
    id SERIAL PRIMARY KEY,
    workflow_def_id TEXT NOT NULL,
    version TEXT NOT NULL,
    locked_by_instance_id INTEGER NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    locked_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(workflow_def_id, version, locked_by_instance_id)
);

CREATE INDEX IF NOT EXISTS idx_version_lock_def ON workflow_version_locks(workflow_def_id);
CREATE INDEX IF NOT EXISTS idx_version_lock_instance ON workflow_version_locks(locked_by_instance_id);

COMMENT ON TABLE workflow_version_locks IS 'Locks workflow versions during execution to prevent editing';

-- =============================================
-- UPDATE WORKFLOW_INSTANCES FOR GENERIC WORKFLOWS
-- =============================================

-- Add columns to workflow_instances to link to workflow definitions
ALTER TABLE workflow_instances
    ADD COLUMN IF NOT EXISTS workflow_def_id TEXT,
    ADD COLUMN IF NOT EXISTS workflow_version TEXT,
    ADD COLUMN IF NOT EXISTS total_phases INTEGER DEFAULT 12;  -- Dynamic based on workflow

-- Add foreign key constraint (with CASCADE for cleanup)
DO $fk_block$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_workflow_instances_def'
    ) THEN
        ALTER TABLE workflow_instances
            ADD CONSTRAINT fk_workflow_instances_def
            FOREIGN KEY (workflow_def_id, workflow_version)
            REFERENCES workflow_definitions(id, version)
            ON DELETE SET NULL;
    END IF;
END $fk_block$;

CREATE INDEX IF NOT EXISTS idx_workflow_inst_def ON workflow_instances(workflow_def_id);
CREATE INDEX IF NOT EXISTS idx_workflow_inst_ver ON workflow_instances(workflow_version);

COMMENT ON COLUMN workflow_instances.workflow_def_id IS 'Link to workflow definition template being executed';
COMMENT ON COLUMN workflow_instances.workflow_version IS 'Locked version of workflow definition';
COMMENT ON COLUMN workflow_instances.total_phases IS 'Total number of phases in this workflow (allows non-12-phase workflows)';

-- =============================================
-- SUB-WORKFLOW SUPPORT
-- =============================================

-- Sub-workflow executions (for nested workflows like Phase 3 → Series Architect 6-phase)
CREATE TABLE IF NOT EXISTS sub_workflow_executions (
    id SERIAL PRIMARY KEY,
    parent_instance_id INTEGER NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    parent_phase_number INTEGER NOT NULL,
    sub_workflow_def_id TEXT NOT NULL,
    sub_workflow_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'in_progress', 'complete', 'failed'
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    output_json JSONB DEFAULT '{}'::jsonb,
    error TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (sub_workflow_def_id, sub_workflow_version)
        REFERENCES workflow_definitions(id, version)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subworkflow_parent ON sub_workflow_executions(parent_instance_id);
CREATE INDEX IF NOT EXISTS idx_subworkflow_def ON sub_workflow_executions(sub_workflow_def_id);
CREATE INDEX IF NOT EXISTS idx_subworkflow_status ON sub_workflow_executions(status);

COMMENT ON TABLE sub_workflow_executions IS 'Tracks execution of nested sub-workflows (e.g., Series Architect 6-phase within Phase 3)';

-- =============================================
-- PHASE EXECUTION ENHANCEMENTS
-- =============================================

-- Add columns to workflow_phase_history for Claude Code integration
ALTER TABLE workflow_phase_history
    ADD COLUMN IF NOT EXISTS claude_code_session TEXT,  -- Claude Code session ID
    ADD COLUMN IF NOT EXISTS skill_invoked TEXT,  -- Which skill was invoked
    ADD COLUMN IF NOT EXISTS output_json JSONB DEFAULT '{}'::jsonb;  -- Structured output

CREATE INDEX IF NOT EXISTS idx_phase_history_session ON workflow_phase_history(claude_code_session);
CREATE INDEX IF NOT EXISTS idx_phase_history_skill ON workflow_phase_history(skill_invoked);

COMMENT ON COLUMN workflow_phase_history.claude_code_session IS 'Claude Code session ID if phase was executed via Claude Code';
COMMENT ON COLUMN workflow_phase_history.skill_invoked IS 'Name of skill invoked by agent during this phase';
COMMENT ON COLUMN workflow_phase_history.output_json IS 'Structured JSON output from phase execution';

-- =============================================
-- IMPORT/EXPORT TRACKING
-- =============================================

-- Workflow imports (track when workflows are imported from marketplace/files)
CREATE TABLE IF NOT EXISTS workflow_imports (
    id SERIAL PRIMARY KEY,
    workflow_def_id TEXT NOT NULL,
    source_type TEXT NOT NULL,  -- 'marketplace', 'folder', 'file', 'url'
    source_path TEXT,  -- Where it was imported from
    imported_at TIMESTAMP DEFAULT NOW(),
    imported_by TEXT,  -- User/author who imported
    installation_log JSONB DEFAULT '{}'::jsonb,  -- What was installed (agents, skills, MCPs)
    FOREIGN KEY (workflow_def_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_imports_def ON workflow_imports(workflow_def_id);
CREATE INDEX IF NOT EXISTS idx_imports_date ON workflow_imports(imported_at);

COMMENT ON TABLE workflow_imports IS 'Tracks when and how workflows were imported';

-- =============================================
-- SEED DEFAULT WORKFLOW DEFINITION
-- =============================================

-- Insert the 12-Phase Novel Writing Pipeline as default workflow
INSERT INTO workflow_definitions (
    id,
    name,
    version,
    description,
    graph_json,
    dependencies_json,
    phases_json,
    is_system,
    tags,
    marketplace_metadata
) VALUES (
    '12-phase-novel-pipeline',
    '12-Phase Novel Writing Pipeline',
    '1.0.0',
    'Complete workflow from concept to published 5-book series with quality gates',
    '{
        "nodes": [],
        "edges": [],
        "metadata": {
            "workflowId": "12-phase-novel-pipeline",
            "workflowName": "12-Phase Novel Writing Pipeline",
            "version": "1.0.0"
        }
    }'::jsonb,
    '{
        "agents": [
            "brainstorming-agent",
            "market-research-agent",
            "series-architect-agent",
            "npe-series-validator-agent",
            "commercial-validator-agent",
            "miranda-showrunner",
            "bailey-first-drafter"
        ],
        "skills": [
            "market-driven-planning-skill",
            "series-planning-skill",
            "book-planning-skill",
            "chapter-planning-skill",
            "scene-writing-skill"
        ],
        "mcpServers": [
            "workflow-manager",
            "author-server",
            "series-planning-server",
            "character-planning-server",
            "core-continuity-server"
        ]
    }'::jsonb,
    '[
        {
            "id": 0,
            "name": "Premise Development",
            "type": "planning",
            "agent": "brainstorming-agent",
            "gate": false,
            "requiresApproval": false
        },
        {
            "id": 1,
            "name": "Genre Pack Management",
            "type": "planning",
            "agent": "market-research-agent",
            "skill": "market-driven-planning-skill",
            "gate": false,
            "requiresApproval": false
        },
        {
            "id": 2,
            "name": "Market Research",
            "type": "planning",
            "agent": "market-research-agent",
            "gate": false,
            "requiresApproval": false
        },
        {
            "id": 3,
            "name": "Series Architect",
            "type": "subworkflow",
            "agent": "series-architect-agent",
            "skill": "series-planning-skill",
            "subWorkflowId": "series-architect-6-phase",
            "gate": false,
            "requiresApproval": false
        },
        {
            "id": 4,
            "name": "NPE Validation",
            "type": "gate",
            "agent": "npe-series-validator-agent",
            "gate": true,
            "gateCondition": "Score >= 80 to PASS",
            "requiresApproval": false
        },
        {
            "id": 5,
            "name": "Commercial Validation",
            "type": "gate",
            "agent": "commercial-validator-agent",
            "gate": true,
            "requiresApproval": false
        },
        {
            "id": 6,
            "name": "Writing Team Review",
            "type": "writing",
            "agent": "miranda-showrunner",
            "gate": false,
            "requiresApproval": false
        },
        {
            "id": 7,
            "name": "User Approval",
            "type": "user",
            "agent": "User",
            "gate": true,
            "gateCondition": "APPROVE → Phase 8",
            "requiresApproval": true
        },
        {
            "id": 8,
            "name": "MCP Commit",
            "type": "user",
            "agent": "System",
            "gate": false,
            "requiresApproval": false
        },
        {
            "id": 9,
            "name": "Chapter Planning",
            "type": "writing",
            "agent": "miranda-showrunner",
            "skill": "chapter-planning-skill",
            "gate": false,
            "requiresApproval": false
        },
        {
            "id": 10,
            "name": "Scene Validation",
            "type": "gate",
            "agent": "npe-scene-validator",
            "gate": true,
            "requiresApproval": false
        },
        {
            "id": 11,
            "name": "Writing Execution",
            "type": "writing",
            "agent": "bailey-first-drafter",
            "skill": "scene-writing-skill",
            "gate": false,
            "requiresApproval": false
        },
        {
            "id": 12,
            "name": "Book Production Loop",
            "type": "loop",
            "agent": "miranda-showrunner",
            "gate": false,
            "requiresApproval": false
        }
    ]'::jsonb,
    TRUE,  -- is_system
    ARRAY['writing', 'novel', 'fiction', 'series'],
    '{
        "author": "FictionLab",
        "category": "Novel Writing",
        "difficulty": "Intermediate",
        "estimatedTime": "3-6 months",
        "popularity": 1000
    }'::jsonb
) ON CONFLICT (id, version) DO NOTHING;

-- =============================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =============================================

DO $trigger_block$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_timestamp') THEN
        -- Workflow definitions trigger
        DROP TRIGGER IF EXISTS update_workflow_definitions_timestamp ON workflow_definitions;
        CREATE TRIGGER update_workflow_definitions_timestamp
            BEFORE UPDATE ON workflow_definitions
            FOR EACH ROW
            EXECUTE FUNCTION update_timestamp();
    END IF;
END $trigger_block$;

-- =============================================
-- HELPER VIEWS
-- =============================================

-- View for active workflows with their definitions
CREATE OR REPLACE VIEW active_workflows AS
SELECT
    wi.id as instance_id,
    wi.workflow_def_id,
    wd.name as workflow_name,
    wi.workflow_version,
    wi.current_phase,
    wi.total_phases,
    wi.phase_status,
    wi.current_book,
    wi.created_at as started_at,
    wi.updated_at as last_activity,
    s.title as series_title,
    a.name as author_name
FROM workflow_instances wi
LEFT JOIN workflow_definitions wd ON wi.workflow_def_id = wd.id AND wi.workflow_version = wd.version
LEFT JOIN series s ON wi.series_id = s.id
LEFT JOIN authors a ON wi.author_id = a.id
WHERE wi.phase_status NOT IN ('completed', 'failed');

COMMENT ON VIEW active_workflows IS 'Shows all active workflow instances with their definition info';

-- View for workflow execution summary
CREATE OR REPLACE VIEW workflow_execution_summary AS
SELECT
    wd.id as workflow_def_id,
    wd.name as workflow_name,
    wd.version,
    COUNT(wi.id) as total_executions,
    COUNT(CASE WHEN wi.phase_status = 'completed' THEN 1 END) as completed,
    COUNT(CASE WHEN wi.phase_status IN ('in_progress', 'waiting_approval') THEN 1 END) as in_progress,
    COUNT(CASE WHEN wi.phase_status = 'failed' THEN 1 END) as failed,
    MAX(wi.updated_at) as last_execution
FROM workflow_definitions wd
LEFT JOIN workflow_instances wi ON wd.id = wi.workflow_def_id AND wd.version = wi.workflow_version
GROUP BY wd.id, wd.name, wd.version;

COMMENT ON VIEW workflow_execution_summary IS 'Summary of executions per workflow definition';

-- =============================================
-- CLEANUP LEGACY DATA
-- =============================================

-- Update existing workflow_instances to link to 12-phase workflow
UPDATE workflow_instances
SET
    workflow_def_id = '12-phase-novel-pipeline',
    workflow_version = '1.0.0',
    total_phases = 12
WHERE workflow_def_id IS NULL;

-- Record this migration
INSERT INTO migrations (filename) VALUES ('028_workflow_definitions.sql')
ON CONFLICT DO NOTHING;

RAISE NOTICE 'Migration 028_workflow_definitions.sql completed successfully.';
RAISE NOTICE 'Added support for:';
RAISE NOTICE '  - Generic workflow definitions (not just 12-phase)';
RAISE NOTICE '  - Workflow version control';
RAISE NOTICE '  - Sub-workflow support (nested workflows)';
RAISE NOTICE '  - Import/export tracking';
RAISE NOTICE '  - Claude Code integration tracking';
RAISE NOTICE '  - Seeded 12-Phase Novel Pipeline as default workflow';
END $$;
