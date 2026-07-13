// src/config-mcps/story-analysis-server/index.js
// Phase-based MCP Server: Story Analysis
// Tools for analyzing story dynamics, character throughlines, story
// appreciations, and problem/solution mapping (narrative-theory-inspired).

// Protect stdout from debug logging in MCP stdio mode
if (process.env.MCP_STDIO_MODE === 'true') {
    const originalConsoleError = console.error;
    console.error = function () {
        process.stderr.write(Array.from(arguments).join(' ') + '\n');
    };
}

import { BaseMCPServer } from '../../shared/base-server.js';

// Import ONLY the handler class - NOT the full server
import { StoryAnalysisHandlers } from '../../mcps/story-analysis-server/handlers/story-analysis-handlers.js';

class StoryAnalysisMCPServer extends BaseMCPServer {
    constructor() {
        super('story-analysis-server', '1.0.0');

        // Initialize handler instance with our shared DB connection
        this.initializeHandlers();

        // Build tool list
        this.tools = this.buildTools();

        console.error(`[STORY-ANALYSIS-SERVER] Initialized with ${this.tools.length} tools using 1 DB connection`);
    }

    initializeHandlers() {
        // Create handler instance passing our shared database
        this.storyAnalysisHandlers = new StoryAnalysisHandlers(this.db);

        console.error('[STORY-ANALYSIS-SERVER] Handlers initialized with shared DB');
    }

    buildTools() {
        const tools = [];

        // STORY ANALYSIS TOOLS
        const storyAnalysisTools = this.storyAnalysisHandlers.getStoryAnalysisTools();

        const analyzeStoryDynamics = storyAnalysisTools.find(t => t.name === 'analyze_story_dynamics');
        if (analyzeStoryDynamics) {
            tools.push({
                ...analyzeStoryDynamics,
                name: 'analyze_story_dynamics',
                description: 'Analyze the overall story dynamics for a book (story concern, main/influence character problems, outcome, judgment, thematic elements)'
            });
        }

        const trackCharacterThroughlines = storyAnalysisTools.find(t => t.name === 'track_character_throughlines');
        if (trackCharacterThroughlines) {
            tools.push({
                ...trackCharacterThroughlines,
                name: 'track_character_throughlines',
                description: 'Track a character\'s throughline for a book (main character, influence character, relationship, or objective story)'
            });
        }

        const identifyStoryAppreciations = storyAnalysisTools.find(t => t.name === 'identify_story_appreciations');
        if (identifyStoryAppreciations) {
            tools.push({
                ...identifyStoryAppreciations,
                name: 'identify_story_appreciations',
                description: 'Identify and record a story appreciation (a narrative-theory observation about the book, with supporting evidence and confidence)'
            });
        }

        const mapProblemSolutions = storyAnalysisTools.find(t => t.name === 'map_problem_solutions');
        if (mapProblemSolutions) {
            tools.push({
                ...mapProblemSolutions,
                name: 'map_problem_solutions',
                description: 'Map a problem to its attempted solution at a given level (overall story, main character, influence character, or relationship), with effectiveness'
            });
        }

        return tools;
    }

    getToolHandler(toolName) {
        // Route to the appropriate handler based on tool name
        const handlerMap = {
            // Story analysis handlers
            'analyze_story_dynamics': (args) => this.storyAnalysisHandlers.handleAnalyzeStoryDynamics(args),
            'track_character_throughlines': (args) => this.storyAnalysisHandlers.handleTrackCharacterThroughlines(args),
            'identify_story_appreciations': (args) => this.storyAnalysisHandlers.handleIdentifyStoryAppreciations(args),
            'map_problem_solutions': (args) => this.storyAnalysisHandlers.handleMapProblemSolutions(args)
        };

        return handlerMap[toolName] || null;
    }
}

export { StoryAnalysisMCPServer };

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
    console.error('[STORY-ANALYSIS-SERVER] Running in MCP stdio mode - starting server...');
    try {
        const server = new StoryAnalysisMCPServer();
        await server.run();
    } catch (error) {
        console.error('[STORY-ANALYSIS-SERVER] Failed to start MCP server:', error.message);
        console.error('[STORY-ANALYSIS-SERVER] Stack:', error.stack);
        process.exit(1);
    }
} else if (isDirectExecution) {
    console.error('[STORY-ANALYSIS-SERVER] Starting CLI runner...');
    try {
        const { CLIRunner } = await import('../../shared/cli-runner.js');
        const runner = new CLIRunner(StoryAnalysisMCPServer);
        await runner.run();
    } catch (error) {
        console.error('[STORY-ANALYSIS-SERVER] CLI runner failed:', error.message);
        throw error;
    }
} else {
    console.error('[STORY-ANALYSIS-SERVER] Module imported - not starting server');
}
