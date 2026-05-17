// src/config-mcps/outline-server/index.js
// Phase-based MCP Server: Outlining Phase
// Aggregates the outline-server tools. Imports handlers and schemas only;
// no code duplication, one DB connection. Matches the pattern used by
// series-planning-server, book-planning-server, etc.

if (process.env.MCP_STDIO_MODE === 'true') {
    const originalConsoleError = console.error;
    console.error = function () {
        process.stderr.write(Array.from(arguments).join(' ') + '\n');
    };
}

import { BaseMCPServer } from '../../shared/base-server.js';

// Schemas
import {
    worksToolsSchema,
    factsToolsSchema,
    promisesToolsSchema,
    evidenceToolsSchema,
    sceneEventsToolsSchema,
    briefToolsSchema
} from '../../mcps/outline-server/schemas/outline-tools-schema.js';

// Handlers
import { WorksHandlers } from '../../mcps/outline-server/handlers/works-handlers.js';
import { FactsHandlers } from '../../mcps/outline-server/handlers/facts-handlers.js';
import { PromisesHandlers } from '../../mcps/outline-server/handlers/promises-handlers.js';
import { EvidenceHandlers } from '../../mcps/outline-server/handlers/evidence-handlers.js';
import { SceneEventsHandlers } from '../../mcps/outline-server/handlers/scene-events-handlers.js';
import { BriefHandlers } from '../../mcps/outline-server/handlers/brief-handlers.js';

class OutlinePhaseMCPServer extends BaseMCPServer {
    constructor() {
        super('outline-phase', '1.0.0');

        this.initializeHandlers();
        this.tools = this.buildTools();

        console.error(`[OUTLINE-PHASE] Initialized with ${this.tools.length} tools using 1 DB connection`);
    }

    initializeHandlers() {
        this.worksHandlers = new WorksHandlers(this.db);
        this.factsHandlers = new FactsHandlers(this.db);
        this.promisesHandlers = new PromisesHandlers(this.db);
        this.evidenceHandlers = new EvidenceHandlers(this.db);
        this.sceneEventsHandlers = new SceneEventsHandlers(this.db);
        this.briefHandlers = new BriefHandlers(this.db);

        console.error('[OUTLINE-PHASE] Handlers initialized with shared DB');
    }

    buildTools() {
        return [
            ...worksToolsSchema,
            ...factsToolsSchema,
            ...promisesToolsSchema,
            ...evidenceToolsSchema,
            ...sceneEventsToolsSchema,
            ...briefToolsSchema
        ];
    }

    getToolHandler(toolName) {
        const handlerMap = {
            'create_work':                this.worksHandlers.handleCreateWork.bind(this.worksHandlers),
            'update_work':                this.worksHandlers.handleUpdateWork.bind(this.worksHandlers),
            'move_work':                  this.worksHandlers.handleMoveWork.bind(this.worksHandlers),
            'delete_work':                this.worksHandlers.handleDeleteWork.bind(this.worksHandlers),
            'get_outline':                this.worksHandlers.handleGetOutline.bind(this.worksHandlers),
            'get_ancestry':               this.worksHandlers.handleGetAncestry.bind(this.worksHandlers),
            'list_series_roots':          this.worksHandlers.handleListSeriesRoots.bind(this.worksHandlers),
            'list_works':                 this.worksHandlers.handleListWorks.bind(this.worksHandlers),
            'search_works':               this.worksHandlers.handleSearchWorks.bind(this.worksHandlers),
            'create_fact':                this.factsHandlers.handleCreateFact.bind(this.factsHandlers),
            'list_facts':                 this.factsHandlers.handleListFacts.bind(this.factsHandlers),
            'update_fact':                this.factsHandlers.handleUpdateFact.bind(this.factsHandlers),
            'delete_fact':                this.factsHandlers.handleDeleteFact.bind(this.factsHandlers),
            'create_promise':             this.promisesHandlers.handleCreatePromise.bind(this.promisesHandlers),
            'update_promise':             this.promisesHandlers.handleUpdatePromise.bind(this.promisesHandlers),
            'list_open_promises':         this.promisesHandlers.handleListOpenPromises.bind(this.promisesHandlers),
            'create_evidence':            this.evidenceHandlers.handleCreateEvidence.bind(this.evidenceHandlers),
            'update_evidence':            this.evidenceHandlers.handleUpdateEvidence.bind(this.evidenceHandlers),
            'list_unconverted_evidence':  this.evidenceHandlers.handleListUnconvertedEvidence.bind(this.evidenceHandlers),
            'record_scene_events':        this.sceneEventsHandlers.handleRecordSceneEvents.bind(this.sceneEventsHandlers),
            'what_does_character_know_at':this.sceneEventsHandlers.handleWhatDoesCharacterKnowAt.bind(this.sceneEventsHandlers),
            'get_scene_brief':            this.briefHandlers.handleGetSceneBrief.bind(this.briefHandlers)
        };
        return handlerMap[toolName] || null;
    }
}

export { OutlinePhaseMCPServer };

// CLI runner
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
const normalizedCurrentModuleUrl = import.meta.url
    .replace(/\/{3,}/g, '///')
    .replace(/^file:\/([^\/])/, 'file:///$1');

const isDirectExecution = normalizedCurrentModuleUrl === normalizedScriptPath ||
    decodeURIComponent(normalizedCurrentModuleUrl) === normalizedScriptPath;

if (process.env.MCP_STDIO_MODE) {
    console.error('[OUTLINE-PHASE] Running in MCP stdio mode - starting server...');
    try {
        const server = new OutlinePhaseMCPServer();
        await server.run();
    } catch (error) {
        console.error('[OUTLINE-PHASE] Failed to start MCP server:', error.message);
        console.error('[OUTLINE-PHASE] Stack:', error.stack);
        process.exit(1);
    }
} else if (isDirectExecution) {
    console.error('[OUTLINE-PHASE] Starting CLI runner...');
    try {
        const { CLIRunner } = await import('../../shared/cli-runner.js');
        const runner = new CLIRunner(OutlinePhaseMCPServer);
        await runner.run();
    } catch (error) {
        console.error('[OUTLINE-PHASE] CLI runner failed:', error.message);
        throw error;
    }
} else {
    console.error('[OUTLINE-PHASE] Module imported - not starting server');
}
