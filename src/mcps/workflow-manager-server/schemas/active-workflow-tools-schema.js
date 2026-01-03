// src/mcps/workflow-manager-server/schemas/active-workflow-tools-schema.js
// Active Workflow Registry Tool schema definitions (Migration 031)
// Track active workflows across all sources (FictionLab UI, Claude Code, TypingMind)

export const activeWorkflowToolsSchema = [
    {
        name: 'list_active_workflows',
        description: 'Lists all active (running or paused) workflows across all sources',
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    enum: ['running', 'paused', 'completed', 'failed', 'cancelled'],
                    description: 'Filter by specific status'
                },
                source: {
                    type: 'string',
                    enum: ['fictionlab_ui', 'claude_code', 'typingmind'],
                    description: 'Filter by source'
                },
                include_completed: {
                    type: 'boolean',
                    description: 'Include completed/failed/cancelled workflows (default: false)',
                    default: false
                }
            }
        }
    },
    {
        name: 'register_active_workflow',
        description: 'Registers a new active workflow from any source (FictionLab UI, Claude Code, TypingMind)',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_def_id: { type: 'string', description: 'Workflow definition ID' },
                workflow_name: { type: 'string', description: 'Workflow name (optional, will be fetched from definition if not provided)' },
                source: {
                    type: 'string',
                    enum: ['fictionlab_ui', 'claude_code', 'typingmind'],
                    description: 'Source of the workflow execution'
                },
                project_folder: { type: 'string', description: 'Project folder path' },
                project_name: { type: 'string', description: 'Project name for display' },
                total_nodes: { type: 'number', description: 'Total number of nodes in workflow (optional, will be calculated if not provided)' },
                metadata: { type: 'object', description: 'Additional metadata' }
            },
            required: ['workflow_def_id', 'source']
        }
    },
    {
        name: 'update_workflow_progress',
        description: 'Updates the progress of an active workflow (current node, percent complete)',
        inputSchema: {
            type: 'object',
            properties: {
                registry_id: { type: 'string', description: 'Active workflow registry ID (UUID)' },
                current_node_id: { type: 'string', description: 'Current node ID' },
                current_node_name: { type: 'string', description: 'Current node name for display' },
                progress_percent: { type: 'number', description: 'Progress percentage (0-100)' },
                completed_nodes: { type: 'number', description: 'Number of completed nodes' },
                metadata: { type: 'object', description: 'Additional metadata to merge' }
            },
            required: ['registry_id']
        }
    },
    {
        name: 'pause_workflow',
        description: 'Pauses a running workflow',
        inputSchema: {
            type: 'object',
            properties: {
                registry_id: { type: 'string', description: 'Active workflow registry ID (UUID)' }
            },
            required: ['registry_id']
        }
    },
    {
        name: 'resume_workflow',
        description: 'Resumes a paused workflow',
        inputSchema: {
            type: 'object',
            properties: {
                registry_id: { type: 'string', description: 'Active workflow registry ID (UUID)' }
            },
            required: ['registry_id']
        }
    },
    {
        name: 'cancel_workflow',
        description: 'Cancels a running or paused workflow',
        inputSchema: {
            type: 'object',
            properties: {
                registry_id: { type: 'string', description: 'Active workflow registry ID (UUID)' },
                reason: { type: 'string', description: 'Optional cancellation reason' }
            },
            required: ['registry_id']
        }
    },
    {
        name: 'complete_workflow',
        description: 'Marks a workflow as successfully completed',
        inputSchema: {
            type: 'object',
            properties: {
                registry_id: { type: 'string', description: 'Active workflow registry ID (UUID)' },
                final_metadata: { type: 'object', description: 'Final metadata to store' }
            },
            required: ['registry_id']
        }
    },
    {
        name: 'fail_workflow',
        description: 'Marks a workflow as failed with error information',
        inputSchema: {
            type: 'object',
            properties: {
                registry_id: { type: 'string', description: 'Active workflow registry ID (UUID)' },
                error_message: { type: 'string', description: 'Error message' },
                error_details: { type: 'object', description: 'Additional error details' }
            },
            required: ['registry_id', 'error_message']
        }
    },
    {
        name: 'jump_to_node',
        description: 'Jumps to a specific node in an active workflow (updates current position)',
        inputSchema: {
            type: 'object',
            properties: {
                registry_id: { type: 'string', description: 'Active workflow registry ID (UUID)' },
                node_id: { type: 'string', description: 'Target node ID to jump to' },
                node_name: { type: 'string', description: 'Node name (optional, will be resolved from graph if not provided)' }
            },
            required: ['registry_id', 'node_id']
        }
    },
    {
        name: 'get_active_workflow',
        description: 'Gets detailed information about a single active workflow',
        inputSchema: {
            type: 'object',
            properties: {
                registry_id: { type: 'string', description: 'Active workflow registry ID (UUID)' }
            },
            required: ['registry_id']
        }
    },
    {
        name: 'cleanup_old_workflows',
        description: 'Cleans up old completed/failed/cancelled workflow records (maintenance)',
        inputSchema: {
            type: 'object',
            properties: {
                older_than_days: {
                    type: 'number',
                    description: 'Delete records older than this many days (default: 30)',
                    default: 30
                }
            }
        }
    }
];
