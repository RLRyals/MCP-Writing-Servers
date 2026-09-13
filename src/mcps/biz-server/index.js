// src/mcps/biz-server/index.js
// Business/finance MCP server (S15 broadquill business tracker, bead
// mws-s0l). FictionLab-Online's modules/business.js already calls this
// server's /api/tool-call (via lib/biz-server-client.js) at
// BIZ_SERVER_URL (default http://127.0.0.1:3014) -- migrations 048-053,
// 055 already created the fictionlab.biz_* schema; this is the tool-call API
// in front of it, following the same pattern as kanban-server.

// Protect stdout from debug logging in MCP stdio mode
if (process.env.MCP_STDIO_MODE === 'true') {
    console.error = function () {
        process.stderr.write(Array.from(arguments).join(' ') + '\n');
    };
}

import { BaseMCPServer } from '../../shared/base-server.js';
import { TransactionHandlers } from './handlers/transaction-handlers.js';
import { DeadlineHandlers } from './handlers/deadline-handlers.js';
import { ListingHandlers } from './handlers/listing-handlers.js';
import { bizToolsSchema } from './schemas/biz-tools-schema.js';

class BizMCPServer extends BaseMCPServer {
    constructor() {
        console.error('[BIZ] Constructor starting...');
        try {
            super('biz', '1.0.0');
            console.error('[BIZ] Constructor completed successfully');
        } catch (error) {
            console.error('[BIZ] Constructor failed:', error.message);
            console.error('[BIZ] Stack:', error.stack);
            throw error;
        }

        // All handlers share the ONE database pool (BaseMCPServer's shared
        // 20-conn pool via getSharedDatabasePool()) — no per-request pools.
        this.transactionHandlers = new TransactionHandlers(this.db);
        this.deadlineHandlers = new DeadlineHandlers(this.db);
        this.listingHandlers = new ListingHandlers(this.db);

        this.tools = this.getTools();

        if (process.env.MCP_STDIO_MODE !== 'true') {
            console.error(`[BIZ] Initialized with ${this.tools.length} tools`);
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
                    console.error('[BIZ] Database connection verified');
                } else {
                    console.error('[BIZ] Database health check failed:', health.error);
                }
            }
        } catch (error) {
            console.error('[BIZ] Database connection test failed:', error.message);
        }
    }

    getTools() {
        return [...bizToolsSchema];
    }

    getToolHandler(toolName) {
        const handlers = {
            'list_biz_transactions': this.transactionHandlers.handleListBizTransactions.bind(this.transactionHandlers),
            'create_biz_transaction': this.transactionHandlers.handleCreateBizTransaction.bind(this.transactionHandlers),
            'update_biz_transaction': this.transactionHandlers.handleUpdateBizTransaction.bind(this.transactionHandlers),
            'create_biz_asset': this.transactionHandlers.handleCreateBizAsset.bind(this.transactionHandlers),
            'list_biz_deadlines': this.deadlineHandlers.handleListBizDeadlines.bind(this.deadlineHandlers),
            'complete_biz_deadline': this.deadlineHandlers.handleCompleteBizDeadline.bind(this.deadlineHandlers),
            'list_biz_subscriptions': this.listingHandlers.handleListBizSubscriptions.bind(this.listingHandlers),
            'list_biz_debts': this.listingHandlers.handleListBizDebts.bind(this.listingHandlers),
            'list_biz_savings_goals': this.listingHandlers.handleListBizSavingsGoals.bind(this.listingHandlers),
            'list_biz_content_items': this.listingHandlers.handleListBizContentItems.bind(this.listingHandlers),
            'list_biz_assets': this.listingHandlers.handleListBizAssets.bind(this.listingHandlers)
        };
        return handlers[toolName];
    }
}

export { BizMCPServer };

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
    console.error('[BIZ] Running in MCP stdio mode - starting server...');
    try {
        const server = new BizMCPServer();
        await server.run();
    } catch (error) {
        console.error('[BIZ] Failed to start MCP server:', error.message);
        console.error('[BIZ] Stack:', error.stack);
        process.exit(1);
    }
} else if (isDirectExecution) {
    console.error('[BIZ] Starting CLI runner...');
    try {
        const { CLIRunner } = await import('../../shared/cli-runner.js');
        const runner = new CLIRunner(BizMCPServer);
        await runner.run();
    } catch (error) {
        console.error('[BIZ] CLI runner failed:', error.message);
        throw error;
    }
}
