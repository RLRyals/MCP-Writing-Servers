// src/mcps/workflow-manager-server/schemas/workflow-tools-schema.js
// Tool schema definitions for Workflow Manager MCP Server
// Graph-based workflow system (Migrations 028 + 030)

export const workflowToolsSchema = [
    // =============================================
    // WORKFLOW DEFINITION MANAGEMENT (Migration 028)
    // =============================================
    {
        name: 'import_workflow_definition',
        description: 'Imports a new workflow definition from marketplace or file',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Workflow ID (e.g., "12-phase-novel-pipeline")' },
                name: { type: 'string', description: 'Workflow name' },
                version: { type: 'string', description: 'Version (e.g., "1.0.0")', default: '1.0.0' },
                description: { type: 'string', description: 'Workflow description' },
                graph_json: { type: 'object', description: 'WorkflowGraph with nodes, edges, metadata' },
                dependencies_json: { type: 'object', description: 'Required agents, skills, mcpServers, subWorkflows' },
                phases_json: { type: 'array', description: 'Array of WorkflowPhase objects' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
                marketplace_metadata: { type: 'object', description: 'Marketplace display metadata' },
                source_type: { type: 'string', description: 'Import source: marketplace, folder, file, url' },
                source_path: { type: 'string', description: 'Where it was imported from' },
                created_by: { type: 'string', description: 'Author/creator' }
            },
            required: ['id', 'name', 'graph_json', 'dependencies_json', 'phases_json']
        }
    },
    {
        name: 'get_workflow_definitions',
        description: 'Lists all available workflow definitions (for UI selection)',
        inputSchema: {
            type: 'object',
            properties: {
                tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
                is_system: { type: 'boolean', description: 'Filter by system vs user workflows' }
            }
        }
    },
    {
        name: 'get_workflow_definition',
        description: 'Gets a specific workflow definition by ID',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_def_id: { type: 'string', description: 'Workflow definition ID' },
                version: { type: 'string', description: 'Specific version (optional, defaults to latest)' }
            },
            required: ['workflow_def_id']
        }
    },
    {
        name: 'update_workflow_positions',
        description: 'Updates node positions in a workflow definition for visual layout',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_def_id: { type: 'string', description: 'Workflow definition ID' },
                positions: {
                    type: 'object',
                    description: 'Map of phase IDs to {x, y} positions',
                    additionalProperties: {
                        type: 'object',
                        properties: {
                            x: { type: 'number', description: 'X coordinate' },
                            y: { type: 'number', description: 'Y coordinate' }
                        },
                        required: ['x', 'y']
                    }
                }
            },
            required: ['workflow_def_id', 'positions']
        }
    },
    {
        name: 'create_workflow_version',
        description: 'Creates a new version of a workflow definition',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_def_id: { type: 'string', description: 'Workflow definition ID' },
                version: { type: 'string', description: 'New version number' },
                definition_json: { type: 'object', description: 'Complete workflow definition' },
                changelog: { type: 'string', description: 'What changed in this version' },
                parent_version: { type: 'string', description: 'Previous version' },
                created_by: { type: 'string', description: 'Who created this version' }
            },
            required: ['workflow_def_id', 'version', 'definition_json']
        }
    },
    {
        name: 'get_workflow_versions',
        description: 'Gets version history for a workflow definition',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_def_id: { type: 'string', description: 'Workflow definition ID' }
            },
            required: ['workflow_def_id']
        }
    },
    {
        name: 'lock_workflow_version',
        description: 'Locks a workflow version during execution (prevents editing)',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_def_id: { type: 'string', description: 'Workflow definition ID' },
                version: { type: 'string', description: 'Version to lock' },
                instance_id: { type: 'number', description: 'Workflow instance ID that is locking it' }
            },
            required: ['workflow_def_id', 'version', 'instance_id']
        }
    },
    {
        name: 'unlock_workflow_version',
        description: 'Unlocks a workflow version after execution completes',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_def_id: { type: 'string', description: 'Workflow definition ID' },
                version: { type: 'string', description: 'Version to unlock' },
                instance_id: { type: 'number', description: 'Workflow instance ID that locked it' }
            },
            required: ['workflow_def_id', 'version', 'instance_id']
        }
    },
    {
        name: 'update_phase_execution',
        description: 'Updates phase execution with Claude Code session and skill invoked',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow instance ID' },
                phase_number: { type: 'number', description: 'Phase number' },
                claude_code_session: { type: 'string', description: 'Claude Code session ID' },
                skill_invoked: { type: 'string', description: 'Name of skill invoked' },
                output_json: { type: 'object', description: 'Structured output from phase' }
            },
            required: ['workflow_id', 'phase_number']
        }
    },
    {
        name: 'export_workflow_package',
        description: 'Exports a complete workflow package with all dependencies for sharing/marketplace',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_def_id: { type: 'string', description: 'Workflow definition ID to export' },
                version: { type: 'string', description: 'Specific version (optional, defaults to latest)' },
                include_agents: { type: 'boolean', description: 'Include agent markdown files', default: true },
                include_skills: { type: 'boolean', description: 'Include skill markdown files', default: true },
                export_format: {
                    type: 'string',
                    enum: ['json', 'yaml'],
                    description: 'Export format for workflow.yaml/json',
                    default: 'yaml'
                },
                output_path: { type: 'string', description: 'Optional output directory path' }
            },
            required: ['workflow_def_id']
        }
    },
    // =============================================
    // SUB-WORKFLOW SUPPORT (Migration 028)
    // =============================================
    {
        name: 'start_sub_workflow',
        description: 'Starts execution of a sub-workflow (nested workflow)',
        inputSchema: {
            type: 'object',
            properties: {
                parent_instance_id: { type: 'number', description: 'Parent workflow instance ID' },
                parent_phase_number: { type: 'number', description: 'Phase number in parent workflow' },
                sub_workflow_def_id: { type: 'string', description: 'Sub-workflow definition ID' },
                sub_workflow_version: { type: 'string', description: 'Sub-workflow version' }
            },
            required: ['parent_instance_id', 'parent_phase_number', 'sub_workflow_def_id', 'sub_workflow_version']
        }
    },
    {
        name: 'complete_sub_workflow',
        description: 'Marks a sub-workflow execution as complete',
        inputSchema: {
            type: 'object',
            properties: {
                sub_workflow_execution_id: { type: 'number', description: 'Sub-workflow execution ID' },
                output_json: { type: 'object', description: 'Output from sub-workflow' },
                error: { type: 'string', description: 'Error message if failed' }
            },
            required: ['sub_workflow_execution_id']
        }
    },
    {
        name: 'get_sub_workflow_status',
        description: 'Gets status of a sub-workflow execution',
        inputSchema: {
            type: 'object',
            properties: {
                sub_workflow_execution_id: { type: 'number', description: 'Sub-workflow execution ID' },
                parent_instance_id: { type: 'number', description: 'Parent workflow instance ID (alternative)' }
            }
        }
    },
    // =============================================
    // GRAPH-BASED WORKFLOW OPERATIONS (Migration 030)
    // =============================================
    {
        name: 'add_node',
        description: 'Adds a new node to the workflow graph',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_def_id: { type: 'string', description: 'Workflow definition ID' },
                node_id: { type: 'string', description: 'Unique node ID' },
                node_type: { type: 'string', description: 'Node type (planning, writing, gate, user-input, code, http, file, conditional, loop, subworkflow)' },
                node_data: { type: 'object', description: 'Complete node configuration data' }
            },
            required: ['workflow_def_id', 'node_id', 'node_type', 'node_data']
        }
    },
    {
        name: 'update_node',
        description: 'Updates an existing node in the workflow graph',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_def_id: { type: 'string', description: 'Workflow definition ID' },
                node_id: { type: 'string', description: 'Node ID to update' },
                updates: { type: 'object', description: 'Fields to update' }
            },
            required: ['workflow_def_id', 'node_id', 'updates']
        }
    },
    {
        name: 'delete_node',
        description: 'Deletes a node from the workflow graph',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_def_id: { type: 'string', description: 'Workflow definition ID' },
                node_id: { type: 'string', description: 'Node ID to delete' }
            },
            required: ['workflow_def_id', 'node_id']
        }
    },
    {
        name: 'create_edge',
        description: 'Creates an edge (connection) between two nodes',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_def_id: { type: 'string', description: 'Workflow definition ID' },
                edge_id: { type: 'string', description: 'Unique edge ID' },
                source_node_id: { type: 'string', description: 'Source node ID' },
                target_node_id: { type: 'string', description: 'Target node ID' },
                edge_type: { type: 'string', description: 'Edge type (default, conditional, loop-back)' },
                label: { type: 'string', description: 'Optional edge label' },
                condition: { type: 'string', description: 'Conditional expression (for conditional edges)' }
            },
            required: ['workflow_def_id', 'edge_id', 'source_node_id', 'target_node_id']
        }
    },
    {
        name: 'update_edge',
        description: 'Updates an existing edge in the workflow graph',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_def_id: { type: 'string', description: 'Workflow definition ID' },
                edge_id: { type: 'string', description: 'Edge ID to update' },
                updates: { type: 'object', description: 'Fields to update (label, condition, type)' }
            },
            required: ['workflow_def_id', 'edge_id', 'updates']
        }
    },
    {
        name: 'delete_edge',
        description: 'Deletes an edge from the workflow graph',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_def_id: { type: 'string', description: 'Workflow definition ID' },
                edge_id: { type: 'string', description: 'Edge ID to delete' }
            },
            required: ['workflow_def_id', 'edge_id']
        }
    }
];
