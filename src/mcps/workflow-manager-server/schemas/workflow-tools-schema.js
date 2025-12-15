// src/mcps/workflow-manager-server/schemas/workflow-tools-schema.js
// Centralized tool schema definitions for the Workflow Manager MCP Server

export const workflowToolsSchema = [
    {
        name: 'create_workflow',
        description: 'Creates a new workflow instance for a series',
        inputSchema: {
            type: 'object',
            properties: {
                series_id: { type: 'number', description: 'Series ID' },
                user_id: { type: 'number', description: 'User/Author ID' },
                concept: { type: 'string', description: 'Initial concept for the series' }
            },
            required: ['series_id', 'user_id', 'concept']
        }
    },
    {
        name: 'get_workflow_state',
        description: 'Retrieves the current state of a workflow',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' }
            },
            required: ['workflow_id']
        }
    },
    {
        name: 'advance_to_phase',
        description: 'Advances the workflow to a specific phase',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' },
                target_phase: { type: 'number', description: 'Target phase number (0-12)' }
            },
            required: ['workflow_id', 'target_phase']
        }
    },
    {
        name: 'complete_current_phase',
        description: 'Marks the current phase as completed and advances to the next',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' },
                output: {
                    type: 'object',
                    properties: {
                        summary: { type: 'string', description: 'Summary of phase completion' },
                        artifacts: { type: 'array', items: { type: 'string' }, description: 'Artifact paths' },
                        metadata: { type: 'object', description: 'Additional metadata' }
                    },
                    required: ['summary']
                }
            },
            required: ['workflow_id', 'output']
        }
    },
    {
        name: 'execute_phase',
        description: 'Executes a specific phase with input data',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' },
                phase_number: { type: 'number', description: 'Phase number to execute' },
                input: { type: 'object', description: 'Input data for the phase' }
            },
            required: ['workflow_id', 'phase_number', 'input']
        }
    },
    {
        name: 'record_quality_gate',
        description: 'Records the result of a quality gate validation',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' },
                gate_type: { type: 'string', enum: ['npe_series', 'npe_scene', 'commercial'], description: 'Type of quality gate' },
                score: { type: 'number', description: 'Quality score' },
                passed: { type: 'boolean', description: 'Whether the gate passed' },
                violations: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            category: { type: 'string' },
                            severity: { type: 'string' },
                            message: { type: 'string' },
                            suggestion: { type: 'string' }
                        }
                    },
                    description: 'List of violations'
                }
            },
            required: ['workflow_id', 'gate_type', 'score', 'passed', 'violations']
        }
    },
    {
        name: 'request_approval',
        description: 'Requests user approval for a phase',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' },
                approval_type: { type: 'string', enum: ['series_plan', 'book_completion', 'chapter_plan'], description: 'Type of approval' },
                artifacts: { type: 'array', items: { type: 'string' }, description: 'Artifact paths to review' }
            },
            required: ['workflow_id', 'approval_type', 'artifacts']
        }
    },
    {
        name: 'submit_approval',
        description: 'Submits an approval decision',
        inputSchema: {
            type: 'object',
            properties: {
                approval_id: { type: 'number', description: 'Approval ID' },
                decision: { type: 'string', enum: ['approved', 'rejected', 'revision_requested'], description: 'Approval decision' },
                feedback: { type: 'string', description: 'Optional feedback' }
            },
            required: ['approval_id', 'decision']
        }
    },
    {
        name: 'get_pending_approvals',
        description: 'Gets all pending approvals for a workflow',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' }
            },
            required: ['workflow_id']
        }
    },
    {
        name: 'start_book_iteration',
        description: 'Starts a new book iteration in the production loop',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' },
                book_number: { type: 'number', description: 'Book number (2-5)' }
            },
            required: ['workflow_id', 'book_number']
        }
    },
    {
        name: 'complete_book_iteration',
        description: 'Completes a book iteration and requests approval',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' },
                book_number: { type: 'number', description: 'Book number' }
            },
            required: ['workflow_id', 'book_number']
        }
    },
    {
        name: 'get_series_progress',
        description: 'Gets the overall progress of the series',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' }
            },
            required: ['workflow_id']
        }
    },
    // =============================================
    // REVISION WORKFLOW TOOLS
    // =============================================
    {
        name: 'start_revision_pass',
        description: 'Start a revision pass for a book',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' },
                book_number: { type: 'number', description: 'Book number' },
                pass_number: { type: 'number', minimum: 1, maximum: 6, description: 'Pass number (1-6)' },
                pass_name: { type: 'string', description: 'Pass name (structural, continuity, dialogue, emotional, line_edit, final_qa)' }
            },
            required: ['workflow_id', 'book_number', 'pass_number', 'pass_name']
        }
    },
    {
        name: 'complete_revision_pass',
        description: 'Complete a revision pass with findings',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' },
                book_number: { type: 'number', description: 'Book number' },
                pass_number: { type: 'number', description: 'Pass number' },
                findings_summary: { type: 'string', description: 'Summary of findings' },
                edits_made: { type: 'boolean', description: 'Whether edits were made' },
                user_approved: { type: 'boolean', description: 'Whether user approved' }
            },
            required: ['workflow_id', 'book_number', 'pass_number']
        }
    },
    {
        name: 'get_revision_status',
        description: 'Get status of all revision passes for a book',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' },
                book_number: { type: 'number', description: 'Book number' }
            },
            required: ['workflow_id', 'book_number']
        }
    },
    {
        name: 'run_qa_checklist',
        description: 'Run automated QA checklist for publishing readiness',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' },
                book_number: { type: 'number', description: 'Book number' }
            },
            required: ['workflow_id', 'book_number']
        }
    },
    {
        name: 'mark_ready_to_publish',
        description: 'Mark a book as ready to publish',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' },
                book_number: { type: 'number', description: 'Book number' }
            },
            required: ['workflow_id', 'book_number']
        }
    },
    // =============================================
    // PRODUCTION METRICS TOOLS
    // =============================================
    {
        name: 'record_production_metric',
        description: 'Record a production metric',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' },
                metric_type: { type: 'string', description: 'Metric type (words_written, chapters_completed, etc.)' },
                metric_value: { type: 'number', description: 'Metric value' },
                context: {
                    type: 'object',
                    properties: {
                        phase_number: { type: 'number' },
                        book_number: { type: 'number' },
                        chapter_number: { type: 'number' },
                        metadata: { type: 'object' }
                    }
                }
            },
            required: ['workflow_id', 'metric_type', 'metric_value']
        }
    },
    {
        name: 'get_workflow_metrics',
        description: 'Get aggregated metrics for a workflow',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' },
                metric_types: { type: 'array', items: { type: 'string' }, description: 'Optional metric types to filter' },
                date_range: {
                    type: 'object',
                    properties: {
                        start: { type: 'string', description: 'Start date (ISO format)' },
                        end: { type: 'string', description: 'End date (ISO format)' }
                    }
                }
            },
            required: ['workflow_id']
        }
    },
    {
        name: 'get_workflow_velocity',
        description: 'Calculate writing velocity and projections',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' },
                time_window: { type: 'string', enum: ['day', 'week', 'all'], description: 'Time window for calculation' }
            },
            required: ['workflow_id']
        }
    },
    {
        name: 'get_daily_writing_stats',
        description: 'Get daily writing statistics',
        inputSchema: {
            type: 'object',
            properties: {
                workflow_id: { type: 'number', description: 'Workflow ID' },
                author_id: { type: 'number', description: 'Author ID (alternative to workflow_id)' },
                date_range: {
                    type: 'object',
                    properties: {
                        start: { type: 'string', description: 'Start date' },
                        end: { type: 'string', description: 'End date' }
                    }
                }
            }
        }
    },
    {
        name: 'get_phase_analytics',
        description: 'Get phase performance analytics',
        inputSchema: {
            type: 'object',
            properties: {
                phase_number: { type: 'number', description: 'Optional phase number to filter' }
            }
        }
    },
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
    }
];
