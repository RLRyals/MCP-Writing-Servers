// src/mcps/npe-analysis-server/index.js
// NPE (Narrative Physics Engine) Pacing and Compliance Analysis MCP Server
// This server provides tools for analyzing narrative pacing, stakes escalation,
// information economy, relationship tension, and overall NPE compliance.

// Protect stdout from debug logging in MCP stdio mode
if (process.env.MCP_STDIO_MODE === 'true') {
    const originalConsoleError = console.error;
    console.error = function() {
        process.stderr.write(Array.from(arguments).join(' ') + '\n');
    };
}

import { BaseMCPServer } from '../../shared/base-server.js';
import { NPEAnalysisHandlers } from './handlers/npe-analysis-handlers.js';
import {
    lookupSystemToolsSchema,
    npeAnalysisToolsSchema
} from './schemas/npe-analysis-tools-schema.js';

class NPEAnalysisMCPServer extends BaseMCPServer {
    constructor() {
        console.error('[NPE-ANALYSIS-SERVER] Constructor starting...');
        try {
            super('npe-analysis', '1.0.0');
            console.error('[NPE-ANALYSIS-SERVER] Constructor completed successfully');
        } catch (error) {
            console.error('[NPE-ANALYSIS-SERVER] Constructor failed:', error.message);
            throw error;
        }

        // Initialize handler module
        try {
            this.npeAnalysisHandlers = new NPEAnalysisHandlers(this.db);
            console.error('[NPE-ANALYSIS-SERVER] NPE analysis handlers initialized');
        } catch (error) {
            console.error('[NPE-ANALYSIS-SERVER] Handler initialization failed:', error.message);
            throw error;
        }

        // Bind handler methods
        this.bindHandlerMethods();

        // Initialize tools
        this.tools = this.getTools();

        if (!this.tools || !Array.isArray(this.tools) || this.tools.length === 0) {
            console.error('[NPE-ANALYSIS-SERVER] WARNING: Tools not properly initialized!');
            this.tools = [...lookupSystemToolsSchema];
        }

        if (process.env.MCP_STDIO_MODE !== 'true') {
            console.error(`[NPE-ANALYSIS-SERVER] Initialized with ${this.tools.length} tools`);
        }

        this.testDatabaseConnection();
    }

    bindHandlerMethods() {
        try {
            // Pacing analysis handlers
            this.handleAnalyzeChapterPacing = this.npeAnalysisHandlers.handleAnalyzeChapterPacing.bind(this.npeAnalysisHandlers);
            this.handleAnalyzeBookPacing = this.npeAnalysisHandlers.handleAnalyzeBookPacing.bind(this.npeAnalysisHandlers);

            // Stakes & pressure handlers
            this.handleTrackStakesEscalation = this.npeAnalysisHandlers.handleTrackStakesEscalation.bind(this.npeAnalysisHandlers);
            this.handleGetPressureTrajectory = this.npeAnalysisHandlers.handleGetPressureTrajectory.bind(this.npeAnalysisHandlers);

            // Information economy handlers
            this.handleLogInformationReveal = this.npeAnalysisHandlers.handleLogInformationReveal.bind(this.npeAnalysisHandlers);
            this.handleValidateInformationEconomy = this.npeAnalysisHandlers.handleValidateInformationEconomy.bind(this.npeAnalysisHandlers);

            // Relationship tension handlers
            this.handleTrackRelationshipTension = this.npeAnalysisHandlers.handleTrackRelationshipTension.bind(this.npeAnalysisHandlers);
            this.handleGetRelationshipTensionGraph = this.npeAnalysisHandlers.handleGetRelationshipTensionGraph.bind(this.npeAnalysisHandlers);

            // Compliance scoring handlers
            this.handleCalculateNPECompliance = this.npeAnalysisHandlers.handleCalculateNPECompliance.bind(this.npeAnalysisHandlers);
            this.handleGetNPEViolations = this.npeAnalysisHandlers.handleGetNPEViolations.bind(this.npeAnalysisHandlers);

            console.error('[NPE-ANALYSIS-SERVER] All handler methods bound successfully');
        } catch (error) {
            console.error('[NPE-ANALYSIS-SERVER] Method binding failed:', error.message);
            throw error;
        }
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
                    console.error('[NPE-ANALYSIS-SERVER] Database connection verified');
                } else {
                    console.error('[NPE-ANALYSIS-SERVER] Database health check failed:', health.error);
                }
            }
        } catch (error) {
            console.error('[NPE-ANALYSIS-SERVER] Database connection test failed:', error.message);
        }
    }

    getTools() {
        try {
            const tools = [
                // Lookup system tools (read-only)
                ...lookupSystemToolsSchema,

                // NPE analysis tools
                ...npeAnalysisToolsSchema
            ];

            console.error(`[NPE-ANALYSIS-SERVER] Tools registered: ${tools.length} total`);
            return tools;
        } catch (error) {
            console.error('[NPE-ANALYSIS-SERVER] Tool registration failed:', error.message);
            return [...lookupSystemToolsSchema];
        }
    }

    getToolHandler(toolName) {
        const handlers = {
            // Pacing Analysis
            'analyze_chapter_pacing': this.handleAnalyzeChapterPacing,
            'analyze_book_pacing': this.handleAnalyzeBookPacing,

            // Stakes & Pressure
            'track_stakes_escalation': this.handleTrackStakesEscalation,
            'get_pressure_trajectory': this.handleGetPressureTrajectory,

            // Information Economy
            'log_information_reveal': this.handleLogInformationReveal,
            'validate_information_economy': this.handleValidateInformationEconomy,

            // Relationship Tension
            'track_relationship_tension': this.handleTrackRelationshipTension,
            'get_relationship_tension_graph': this.handleGetRelationshipTensionGraph,

            // Compliance Scoring
            'calculate_npe_compliance': this.handleCalculateNPECompliance,
            'get_npe_violations': this.handleGetNPEViolations
        };

        const handler = handlers[toolName];
        if (!handler) {
            console.error(`[NPE-ANALYSIS-SERVER] No handler found for tool: ${toolName}`);
        }
        return handler;
    }
}

export { NPEAnalysisMCPServer };

// CLI runner when called directly
import { fileURLToPath } from 'url';

if (process.env.MCP_STDIO_MODE !== 'true') {
    console.error('[NPE-ANALYSIS-SERVER] Module loaded');
}

// Normalize paths for cross-platform compatibility
const currentModuleUrl = import.meta.url;
let scriptPath = process.argv[1];
if (scriptPath.includes('\\')) {
    scriptPath = `file:///${scriptPath.replace(/\\/g, '/')}`;
} else {
    scriptPath = `file://${scriptPath}`;
}
const normalizedCurrentUrl = decodeURIComponent(currentModuleUrl);
const normalizedScriptPath = decodeURIComponent(scriptPath);
const isDirectExecution = normalizedCurrentUrl === normalizedScriptPath || process.env.MCP_STDIO_MODE === 'true';

if (process.env.MCP_STDIO_MODE === 'true') {
    console.error('[NPE-ANALYSIS-SERVER] Running in MCP stdio mode - starting server...');

    if (process.env.MCP_STDIO_MODE === 'true') {
        console.error('[NPE-ANALYSIS-SERVER] Setting up stdio mode handlers');
        console.log = function(...args) {
            console.error('[NPE-ANALYSIS-SERVER]', ...args);
        };
    }

    try {
        console.error('[NPE-ANALYSIS-SERVER] Creating server instance...');
        const server = new NPEAnalysisMCPServer();
        console.error('[NPE-ANALYSIS-SERVER] Server instance created, starting run()...');
        await server.run();
        console.error('[NPE-ANALYSIS-SERVER] Server run() completed successfully');
    } catch (error) {
        console.error('[NPE-ANALYSIS-SERVER] Failed to start MCP server:', error.message);
        console.error('[NPE-ANALYSIS-SERVER] Stack:', error.stack);
        process.exit(1);
    }
} else if (isDirectExecution) {
    console.error('[NPE-ANALYSIS-SERVER] Starting CLI runner...');
    try {
        const { CLIRunner } = await import('../../shared/cli-runner.js');
        const runner = new CLIRunner(NPEAnalysisMCPServer);
        await runner.run();
    } catch (error) {
        console.error('[NPE-ANALYSIS-SERVER] CLI runner failed:', error.message);
        process.exit(1);
    }
} else {
    if (process.env.MCP_STDIO_MODE !== 'true') {
        console.error('[NPE-ANALYSIS-SERVER] Module imported - not starting server');
    }
}
