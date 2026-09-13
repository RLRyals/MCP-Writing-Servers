// src/mcps/biz-server/schemas/biz-tools-schema.js
// Tool schemas for the biz-server MCP (S15 business tracker, bead mws-s0l).
// Exposes the tools FictionLab-Online's lib/biz-server-client.js already
// assumes -- see that file's function-level comments for the exact shapes
// this mirrors. Shape matches schemas/kanban-tools-schema.js's convention:
// { name, description, inputSchema: { type:'object', properties, required } }.

const TRANSACTION_DIRECTION_ENUM = ['income', 'expense', 'transfer'];
const DEADLINE_CATEGORY_ENUM = ['compliance', 'renewal', 'launch', 'custom'];
const ASSET_TYPE_ENUM = ['image', 'video', 'audio', 'doc', 'receipt'];

export const bizToolsSchema = [
    {
        name: 'list_biz_transactions',
        description: "Lists an account's full transaction history, most recent first. Used by the importer for dedupe lookups and vendor-memory category matching.",
        inputSchema: {
            type: 'object',
            properties: {
                account_id: { type: 'integer', description: 'fictionlab.biz_accounts.id' }
            },
            required: ['account_id']
        }
    },
    {
        name: 'create_biz_transaction',
        description: 'Creates one transaction row. company_id is resolved from account_id, never passed by the caller.',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: { type: 'integer' },
                occurred_on: { type: 'string', description: 'ISO date, e.g. 2026-09-13' },
                amount: { type: 'number', description: 'Positive; sign comes from direction' },
                direction: { type: 'string', enum: TRANSACTION_DIRECTION_ENUM },
                category: { type: 'string' },
                vendor_contact_id: { type: 'integer' },
                book_ref: { type: 'string', description: 'Free-text label, not an FK' },
                subscription_id: { type: 'integer' },
                description: { type: 'string' }
            },
            required: ['account_id', 'occurred_on', 'amount', 'direction']
        }
    },
    {
        name: 'update_biz_transaction',
        description: "Updates a transaction's category and/or vendor_contact_id -- used by the tap-select categorize queue. Partial patch; only provided keys change.",
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'integer' },
                category: { type: 'string' },
                vendor_contact_id: { type: 'integer' }
            },
            required: ['id']
        }
    },
    {
        name: 'create_biz_asset',
        description: "Creates one biz_assets row -- used by the receipt-snap route. path_or_url is a pointer to a file already written elsewhere, never a second copy of the bytes. company_id resolves to the default company.",
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string' },
                asset_type: { type: 'string', enum: ASSET_TYPE_ENUM, default: 'image' },
                path_or_url: { type: 'string' },
                content_item_id: { type: 'integer' },
                transaction_id: { type: 'integer' },
                platform_id: { type: 'integer' },
                tags: { type: 'array', items: { type: 'string' } },
                notes: { type: 'string' }
            },
            required: ['title', 'path_or_url']
        }
    },
    {
        name: 'list_biz_deadlines',
        description: 'Lists deadlines, optionally scoped to a category, ordered by due_date.',
        inputSchema: {
            type: 'object',
            properties: {
                category: { type: 'string', enum: DEADLINE_CATEGORY_ENUM }
            }
        }
    },
    {
        name: 'complete_biz_deadline',
        description: "Completes a deadline with S14 recurrence semantics: recurrence='none' sets done_at; a recurring deadline rolls due_date forward one period (monthly/quarterly/annual) and clears any snooze, rather than duplicating rows.",
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'integer' }
            },
            required: ['id']
        }
    },
    {
        name: 'list_biz_subscriptions',
        description: 'Lists active subscriptions, each with its embedded renewal deadline (id, due_date) when linked.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'list_biz_debts',
        description: 'Lists debts, each with its embedded payment-due deadline (id, due_date) when linked.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'list_biz_savings_goals',
        description: 'Lists savings goals for the needs-attention dashboard.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'list_biz_content_items',
        description: 'Lists content calendar items, ordered by publish_date.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'list_biz_assets',
        description: 'Lists asset pointers (incl. receipts) for the needs-attention unmatched-receipt count.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    }
];
