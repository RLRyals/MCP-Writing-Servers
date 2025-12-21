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
import { DefinitionHandlers } from './handlers/definition-handlers.js';
import { SubworkflowHandlers } from './handlers/subworkflow-handlers.js';
import { GraphHandlers } from './handlers/graph-handlers.js';
import { workflowToolsSchema } from './schemas/workflow-tools-schema.js';

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
        this.definitionHandlers = new DefinitionHandlers(this.db);
        this.subworkflowHandlers = new SubworkflowHandlers(this.db);
        this.graphHandlers = new GraphHandlers(this.db);

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
        return workflowToolsSchema;
    }

    getToolHandler(toolName) {
        const handlers = {
            // Definition Handlers (10 tools)
            'import_workflow_definition': this.definitionHandlers.handleImportWorkflowDefinition.bind(this.definitionHandlers),
            'get_workflow_definitions': this.definitionHandlers.handleGetWorkflowDefinitions.bind(this.definitionHandlers),
            'get_workflow_definition': this.definitionHandlers.handleGetWorkflowDefinition.bind(this.definitionHandlers),
            'update_workflow_positions': this.definitionHandlers.handleUpdateWorkflowPositions.bind(this.definitionHandlers),
            'create_workflow_version': this.definitionHandlers.handleCreateWorkflowVersion.bind(this.definitionHandlers),
            'get_workflow_versions': this.definitionHandlers.handleGetWorkflowVersions.bind(this.definitionHandlers),
            'lock_workflow_version': this.definitionHandlers.handleLockWorkflowVersion.bind(this.definitionHandlers),
            'unlock_workflow_version': this.definitionHandlers.handleUnlockWorkflowVersion.bind(this.definitionHandlers),
            'update_phase_execution': this.definitionHandlers.handleUpdatePhaseExecution.bind(this.definitionHandlers),
            'export_workflow_package': this.definitionHandlers.handleExportWorkflowPackage.bind(this.definitionHandlers),
            // Subworkflow Handlers (3 tools)
            'start_sub_workflow': this.subworkflowHandlers.handleStartSubWorkflow.bind(this.subworkflowHandlers),
            'complete_sub_workflow': this.subworkflowHandlers.handleCompleteSubWorkflow.bind(this.subworkflowHandlers),
            'get_sub_workflow_status': this.subworkflowHandlers.handleGetSubWorkflowStatus.bind(this.subworkflowHandlers),
            // Graph Handlers (6 tools)
            'add_node': this.graphHandlers.handleAddNode.bind(this.graphHandlers),
            'update_node': this.graphHandlers.handleUpdateNode.bind(this.graphHandlers),
            'delete_node': this.graphHandlers.handleDeleteNode.bind(this.graphHandlers),
            'create_edge': this.graphHandlers.handleCreateEdge.bind(this.graphHandlers),
            'update_edge': this.graphHandlers.handleUpdateEdge.bind(this.graphHandlers),
            'delete_edge': this.graphHandlers.handleDeleteEdge.bind(this.graphHandlers)
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
