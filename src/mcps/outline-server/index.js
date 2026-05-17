// src/mcps/outline-server/index.js
// Standalone Outline MCP Server.

if (process.env.MCP_STDIO_MODE === 'true') {
    const originalConsoleError = console.error;
    console.error = function () {
        process.stderr.write(Array.from(arguments).join(' ') + '\n');
    };
}

import { BaseMCPServer } from '../../shared/base-server.js';
import { WorksHandlers } from './handlers/works-handlers.js';
import { FactsHandlers } from './handlers/facts-handlers.js';
import { PromisesHandlers } from './handlers/promises-handlers.js';
import { EvidenceHandlers } from './handlers/evidence-handlers.js';
import { SceneEventsHandlers } from './handlers/scene-events-handlers.js';
import { BriefHandlers } from './handlers/brief-handlers.js';

class OutlineMCPServer extends BaseMCPServer {
    constructor() {
        super('outline-manager', '1.0.0');

        this.worksHandlers = new WorksHandlers(this.db);
        this.factsHandlers = new FactsHandlers(this.db);
        this.promisesHandlers = new PromisesHandlers(this.db);
        this.evidenceHandlers = new EvidenceHandlers(this.db);
        this.sceneEventsHandlers = new SceneEventsHandlers(this.db);
        this.briefHandlers = new BriefHandlers(this.db);

        this.tools = this.getTools();

        if (!this.tools || !Array.isArray(this.tools) || this.tools.length === 0) {
            console.error('[OUTLINE-SERVER] WARNING: Tools not properly initialized!');
            this.tools = this.getTools();
        }

        if (process.env.MCP_STDIO_MODE !== 'true') {
            console.error(`[OUTLINE-SERVER] Initialized with ${this.tools.length} tools`);
        }
    }

    getTools() {
        return [
            ...this.worksHandlers.getWorksTools(),
            ...this.factsHandlers.getFactsTools(),
            ...this.promisesHandlers.getPromisesTools(),
            ...this.evidenceHandlers.getEvidenceTools(),
            ...this.sceneEventsHandlers.getSceneEventsTools(),
            ...this.briefHandlers.getBriefTools()
        ];
    }

    getToolHandler(toolName) {
        const handlers = {
            // works
            'create_work':                this.worksHandlers.handleCreateWork.bind(this.worksHandlers),
            'update_work':                this.worksHandlers.handleUpdateWork.bind(this.worksHandlers),
            'move_work':                  this.worksHandlers.handleMoveWork.bind(this.worksHandlers),
            'delete_work':                this.worksHandlers.handleDeleteWork.bind(this.worksHandlers),
            'get_outline':                this.worksHandlers.handleGetOutline.bind(this.worksHandlers),
            'get_ancestry':               this.worksHandlers.handleGetAncestry.bind(this.worksHandlers),
            'list_series_roots':          this.worksHandlers.handleListSeriesRoots.bind(this.worksHandlers),
            'list_works':                 this.worksHandlers.handleListWorks.bind(this.worksHandlers),
            'search_works':               this.worksHandlers.handleSearchWorks.bind(this.worksHandlers),
            // facts
            'create_fact':                this.factsHandlers.handleCreateFact.bind(this.factsHandlers),
            'list_facts':                 this.factsHandlers.handleListFacts.bind(this.factsHandlers),
            'update_fact':                this.factsHandlers.handleUpdateFact.bind(this.factsHandlers),
            'delete_fact':                this.factsHandlers.handleDeleteFact.bind(this.factsHandlers),
            // promises
            'create_promise':             this.promisesHandlers.handleCreatePromise.bind(this.promisesHandlers),
            'update_promise':             this.promisesHandlers.handleUpdatePromise.bind(this.promisesHandlers),
            'list_open_promises':         this.promisesHandlers.handleListOpenPromises.bind(this.promisesHandlers),
            // evidence
            'create_evidence':            this.evidenceHandlers.handleCreateEvidence.bind(this.evidenceHandlers),
            'update_evidence':            this.evidenceHandlers.handleUpdateEvidence.bind(this.evidenceHandlers),
            'list_unconverted_evidence':  this.evidenceHandlers.handleListUnconvertedEvidence.bind(this.evidenceHandlers),
            // scene events
            'record_scene_events':        this.sceneEventsHandlers.handleRecordSceneEvents.bind(this.sceneEventsHandlers),
            'what_does_character_know_at':this.sceneEventsHandlers.handleWhatDoesCharacterKnowAt.bind(this.sceneEventsHandlers),
            // brief
            'get_scene_brief':            this.briefHandlers.handleGetSceneBrief.bind(this.briefHandlers)
        };
        return handlers[toolName];
    }
}

export { OutlineMCPServer };

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
const normalizedCurrentModuleUrl = import.meta.url
    .replace(/\/{3,}/g, '///')
    .replace(/^file:\/([^\/])/, 'file:///$1');

const isDirectExecution = normalizedCurrentModuleUrl === normalizedScriptPath ||
    decodeURIComponent(normalizedCurrentModuleUrl) === normalizedScriptPath;

if (process.env.MCP_STDIO_MODE) {
    console.error('[OUTLINE-SERVER] Running in MCP stdio mode - starting server...');
    try {
        const server = new OutlineMCPServer();
        await server.run();
    } catch (error) {
        console.error('[OUTLINE-SERVER] Failed to start MCP server:', error.message);
        console.error('[OUTLINE-SERVER] Stack:', error.stack);
        process.exit(1);
    }
} else if (isDirectExecution) {
    console.error('[OUTLINE-SERVER] Starting CLI runner...');
    try {
        const { CLIRunner } = await import('../../shared/cli-runner.js');
        const runner = new CLIRunner(OutlineMCPServer);
        await runner.run();
    } catch (error) {
        console.error('[OUTLINE-SERVER] CLI runner failed:', error.message);
        throw error;
    }
} else if (process.env.MCP_STDIO_MODE !== 'true') {
    console.error('[OUTLINE-SERVER] Module imported - not starting server');
}
