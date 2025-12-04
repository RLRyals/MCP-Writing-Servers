// src/mcps/workflow-manager-server/index.js
// Workflow Manager MCP Server
// Orchestrates the 12-phase novel writing pipeline

// Protect stdout from debug logging in MCP stdio mode
if (process.env.MCP_STDIO_MODE === 'true') {
    console.error = function () {
        process.stderr.write(Array.from(arguments).join(' ') + '\n');
    };
}

import { BaseMCPServer } from '../../shared/base-server.js';

class WorkflowManagerMCPServer extends BaseMCPServer {
    constructor() {
        console.error('[WORKFLOW-MANAGER] Constructor starting...');
        try {
            super('workflow-manager', '3.0.0');
            console.error('[WORKFLOW-MANAGER] Constructor completed successfully');
        } catch (error) {
            console.error('[WORKFLOW-MANAGER] Constructor failed:', error.message);
            console.error('[WORKFLOW-MANAGER] Stack:', error.stack);
            throw error;
        }

        // Initialize tools
        this.tools = this.getTools();

        if (process.env.MCP_STDIO_MODE !== 'true') {
            console.error(`[WORKFLOW-MANAGER] Initialized with ${this.tools.length} tools`);
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
                    console.error('[WORKFLOW-MANAGER] Database connection verified');
                } else {
                    console.error('[WORKFLOW-MANAGER] Database health check failed:', health.error);
                }
            }
        } catch (error) {
            console.error('[WORKFLOW-MANAGER] Database connection test failed:', error.message);
        }
    }

    // Phase name mapping
    getPhaseNames() {
        return {
            '-1': 'Not Started',
            0: 'Premise Development',
            1: 'Genre Pack Management',
            2: 'Market Research',
            3: 'Series Architect',
            4: 'NPE Validation',
            5: 'Commercial Validation',
            6: 'Writing Team Review',
            7: 'User Approval',
            8: 'MCP Commit',
            9: 'Chapter Planning',
            10: 'Scene Validation',
            11: 'Writing Execution',
            12: 'Book Production Loop'
        };
    }

    // Helper function to get workflow state
    async getWorkflowState(workflowId) {
        const result = await this.db.query(
            `SELECT 
                w.*,
                s.title as series_title
            FROM workflow_instances w
            LEFT JOIN series s ON w.series_id = s.id
            WHERE w.id = $1`,
            [workflowId]
        );
        return result.rows[0];
    }

    // =============================================
    // TOOL DEFINITIONS
    // =============================================
    getTools() {
        return [
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
            }
        ];
    }

    // =============================================
    // TOOL HANDLERS
    // =============================================
    getToolHandler(toolName) {
        const handlers = {
            'create_workflow': this.handleCreateWorkflow.bind(this),
            'get_workflow_state': this.handleGetWorkflowState.bind(this),
            'advance_to_phase': this.handleAdvanceToPhase.bind(this),
            'complete_current_phase': this.handleCompleteCurrentPhase.bind(this),
            'execute_phase': this.handleExecutePhase.bind(this),
            'record_quality_gate': this.handleRecordQualityGate.bind(this),
            'request_approval': this.handleRequestApproval.bind(this),
            'submit_approval': this.handleSubmitApproval.bind(this),
            'get_pending_approvals': this.handleGetPendingApprovals.bind(this),
            'start_book_iteration': this.handleStartBookIteration.bind(this),
            'complete_book_iteration': this.handleCompleteBookIteration.bind(this),
            'get_series_progress': this.handleGetSeriesProgress.bind(this)
        };
        return handlers[toolName];
    }

    // Handler implementations
    async handleCreateWorkflow(args) {
        const { series_id, user_id, concept } = args;

        const result = await this.db.query(
            `INSERT INTO workflow_instances (series_id, author_id, metadata)
             VALUES ($1, $2, $3)
             RETURNING id, current_phase, phase_status`,
            [series_id, user_id, { concept }]
        );

        const workflow = result.rows[0];

        return {
            workflow_id: workflow.id,
            current_phase: workflow.current_phase,
            phase_status: workflow.phase_status
        };
    }

    async handleGetWorkflowState(args) {
        const { workflow_id } = args;
        const state = await this.getWorkflowState(workflow_id);

        if (!state) {
            throw new Error(`Workflow ${workflow_id} not found`);
        }

        const phaseNames = this.getPhaseNames();

        return {
            workflow_id: state.id,
            series_id: state.series_id,
            current_phase: state.current_phase,
            phase_name: phaseNames[state.current_phase] || 'Unknown',
            phase_status: state.phase_status,
            current_book: state.current_book,
            current_chapter: state.current_chapter,
            created_at: state.created_at,
            updated_at: state.updated_at
        };
    }

    async handleAdvanceToPhase(args) {
        const { workflow_id, target_phase } = args;

        const result = await this.db.query(
            `UPDATE workflow_instances 
             SET current_phase = $1, phase_status = 'in_progress', updated_at = NOW()
             WHERE id = $2
             RETURNING current_phase, phase_status`,
            [target_phase, workflow_id]
        );

        if (result.rowCount === 0) {
            throw new Error(`Workflow ${workflow_id} not found`);
        }

        return {
            success: true,
            current_phase: result.rows[0].current_phase,
            phase_status: result.rows[0].phase_status,
            message: `Advanced to phase ${target_phase}`
        };
    }

    async handleCompleteCurrentPhase(args) {
        const { workflow_id, output } = args;

        const state = await this.getWorkflowState(workflow_id);
        if (!state) throw new Error(`Workflow ${workflow_id} not found`);

        const currentPhase = state.current_phase;
        const nextPhase = currentPhase + 1;
        const phaseNames = this.getPhaseNames();

        // Record history
        await this.db.query(
            `INSERT INTO workflow_phase_history 
             (workflow_id, phase_number, phase_name, status, output_summary, metadata, completed_at)
             VALUES ($1, $2, $3, 'completed', $4, $5, NOW())`,
            [workflow_id, currentPhase, phaseNames[currentPhase] || `Phase ${currentPhase}`, output.summary, output.metadata || {}]
        );

        // Advance workflow
        const result = await this.db.query(
            `UPDATE workflow_instances 
             SET current_phase = $1, phase_status = 'in_progress', updated_at = NOW()
             WHERE id = $2
             RETURNING current_phase, phase_status`,
            [nextPhase, workflow_id]
        );

        return {
            completed_phase: currentPhase,
            next_phase: result.rows[0].current_phase,
            phase_status: result.rows[0].phase_status
        };
    }

    async handleExecutePhase(args) {
        const { workflow_id, phase_number, input } = args;

        // Update status to in_progress
        await this.db.query(
            `UPDATE workflow_instances 
             SET current_phase = $1, phase_status = 'in_progress', updated_at = NOW()
             WHERE id = $2`,
            [phase_number, workflow_id]
        );

        const phaseNames = this.getPhaseNames();

        // Log history start
        await this.db.query(
            `INSERT INTO workflow_phase_history 
             (workflow_id, phase_number, phase_name, status, metadata)
             VALUES ($1, $2, $3, 'started', $4)`,
            [workflow_id, phase_number, phaseNames[phase_number] || `Phase ${phase_number}`, input]
        );

        return {
            phase_number: phase_number,
            status: 'completed',
            output: { message: 'Phase executed successfully', input_echo: input }
        };
    }

    async handleRecordQualityGate(args) {
        const { workflow_id, gate_type, score, passed, violations } = args;

        const state = await this.getWorkflowState(workflow_id);

        const result = await this.db.query(
            `INSERT INTO workflow_quality_gates
             (workflow_id, phase_number, gate_type, score, passed, violations)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [workflow_id, state.current_phase, gate_type, score, passed, JSON.stringify(violations)]
        );

        return {
            gate_id: result.rows[0].id,
            passed: passed,
            next_action: passed ? 'proceed' : `return_to_phase_${state.current_phase}`
        };
    }

    async handleRequestApproval(args) {
        const { workflow_id, approval_type, artifacts } = args;

        const state = await this.getWorkflowState(workflow_id);

        const result = await this.db.query(
            `INSERT INTO workflow_approvals
             (workflow_id, phase_number, approval_type, artifacts, status)
             VALUES ($1, $2, $3, $4, 'pending')
             RETURNING id, requested_at`,
            [workflow_id, state.current_phase, approval_type, JSON.stringify(artifacts)]
        );

        // Update workflow status
        await this.db.query(
            `UPDATE workflow_instances 
             SET phase_status = 'waiting_approval', updated_at = NOW()
             WHERE id = $1`,
            [workflow_id]
        );

        return {
            approval_id: result.rows[0].id,
            status: 'pending',
            requested_at: result.rows[0].requested_at
        };
    }

    async handleSubmitApproval(args) {
        const { approval_id, decision, feedback } = args;

        const result = await this.db.query(
            `UPDATE workflow_approvals
             SET status = $1, feedback = $2, approved_at = NOW()
             WHERE id = $3
             RETURNING workflow_id`,
            [decision, feedback, approval_id]
        );

        if (result.rowCount === 0) throw new Error('Approval not found');

        const workflowId = result.rows[0].workflow_id;

        // If approved, update workflow status
        if (decision === 'approved') {
            await this.db.query(
                `UPDATE workflow_instances 
                 SET phase_status = 'in_progress', updated_at = NOW()
                 WHERE id = $1`,
                [workflowId]
            );
        }

        return {
            approval_id: approval_id,
            status: decision,
            approved_at: new Date().toISOString(),
            next_action: decision === 'approved' ? 'advance_next_phase' : 'revise'
        };
    }

    async handleGetPendingApprovals(args) {
        const { workflow_id } = args;

        const result = await this.db.query(
            `SELECT id, approval_type, requested_at, artifacts 
             FROM workflow_approvals 
             WHERE workflow_id = $1 AND status = 'pending'`,
            [workflow_id]
        );

        return result.rows.map(row => ({
            approval_id: row.id,
            approval_type: row.approval_type,
            requested_at: row.requested_at,
            artifacts: row.artifacts
        }));
    }

    async handleStartBookIteration(args) {
        const { workflow_id, book_number } = args;

        await this.db.query(
            `UPDATE workflow_instances 
             SET current_book = $1, current_phase = 9, phase_status = 'in_progress', updated_at = NOW()
             WHERE id = $2`,
            [book_number, workflow_id]
        );

        return {
            book_number: book_number,
            iteration_started: new Date().toISOString(),
            current_phase: 9
        };
    }

    async handleCompleteBookIteration(args) {
        const { workflow_id, book_number } = args;

        // Auto request approval
        const result = await this.db.query(
            `INSERT INTO workflow_approvals
             (workflow_id, phase_number, approval_type, status)
             VALUES ($1, 12, 'book_completion', 'pending')
             RETURNING id`,
            [workflow_id]
        );

        return {
            book_number: book_number,
            completed_at: new Date().toISOString(),
            approval_id: result.rows[0].id,
            next_book: book_number < 5 ? book_number + 1 : null
        };
    }

    async handleGetSeriesProgress(args) {
        const { workflow_id } = args;

        const state = await this.getWorkflowState(workflow_id);

        const totalBooks = 5;
        const booksCompleted = state.current_book - 1;
        const percentComplete = ((booksCompleted * 100) / totalBooks) + (state.current_phase / 12 * (100 / totalBooks));

        return {
            total_books: totalBooks,
            books_completed: booksCompleted,
            current_book: state.current_book,
            current_phase: state.current_phase,
            percent_complete: Math.min(100, Math.round(percentComplete))
        };
    }
}

export { WorkflowManagerMCPServer };

// CLI runner when called directly
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

const normalizedScriptPath = normalizePath(process.argv[1]);
const normalizedCurrentModuleUrl = import.meta.url.replace(/\/{3,}/g, '///')
    .replace(/^file:\/([^\/])/, 'file:///$1');

const isDirectExecution = normalizedCurrentModuleUrl === normalizedScriptPath ||
    decodeURIComponent(normalizedCurrentModuleUrl) === normalizedScriptPath;

if (process.env.MCP_STDIO_MODE) {
    console.error('[WORKFLOW-MANAGER] Running in MCP stdio mode - starting server...');
    try {
        const server = new WorkflowManagerMCPServer();
        await server.run();
    } catch (error) {
        console.error('[WORKFLOW-MANAGER] Failed to start MCP server:', error.message);
        console.error('[WORKFLOW-MANAGER] Stack:', error.stack);
        process.exit(1);
    }
} else if (isDirectExecution) {
    console.error('[WORKFLOW-MANAGER] Starting CLI runner...');
    try {
        const { CLIRunner } = await import('../../shared/cli-runner.js');
        const runner = new CLIRunner(WorkflowManagerMCPServer);
        await runner.run();
    } catch (error) {
        console.error('[WORKFLOW-MANAGER] CLI runner failed:', error.message);
        throw error;
    }
}
