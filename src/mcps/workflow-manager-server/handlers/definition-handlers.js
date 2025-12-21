// src/mcps/workflow-manager-server/handlers/definition-handlers.js
// Workflow Definition Management Handlers - Graph-based workflow system (Migration 028)

export class DefinitionHandlers {
    constructor(db) {
        this.db = db;
    }

    async handleImportWorkflowDefinition(args) {
        const {
            id,
            name,
            version = '1.0.0',
            description,
            graph_json,
            dependencies_json,
            phases_json = [],
            tags = [],
            marketplace_metadata = {},
            source_type,
            source_path,
            created_by
        } = args;

        // Insert workflow definition
        const defResult = await this.db.query(
            `INSERT INTO workflow_definitions (
                id, name, version, description, graph_json, dependencies_json,
                tags, marketplace_metadata, created_by, is_system
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)
            ON CONFLICT (id, version) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                graph_json = EXCLUDED.graph_json,
                dependencies_json = EXCLUDED.dependencies_json,
                tags = EXCLUDED.tags,
                marketplace_metadata = EXCLUDED.marketplace_metadata,
                updated_at = NOW()
            RETURNING id, version, created_at`,
            [id, name, version, description, graph_json, dependencies_json, tags, marketplace_metadata, created_by]
        );

        // Record import if source information provided
        if (source_type && source_path) {
            await this.db.query(
                `INSERT INTO workflow_imports (
                    workflow_def_id, source_type, source_path, imported_by, installation_log
                ) VALUES ($1, $2, $3, $4, $5)`,
                [id, source_type, source_path, created_by, { timestamp: new Date().toISOString() }]
            );
        }

        return {
            workflow_def_id: defResult.rows[0].id,
            version: defResult.rows[0].version,
            created_at: defResult.rows[0].created_at,
            message: `Workflow definition ${name} v${version} imported successfully`
        };
    }

    async handleGetWorkflowDefinitions(args) {
        const { tags, is_system } = args || {};

        let whereConditions = [];
        const params = [];
        let paramIndex = 1;

        if (tags && tags.length > 0) {
            whereConditions.push(`tags && $${paramIndex}`);
            params.push(tags);
            paramIndex++;
        }

        if (is_system !== undefined) {
            whereConditions.push(`is_system = $${paramIndex}`);
            params.push(is_system);
            paramIndex++;
        }

        const whereClause = whereConditions.length > 0
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';

        const result = await this.db.query(
            `SELECT
                id,
                name,
                version,
                description,
                tags,
                marketplace_metadata,
                created_at,
                updated_at,
                is_system,
                created_by
            FROM workflow_definitions
            ${whereClause}
            ORDER BY is_system DESC, created_at DESC`,
            params
        );

        return result.rows;
    }

    async handleGetWorkflowDefinition(args) {
        const { workflow_def_id, version } = args;

        let versionClause = '';
        const params = [workflow_def_id];

        if (version) {
            versionClause = 'AND version = $2';
            params.push(version);
        } else {
            // Get latest version
            versionClause = `AND version = (
                SELECT version FROM workflow_definitions
                WHERE id = $1
                ORDER BY created_at DESC
                LIMIT 1
            )`;
        }

        const result = await this.db.query(
            `SELECT * FROM workflow_definitions
            WHERE id = $1 ${versionClause}`,
            params
        );

        if (result.rows.length === 0) {
            throw new Error(`Workflow definition ${workflow_def_id}${version ? ' v' + version : ''} not found`);
        }

        return result.rows[0];
    }

    async handleUpdateWorkflowPositions(args) {
        const { workflow_def_id, positions } = args;

        // Get the latest version of the workflow
        const workflowResult = await this.db.query(
            `SELECT id, version, graph_json FROM workflow_definitions
            WHERE id = $1
            ORDER BY created_at DESC
            LIMIT 1`,
            [workflow_def_id]
        );

        if (workflowResult.rows.length === 0) {
            throw new Error(`Workflow definition ${workflow_def_id} not found`);
        }

        const workflow = workflowResult.rows[0];
        const graphJson = workflow.graph_json || { nodes: [], edges: [] };

        // Update position for each node
        const updatedNodes = graphJson.nodes.map(node => {
            const nodeId = node.id;
            if (positions[nodeId]) {
                return {
                    ...node,
                    position: positions[nodeId]
                };
            }
            return node;
        });

        // Update the workflow definition with new positions
        const updatedGraph = {
            ...graphJson,
            nodes: updatedNodes
        };

        await this.db.query(
            `UPDATE workflow_definitions
            SET graph_json = $1, updated_at = NOW()
            WHERE id = $2 AND version = $3`,
            [updatedGraph, workflow_def_id, workflow.version]
        );

        return {
            workflow_def_id,
            version: workflow.version,
            updated_nodes: updatedNodes.length,
            message: 'Node positions updated successfully'
        };
    }

    async handleCreateWorkflowVersion(args) {
        const {
            workflow_def_id,
            version,
            definition_json,
            changelog,
            parent_version,
            created_by
        } = args;

        // Insert into workflow_versions
        const result = await this.db.query(
            `INSERT INTO workflow_versions (
                workflow_def_id, version, definition_json, changelog, parent_version, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (workflow_def_id, version) DO UPDATE SET
                definition_json = EXCLUDED.definition_json,
                changelog = EXCLUDED.changelog
            RETURNING id, created_at`,
            [workflow_def_id, version, definition_json, changelog, parent_version, created_by]
        );

        return {
            version_id: result.rows[0].id,
            workflow_def_id,
            version,
            created_at: result.rows[0].created_at,
            message: `Version ${version} created successfully`
        };
    }

    async handleGetWorkflowVersions(args) {
        const { workflow_def_id } = args;

        const result = await this.db.query(
            `SELECT
                id,
                version,
                changelog,
                parent_version,
                created_at,
                created_by
            FROM workflow_versions
            WHERE workflow_def_id = $1
            ORDER BY created_at DESC`,
            [workflow_def_id]
        );

        return result.rows;
    }

    async handleLockWorkflowVersion(args) {
        const { workflow_def_id, version, instance_id } = args;

        const result = await this.db.query(
            `INSERT INTO workflow_version_locks (
                workflow_def_id, version, locked_by_instance_id
            ) VALUES ($1, $2, $3)
            ON CONFLICT (workflow_def_id, version, locked_by_instance_id) DO NOTHING
            RETURNING id, locked_at`,
            [workflow_def_id, version, instance_id]
        );

        return {
            locked: result.rowCount > 0,
            lock_id: result.rows[0]?.id,
            locked_at: result.rows[0]?.locked_at,
            message: result.rowCount > 0
                ? `Workflow ${workflow_def_id} v${version} locked`
                : `Already locked`
        };
    }

    async handleUnlockWorkflowVersion(args) {
        const { workflow_def_id, version, instance_id } = args;

        const result = await this.db.query(
            `DELETE FROM workflow_version_locks
            WHERE workflow_def_id = $1 AND version = $2 AND locked_by_instance_id = $3`,
            [workflow_def_id, version, instance_id]
        );

        return {
            unlocked: result.rowCount > 0,
            message: result.rowCount > 0
                ? `Workflow ${workflow_def_id} v${version} unlocked`
                : `Lock not found`
        };
    }

    async handleUpdatePhaseExecution(args) {
        const {
            workflow_id,
            phase_number,
            claude_code_session,
            skill_invoked,
            output_json
        } = args;

        // Update the most recent phase execution record for this workflow and phase
        const result = await this.db.query(
            `UPDATE workflow_phase_history
            SET claude_code_session = COALESCE($1, claude_code_session),
                skill_invoked = COALESCE($2, skill_invoked),
                output_json = COALESCE($3, output_json),
                completed_at = NOW()
            WHERE workflow_id = $4
                AND phase_number = $5
                AND id = (
                    SELECT id FROM workflow_phase_history
                    WHERE workflow_id = $4 AND phase_number = $5
                    ORDER BY started_at DESC
                    LIMIT 1
                )
            RETURNING id, started_at, completed_at`,
            [claude_code_session, skill_invoked, output_json, workflow_id, phase_number]
        );

        if (result.rows.length === 0) {
            throw new Error(`No phase execution found for workflow ${workflow_id}, phase ${phase_number}`);
        }

        return {
            phase_execution_id: result.rows[0].id,
            workflow_id,
            phase_number,
            updated: true,
            message: 'Phase execution updated successfully'
        };
    }

    async handleExportWorkflowPackage(args) {
        const {
            workflow_def_id,
            version,
            include_agents = true,
            include_skills = true,
            export_format = 'yaml',
            output_path
        } = args;

        // Get workflow definition
        let versionClause = '';
        const params = [workflow_def_id];

        if (version) {
            versionClause = 'AND version = $2';
            params.push(version);
        } else {
            // Get latest version
            versionClause = `AND version = (
                SELECT version FROM workflow_definitions
                WHERE id = $1
                ORDER BY created_at DESC
                LIMIT 1
            )`;
        }

        const result = await this.db.query(`
            SELECT * FROM workflow_definitions
            WHERE id = $1 ${versionClause}
        `, params);

        if (result.rows.length === 0) {
            throw new Error(`Workflow definition ${workflow_def_id}${version ? ' v' + version : ''} not found`);
        }

        const workflow = result.rows[0];

        // Build export package
        const exportPackage = {
            workflow: {
                id: workflow.id,
                name: workflow.name,
                version: workflow.version,
                description: workflow.description,
                tags: workflow.tags,
                marketplace_metadata: workflow.marketplace_metadata,
                graph: workflow.graph_json,
                dependencies: workflow.dependencies_json
            },
            format: export_format,
            exported_at: new Date().toISOString(),
            exported_by: workflow.created_by || 'system'
        };

        // Add agents if requested
        if (include_agents && workflow.dependencies_json.agents) {
            exportPackage.agents = workflow.dependencies_json.agents.map(agent => ({
                name: agent,
                filename: `${agent}.md`,
                note: 'Agent markdown file should be in agents/ directory'
            }));
        }

        // Add skills if requested
        if (include_skills && workflow.dependencies_json.skills) {
            exportPackage.skills = workflow.dependencies_json.skills.map(skill => ({
                name: skill,
                filename: `${skill}.md`,
                note: 'Skill markdown file should be in skills/ directory'
            }));
        }

        // Add MCP servers list
        if (workflow.dependencies_json.mcpServers) {
            exportPackage.mcpServers = workflow.dependencies_json.mcpServers;
        }

        // Add sub-workflows if any
        if (workflow.dependencies_json.subWorkflows && workflow.dependencies_json.subWorkflows.length > 0) {
            exportPackage.subWorkflows = workflow.dependencies_json.subWorkflows;
        }

        // Generate README content
        const readmeContent = this.generateReadme(workflow);
        exportPackage.readme = readmeContent;

        // Generate manifest for marketplace
        const manifest = {
            id: workflow.id,
            name: workflow.name,
            version: workflow.version,
            description: workflow.description,
            author: workflow.marketplace_metadata?.author || workflow.created_by || 'Unknown',
            category: workflow.marketplace_metadata?.category || 'Workflow',
            difficulty: workflow.marketplace_metadata?.difficulty || 'Intermediate',
            tags: workflow.tags || [],
            phase_count: workflow.graph_json?.nodes?.length || 0,
            requires: {
                agents: workflow.dependencies_json.agents || [],
                skills: workflow.dependencies_json.skills || [],
                mcpServers: workflow.dependencies_json.mcpServers || [],
                subWorkflows: workflow.dependencies_json.subWorkflows || []
            },
            exported_at: exportPackage.exported_at
        };
        exportPackage.manifest = manifest;

        // Return the complete package
        return {
            success: true,
            workflow_id: workflow.id,
            version: workflow.version,
            format: export_format,
            package: exportPackage,
            output_path: output_path || null,
            message: `Workflow package exported successfully`,
            instructions: {
                structure: [
                    'Create folder structure:',
                    `  /${workflow.id}/`,
                    `    ├── workflow.${export_format}`,
                    '    ├── manifest.json',
                    '    ├── README.md',
                    '    ├── agents/',
                    ...workflow.dependencies_json.agents.map(a => `    │   └── ${a}.md`),
                    '    ├── skills/',
                    ...workflow.dependencies_json.skills.map(s => `    │   └── ${s}.md`)
                ],
                next_steps: [
                    '1. Save package.workflow to workflow.yaml or workflow.json',
                    '2. Save package.manifest to manifest.json',
                    '3. Save package.readme to README.md',
                    '4. Copy agent .md files to agents/ directory',
                    '5. Copy skill .md files to skills/ directory',
                    '6. Zip folder for distribution'
                ]
            }
        };
    }

    // Helper function to generate README
    generateReadme(workflow) {
        const readme = `# ${workflow.name}

**Version:** ${workflow.version}
**Author:** ${workflow.marketplace_metadata?.author || workflow.created_by || 'Unknown'}
**Category:** ${workflow.marketplace_metadata?.category || 'Workflow'}
**Difficulty:** ${workflow.marketplace_metadata?.difficulty || 'Intermediate'}

## Description

${workflow.description || 'No description provided.'}

## Workflow Overview

This workflow consists of  **${workflow.graph_json?.nodes?.length || 0} nodes**:

${(workflow.graph_json?.nodes || []).map((node, idx) => {
            let nodeType = '';
            if (node.data?.gate) nodeType = ' 🚪 (Quality Gate)';
            else if (node.type === 'subworkflow') nodeType = ' 🔄 (Sub-Workflow)';
            else if (node.data?.requiresApproval) nodeType = ' ✋ (Approval Required)';

            return `${idx + 1}. **${node.data?.name || node.id}**${nodeType}
   - Type: ${node.type}
   - Agent: ${node.data?.agent || 'N/A'}${node.data?.skill ? `\n   - Skill: ${node.data.skill}` : ''}${node.data?.gateCondition ? `\n   - Condition: ${node.data.gateCondition}` : ''}`;
        }).join('\n\n')}

## Dependencies

### Agents Required (${workflow.dependencies_json.agents.length})
${workflow.dependencies_json.agents.map(a => `- ${a}`).join('\n')}

### Skills Required (${workflow.dependencies_json.skills.length})
${workflow.dependencies_json.skills.map(s => `- ${s}`).join('\n')}

### MCP Servers Required (${workflow.dependencies_json.mcpServers.length})
${workflow.dependencies_json.mcpServers.map(m => `- ${m}`).join('\n')}

${workflow.dependencies_json.subWorkflows && workflow.dependencies_json.subWorkflows.length > 0 ? `
### Sub-Workflows (${workflow.dependencies_json.subWorkflows.length})
${workflow.dependencies_json.subWorkflows.map(sw => `- ${sw}`).join('\n')}
` : ''}

## Installation

1. Import this workflow using FictionLab's workflow importer
2. The importer will automatically install:  
   - Agent definitions to your agents directory
   - Skills to your ~/.claude/skills directory
   - Required MCP servers (if not already installed)

## Usage

1. Open FictionLab
2. Navigate to Workflows
3. Select "${workflow.name}"
4. Click "Start Workflow"
5. Follow the phase-by-phase execution

## Tags

${workflow.tags.map(t => `\`${t}\``).join(', ')}

## Support

For issues or questions about this workflow, please contact ${workflow.marketplace_metadata?.author || 'the workflow author'}.

---

*Exported from FictionLab Workflow Manager*
*Export Date: ${new Date().toISOString()}*
`;

        return readme;
    }
}
