// src/mcps/kanban-server/index.js
// Kanban MCP Server (S11 kanban board plugin, GH issue #58)
// A NEW, standalone server (not bolted onto workflow-manager-server) so the
// atomic claim stays in exactly one place and card tools stay off every
// writing node's token budget (only clients that declare the `kanban`
// server load them). Port 3015 (next free after S9's 3014 reservation).

// Protect stdout from debug logging in MCP stdio mode
if (process.env.MCP_STDIO_MODE === 'true') {
    console.error = function () {
        process.stderr.write(Array.from(arguments).join(' ') + '\n');
    };
}

import { BaseMCPServer } from '../../shared/base-server.js';
import { BoardHandlers } from './handlers/board-handlers.js';
import { CardHandlers } from './handlers/card-handlers.js';
import { ClaimHandlers } from './handlers/claim-handlers.js';
import { CommentHandlers } from './handlers/comment-handlers.js';
import { IdentityHandlers } from './handlers/identity-handlers.js';
import { kanbanToolsSchema } from './schemas/kanban-tools-schema.js';

class KanbanMCPServer extends BaseMCPServer {
    constructor() {
        console.error('[KANBAN] Constructor starting...');
        try {
            super('kanban', '1.0.0');
            console.error('[KANBAN] Constructor completed successfully');
        } catch (error) {
            console.error('[KANBAN] Constructor failed:', error.message);
            console.error('[KANBAN] Stack:', error.stack);
            throw error;
        }

        // All handlers share the ONE database pool (BaseMCPServer's shared
        // 20-conn pool via getSharedDatabasePool()) — no per-request pools.
        this.boardHandlers = new BoardHandlers(this.db);
        this.cardHandlers = new CardHandlers(this.db);
        this.claimHandlers = new ClaimHandlers(this.db);
        this.commentHandlers = new CommentHandlers(this.db);
        this.identityHandlers = new IdentityHandlers(this.db);

        this.tools = this.getTools();

        if (process.env.MCP_STDIO_MODE !== 'true') {
            console.error(`[KANBAN] Initialized with ${this.tools.length} tools`);
        }

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
                    console.error('[KANBAN] Database connection verified');
                } else {
                    console.error('[KANBAN] Database health check failed:', health.error);
                }
            }
        } catch (error) {
            console.error('[KANBAN] Database connection test failed:', error.message);
        }
    }

    getTools() {
        return [...kanbanToolsSchema];
    }

    getToolHandler(toolName) {
        const handlers = {
            // Board handlers (2 tools)
            'get_board': this.boardHandlers.handleGetBoard.bind(this.boardHandlers),
            'list_boards': this.boardHandlers.handleListBoards.bind(this.boardHandlers),
            // Card handlers (7 tools)
            'list_cards': this.cardHandlers.handleListCards.bind(this.cardHandlers),
            'create_card': this.cardHandlers.handleCreateCard.bind(this.cardHandlers),
            'update_card': this.cardHandlers.handleUpdateCard.bind(this.cardHandlers),
            'move_card': this.cardHandlers.handleMoveCard.bind(this.cardHandlers),
            'get_card': this.cardHandlers.handleGetCard.bind(this.cardHandlers),
            'add_card_link': this.cardHandlers.handleAddCardLink.bind(this.cardHandlers),
            'archive_card': this.cardHandlers.handleArchiveCard.bind(this.cardHandlers),
            // Claim handler (1 tool — the atomic compare-and-swap)
            'claim_card': this.claimHandlers.handleClaimCard.bind(this.claimHandlers),
            // Comment handler (1 tool)
            'comment_card': this.commentHandlers.handleCommentCard.bind(this.commentHandlers),
            // Identity handlers (3 tools) — GH issue #62 identities model;
            // delete_identity added by bead mws-1783883496146-1
            'list_identities': this.identityHandlers.handleListIdentities.bind(this.identityHandlers),
            'upsert_identity': this.identityHandlers.handleUpsertIdentity.bind(this.identityHandlers),
            'delete_identity': this.identityHandlers.handleDeleteIdentity.bind(this.identityHandlers)
        };
        return handlers[toolName];
    }
}

export { KanbanMCPServer };

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

if (process.env.MCP_STDIO_MODE && isDirectExecution) {
    console.error('[KANBAN] Running in MCP stdio mode - starting server...');
    try {
        const server = new KanbanMCPServer();
        await server.run();
    } catch (error) {
        console.error('[KANBAN] Failed to start MCP server:', error.message);
        console.error('[KANBAN] Stack:', error.stack);
        process.exit(1);
    }
} else if (isDirectExecution) {
    console.error('[KANBAN] Starting CLI runner...');
    try {
        const { CLIRunner } = await import('../../shared/cli-runner.js');
        const runner = new CLIRunner(KanbanMCPServer);
        await runner.run();
    } catch (error) {
        console.error('[KANBAN] CLI runner failed:', error.message);
        throw error;
    }
}
