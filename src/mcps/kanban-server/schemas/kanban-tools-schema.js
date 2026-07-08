// src/mcps/kanban-server/schemas/kanban-tools-schema.js
// Tool schemas for the kanban-server MCP (S11 kanban board plugin, GH issue #58).
// Shape matches schemas/active-workflow-tools-schema.js:
// { name, description, inputSchema: { type:'object', properties, required } }.
// All tools return { ok:true, ... } or { ok:false, error } via BaseMCPServer's
// formatSuccess/formatError wrapping; every mutation also writes a
// kanban_activity row (see handlers/kanban-helpers.js logActivity).

const CARD_STATUS_ENUM = ['backlog', 'ready', 'claimed', 'in_progress', 'review', 'blocked', 'done', 'archived'];
const PRIORITY_ENUM = ['low', 'normal', 'high', 'urgent'];

export const kanbanToolsSchema = [
    // ---- 7 required tools ----
    {
        name: 'get_board',
        description: 'Gets a board plus its columns (ordered lanes) with per-column card counts — the board-render call.',
        inputSchema: {
            type: 'object',
            properties: {
                board_key: { type: 'string', description: 'Board slug, e.g. dev-backlog' },
                board_id: { type: 'string', description: 'Board UUID (alternative to board_key)' }
            }
        }
    },
    {
        name: 'list_cards',
        description: 'Lists cards with filters: board, assignee, agent, status, label, priority, agent_claimable_only, include_archived, include_workflow_phase, due_filter. The workhorse read tool.',
        inputSchema: {
            type: 'object',
            properties: {
                board_key: { type: 'string' },
                board_id: { type: 'string' },
                assignee: {
                    type: 'string',
                    description: "Exact match. Special: 'rebecca' (her queue); '__unassigned__' (assignee IS NULL)"
                },
                agent: {
                    type: 'string',
                    description: 'When set, returns cards claimable-by-or-assigned-to this agent id'
                },
                status: { type: 'string', enum: CARD_STATUS_ENUM },
                label: { type: 'string', description: 'Single label the card must carry' },
                priority: { type: 'string', enum: PRIORITY_ENUM },
                agent_claimable_only: {
                    type: 'boolean',
                    default: false,
                    description: "Only cards agents may claim (agent_claimable=TRUE AND assignee<>'rebecca')"
                },
                include_archived: { type: 'boolean', default: false },
                include_workflow_phase: {
                    type: 'boolean',
                    default: false,
                    description: 'Join live phase for cards with workflow_registry_id'
                },
                due_filter: {
                    type: 'string',
                    enum: ['overdue', 'upcoming'],
                    description: "S14 fold-in minimum. 'overdue': due_at is set, in the past, and status is not done/archived. 'upcoming': due_at is set and in the future (status not done/archived). Results are additionally ordered by due_at ascending when this is set."
                },
                limit: { type: 'integer', default: 200 }
            }
        }
    },
    {
        name: 'create_card',
        description: "Creates a card — full or quick-add (title-only is valid, the fast path). Board resolves to 'dev-backlog' if neither board_key nor board_id given. review_policy is defaulted by risk class unless explicitly provided.",
        inputSchema: {
            type: 'object',
            properties: {
                board_key: { type: 'string' },
                board_id: { type: 'string' },
                title: { type: 'string' },
                body: { type: 'string' },
                status: { type: 'string', enum: CARD_STATUS_ENUM, default: 'ready' },
                assignee: { type: 'string' },
                priority: { type: 'string', enum: PRIORITY_ENUM, default: 'normal' },
                labels: { type: 'array', items: { type: 'string' } },
                spec_ref: { type: 'string' },
                issue_ref: { type: 'string' },
                created_by: { type: 'string', default: 'rebecca' },
                due_at: {
                    type: 'string',
                    description: 'ISO 8601 timestamp. Optional card deadline (S14 fold-in minimum). Omit for no deadline.'
                },
                review_policy: {
                    type: 'string',
                    enum: ['auto-done', 'review-required'],
                    description: 'Optional override for callers that already know the risk class; otherwise defaulted from title/body/labels/refs.'
                }
            },
            required: ['title']
        }
    },
    {
        name: 'claim_card',
        description: "ATOMIC compare-and-swap claim. Two agents can NEVER both win the same card. NEVER pass agent:'rebecca' — her cards are permanently reserved.",
        inputSchema: {
            type: 'object',
            properties: {
                card_id: { type: 'string' },
                agent: {
                    type: 'string',
                    description: "Claiming agent identity, e.g. 'claude-code:<sessionLabel>' or a .kcpps config id like 'local-qwen3-14b'. NEVER 'rebecca'."
                },
                expected_status: {
                    type: 'string',
                    default: 'ready',
                    description: 'Only claim if the card is still in this status (default: the ready pool)'
                },
                move_to: {
                    type: 'string',
                    default: 'claimed',
                    enum: ['claimed', 'in_progress'],
                    description: 'Status to set on a winning claim'
                }
            },
            required: ['card_id', 'agent']
        }
    },
    {
        name: 'update_card',
        description: "Partial patch of a card — only provided keys change. assignee:'rebecca' auto-clears agent_claimable (DB trigger); assignee:'__clear__' unassigns.",
        inputSchema: {
            type: 'object',
            properties: {
                card_id: { type: 'string' },
                actor: { type: 'string', description: 'Who is editing (for the activity log)' },
                title: { type: 'string' },
                body: { type: 'string' },
                assignee: { type: 'string' },
                priority: { type: 'string', enum: PRIORITY_ENUM },
                labels: { type: 'array', items: { type: 'string' } },
                spec_ref: { type: 'string' },
                issue_ref: { type: 'string' },
                workflow_registry_id: {
                    type: 'string',
                    description: 'Link this card to a live workflow run (active_workflows.id)'
                },
                due_at: {
                    type: 'string',
                    description: "ISO 8601 timestamp. '__clear__' removes the deadline (same sentinel convention as assignee)."
                },
                metadata: { type: 'object' },
                review_policy: {
                    type: 'string',
                    enum: ['auto-done', 'review-required'],
                    description: "Escalate-only: 'auto-done' -> 'review-required' is always allowed; the reverse throws (agents may escalate a card, never downgrade it themselves)."
                }
            },
            required: ['card_id']
        }
    },
    {
        name: 'move_card',
        description: "Changes a card's status/lane. Writes activity {action:'moved', from_status, to_status}. A review-required card moving to 'review' is auto-reassigned to 'rebecca'.",
        inputSchema: {
            type: 'object',
            properties: {
                card_id: { type: 'string' },
                to_status: { type: 'string', enum: CARD_STATUS_ENUM },
                actor: { type: 'string' },
                position: { type: 'integer', description: 'Optional new order within the target lane' }
            },
            required: ['card_id', 'to_status']
        }
    },
    {
        name: 'comment_card',
        description: 'Appends to a card comment thread. Agents report progress/results here before moving a card to review.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: { type: 'string' },
                author: { type: 'string' },
                body: { type: 'string' }
            },
            required: ['card_id', 'author', 'body']
        }
    },

    // ---- 4 supporting tools ----
    {
        name: 'list_boards',
        description: 'Lists all boards with their total card counts.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'get_card',
        description: 'Gets a single card plus its comments, links, activity log, and live workflow_phase if linked — the detail-drawer call.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: { type: 'string' }
            },
            required: ['card_id']
        }
    },
    {
        name: 'add_card_link',
        description: 'Attaches a typed link (spec/github_issue/workflow_run/file/url/card) to a card, beyond the inline spec_ref/issue_ref fields.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: { type: 'string' },
                link_type: { type: 'string', enum: ['spec', 'github_issue', 'workflow_run', 'file', 'url', 'card'] },
                ref: { type: 'string' },
                label: { type: 'string' }
            },
            required: ['card_id', 'link_type', 'ref']
        }
    },
    {
        name: 'archive_card',
        description: "Archives a card (= move_card to 'archived').",
        inputSchema: {
            type: 'object',
            properties: {
                card_id: { type: 'string' },
                actor: { type: 'string' }
            },
            required: ['card_id']
        }
    }
];
