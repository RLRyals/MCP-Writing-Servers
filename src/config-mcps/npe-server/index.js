// src/config-mcps/npe-server/index.js
// NPE (Narrative Physics Engine) Unified MCP Server
// Orchestrates all 4 NPE servers for comprehensive narrative physics tracking

// Protect stdout from debug logging in MCP stdio mode
if (process.env.MCP_STDIO_MODE === 'true') {
    const originalConsoleError = console.error;
    console.error = function() {
        process.stderr.write(Array.from(arguments).join(' ') + '\n');
    };
}

import { BaseMCPServer } from '../../shared/base-server.js';

// Import NPE handler classes from all 4 NPE servers
import { CausalityHandlers } from '../../mcps/npe-causality-server/handlers/causality-handlers.js';
import { NPEDecisionHandlers } from '../../mcps/npe-character-server/handlers/npe-decision-handlers.js';
import { NPESceneHandlers } from '../../mcps/npe-scene-server/handlers/npe-scene-handlers.js';
import { NPEAnalysisHandlers } from '../../mcps/npe-analysis-server/handlers/npe-analysis-handlers.js';

// Import tool schemas for NPE Analysis (which doesn't have a getTool method)
import { npeAnalysisToolsSchema } from '../../mcps/npe-analysis-server/schemas/npe-analysis-tools-schema.js';

class NPEConfigMCPServer extends BaseMCPServer {
    constructor() {
        super('npe-unified-server', '1.0.0');

        // Initialize all NPE handler instances with our shared DB connection
        this.initializeHandlers();

        // Build combined tool list
        this.tools = this.buildTools();

        console.error(`[NPE-CONFIG-SERVER] Initialized with ${this.tools.length} tools using 1 DB connection`);
    }

    initializeHandlers() {
        // Create handler instances passing our shared database
        this.causalityHandlers = new CausalityHandlers(this.db);
        this.npeDecisionHandlers = new NPEDecisionHandlers(this.db);
        this.npeSceneHandlers = new NPESceneHandlers(this.db);
        this.npeAnalysisHandlers = new NPEAnalysisHandlers(this.db);

        console.error('[NPE-CONFIG-SERVER] Handlers initialized with shared DB');
    }

    buildTools() {
        const tools = [];

        // NPE CAUSALITY TOOLS (from npe-causality-server)
        const causalityTools = this.causalityHandlers.getCausalityTools();
        tools.push(...causalityTools.map(tool => ({
            ...tool,
            description: `[Causality] ${tool.description}`
        })));

        // NPE CHARACTER DECISION TOOLS (from npe-character-server)
        const decisionTools = this.npeDecisionHandlers.getNPEDecisionTools();
        tools.push(...decisionTools.map(tool => ({
            ...tool,
            description: `[Character] ${tool.description}`
        })));

        // NPE SCENE VALIDATION TOOLS (from npe-scene-server)
        const sceneTools = this.npeSceneHandlers.getNPESceneTools();
        tools.push(...sceneTools.map(tool => ({
            ...tool,
            description: `[Scene] ${tool.description}`
        })));

        // NPE ANALYSIS TOOLS (from npe-analysis-server)
        // Note: NPE Analysis uses schema directly, not a handler method
        tools.push(...npeAnalysisToolsSchema.map(tool => ({
            ...tool,
            description: `[Analysis] ${tool.description}`
        })));

        return tools;
    }

    getToolHandler(toolName) {
        // Route to the appropriate handler based on tool name
        const handlerMap = {
            // Causality Chain Handlers (npe-causality-server)
            'create_causality_chain': (args) => this.causalityHandlers.handleCreateCausalityChain(args),
            'add_causal_link': (args) => this.causalityHandlers.handleAddCausalLink(args),
            'validate_causality_chain': (args) => this.causalityHandlers.handleValidateCausalityChain(args),
            'get_causality_chains_for_book': (args) => this.causalityHandlers.handleGetCausalityChainsForBook(args),

            // NPE Character Decision Handlers (npe-character-server)
            'log_character_decision': (args) => this.npeDecisionHandlers.handleLogCharacterDecision(args),
            'validate_character_decision': (args) => this.npeDecisionHandlers.handleValidateCharacterDecision(args),
            'get_character_decisions_in_scene': (args) => this.npeDecisionHandlers.handleGetCharacterDecisionsInScene(args),

            // NPE Scene Validation Handlers (npe-scene-server)
            'validate_scene_architecture': (args) => this.npeSceneHandlers.handleValidateSceneArchitecture(args),
            'validate_dialogue_physics': (args) => this.npeSceneHandlers.handleValidateDialoguePhysics(args),
            'get_scene_npe_compliance': (args) => this.npeSceneHandlers.handleGetSceneNPECompliance(args),

            // NPE Analysis Handlers (npe-analysis-server)
            'analyze_chapter_pacing': (args) => this.npeAnalysisHandlers.handleAnalyzeChapterPacing(args),
            'analyze_book_pacing': (args) => this.npeAnalysisHandlers.handleAnalyzeBookPacing(args),
            'track_stakes_escalation': (args) => this.npeAnalysisHandlers.handleTrackStakesEscalation(args),
            'get_pressure_trajectory': (args) => this.npeAnalysisHandlers.handleGetPressureTrajectory(args),
            'log_information_reveal': (args) => this.npeAnalysisHandlers.handleLogInformationReveal(args),
            'validate_information_economy': (args) => this.npeAnalysisHandlers.handleValidateInformationEconomy(args),
            'track_relationship_tension': (args) => this.npeAnalysisHandlers.handleTrackRelationshipTension(args),
            'get_relationship_tension_graph': (args) => this.npeAnalysisHandlers.handleGetRelationshipTensionGraph(args),
            'calculate_npe_compliance': (args) => this.npeAnalysisHandlers.handleCalculateNPECompliance(args),
            'get_npe_violations': (args) => this.npeAnalysisHandlers.handleGetNPEViolations(args)
        };

        return handlerMap[toolName] || null;
    }
}

export { NPEConfigMCPServer };

// CLI runner when called directly
import { fileURLToPath } from 'url';

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
    console.error('[NPE-CONFIG-SERVER] Running in MCP stdio mode - starting server...');
    try {
        const server = new NPEConfigMCPServer();
        await server.run();
    } catch (error) {
        console.error('[NPE-CONFIG-SERVER] Failed to start MCP server:', error.message);
        console.error('[NPE-CONFIG-SERVER] Stack:', error.stack);
        process.exit(1);
    }
} else if (isDirectExecution) {
    console.error('[NPE-CONFIG-SERVER] Starting CLI runner...');
    try {
        const { CLIRunner } = await import('../../shared/cli-runner.js');
        const runner = new CLIRunner(NPEConfigMCPServer);
        await runner.run();
    } catch (error) {
        console.error('[NPE-CONFIG-SERVER] CLI runner failed:', error.message);
        throw error;
    }
} else {
    console.error('[NPE-CONFIG-SERVER] Module imported - not starting server');
}
