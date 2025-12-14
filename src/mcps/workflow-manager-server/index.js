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
import { WorkflowHandlers } from './handlers/workflow-handlers.js';

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

        // Initialize workflow handlers with shared DB connection
        this.workflowHandlers = new WorkflowHandlers(this.db);

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

    getTools() {
        return this.workflowHandlers.getWorkflowTools();
    }

    getToolHandler(toolName) {
        const handlers = {
            'create_workflow': this.workflowHandlers.handleCreateWorkflow.bind(this.workflowHandlers),
            'get_workflow_state': this.workflowHandlers.handleGetWorkflowState.bind(this.workflowHandlers),
            'advance_to_phase': this.workflowHandlers.handleAdvanceToPhase.bind(this.workflowHandlers),
            'complete_current_phase': this.workflowHandlers.handleCompleteCurrentPhase.bind(this.workflowHandlers),
            'execute_phase': this.workflowHandlers.handleExecutePhase.bind(this.workflowHandlers),
            'record_quality_gate': this.workflowHandlers.handleRecordQualityGate.bind(this.workflowHandlers),
            'request_approval': this.workflowHandlers.handleRequestApproval.bind(this.workflowHandlers),
            'submit_approval': this.workflowHandlers.handleSubmitApproval.bind(this.workflowHandlers),
            'get_pending_approvals': this.workflowHandlers.handleGetPendingApprovals.bind(this.workflowHandlers),
            'start_book_iteration': this.workflowHandlers.handleStartBookIteration.bind(this.workflowHandlers),
            'complete_book_iteration': this.workflowHandlers.handleCompleteBookIteration.bind(this.workflowHandlers),
            'get_series_progress': this.workflowHandlers.handleGetSeriesProgress.bind(this.workflowHandlers),
            // Revision workflow handlers
            'start_revision_pass': this.workflowHandlers.handleStartRevisionPass.bind(this.workflowHandlers),
            'complete_revision_pass': this.workflowHandlers.handleCompleteRevisionPass.bind(this.workflowHandlers),
            'get_revision_status': this.workflowHandlers.handleGetRevisionStatus.bind(this.workflowHandlers),
            'run_qa_checklist': this.workflowHandlers.handleRunQAChecklist.bind(this.workflowHandlers),
            'mark_ready_to_publish': this.workflowHandlers.handleMarkReadyToPublish.bind(this.workflowHandlers),
            // Production metrics handlers
            'record_production_metric': this.workflowHandlers.handleRecordProductionMetric.bind(this.workflowHandlers),
            'get_workflow_metrics': this.workflowHandlers.handleGetWorkflowMetrics.bind(this.workflowHandlers),
            'get_workflow_velocity': this.workflowHandlers.handleGetWorkflowVelocity.bind(this.workflowHandlers),
            'get_daily_writing_stats': this.workflowHandlers.handleGetDailyWritingStats.bind(this.workflowHandlers),
            'get_phase_analytics': this.workflowHandlers.handleGetPhaseAnalytics.bind(this.workflowHandlers),
            // Workflow definition management handlers (Migration 028)
            'import_workflow_definition': this.workflowHandlers.handleImportWorkflowDefinition.bind(this.workflowHandlers),
            'get_workflow_definitions': this.workflowHandlers.handleGetWorkflowDefinitions.bind(this.workflowHandlers),
            'get_workflow_definition': this.workflowHandlers.handleGetWorkflowDefinition.bind(this.workflowHandlers),
            'create_workflow_version': this.workflowHandlers.handleCreateWorkflowVersion.bind(this.workflowHandlers),
            'get_workflow_versions': this.workflowHandlers.handleGetWorkflowVersions.bind(this.workflowHandlers),
            'lock_workflow_version': this.workflowHandlers.handleLockWorkflowVersion.bind(this.workflowHandlers),
            'unlock_workflow_version': this.workflowHandlers.handleUnlockWorkflowVersion.bind(this.workflowHandlers),
            'start_sub_workflow': this.workflowHandlers.handleStartSubWorkflow.bind(this.workflowHandlers),
            'complete_sub_workflow': this.workflowHandlers.handleCompleteSubWorkflow.bind(this.workflowHandlers),
            'get_sub_workflow_status': this.workflowHandlers.handleGetSubWorkflowStatus.bind(this.workflowHandlers),
            'update_phase_execution': this.workflowHandlers.handleUpdatePhaseExecution.bind(this.workflowHandlers),
            'export_workflow_package': this.workflowHandlers.handleExportWorkflowPackage.bind(this.workflowHandlers)
        };
        return handlers[toolName];
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
