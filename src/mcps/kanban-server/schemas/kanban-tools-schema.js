// src/mcps/kanban-server/schemas/kanban-tools-schema.js
// Tool schemas for the kanban-server MCP (S11 kanban board plugin, GH issue #58).
// Shape matches schemas/active-workflow-tools-schema.js:
// { name, description, inputSchema: { type:'object', properties, required } }.
// All tools return { ok:true, ... } or { ok:false, error } via BaseMCPServer's
// formatSuccess/formatError wrapping; every mutation also writes a
// kanban_activity row (see handlers/kanban-helpers.js logActivity).

const CARD_STATUS_ENUM = ['backlog', 'ready', 'claimed', 'in_progress', 'review', 'blocked', 'done', 'archived'];
const PRIORITY_ENUM = ['low', 'normal', 'high', 'urgent'];
const IDENTITY_KIND_ENUM = ['human', 'persona', 'agent'];

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
        description: 'Lists cards with filters: board, assignee, agent, status, label, priority, agent_claimable_only, include_archived, include_workflow_phase, due_filter, q. The workhorse read tool.',
        inputSchema: {
            type: 'object',
            properties: {
                board_key: { type: 'string' },
                board_id: { type: 'string' },
                q: {
                    type: 'string',
                    description: "Free-text search over card title, body, and comments (case-insensitive, ILIKE). Combines with AND with all other filters. When set and no board_key/board_id is given, searches across ALL boards (not just dev-backlog) and each returned card includes board_key so hits are attributable. Ranks title hits above body-only hits above comment-only hits."
                },
                assignee: {
                    type: 'string',
                    description: "Exact match against an identity id (see list_identities), e.g. 'rebecca' (her queue). Special: '__unassigned__' (assignee IS NULL)"
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
                    description: 'Only cards agents may claim (agent_claimable=TRUE AND assignee is not an active human identity — see list_identities)'
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
                assignee: {
                    type: 'string',
                    description: 'Must be a registered active identity id (see list_identities / upsert_identity) — unknown ids are rejected, no silent auto-create.'
                },
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
                },
                metadata: {
                    type: 'object',
                    description: "Arbitrary key/value bag, e.g. { pr_ref: 'owner/repo#N' } -- the merge-watcher's primary match key. If a non-done card already exists on this board with the same metadata.pr_ref, that existing card is returned instead of inserting a duplicate (retry-safe)."
                }
            },
            required: ['title']
        }
    },
    {
        name: 'claim_card',
        description: 'ATOMIC compare-and-swap claim. Two agents can NEVER both win the same card. NEVER pass an agent id that resolves to an active human identity (see list_identities) — human cards are permanently reserved.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: { type: 'string' },
                agent: {
                    type: 'string',
                    description: "Claiming agent identity, e.g. 'claude-code:<sessionLabel>', a .kcpps config id like 'local-qwen3-14b', or a persona id claiming on its own behalf. NEVER an id registered as kind='human'. First-seen ids are auto-registered as kind='agent'."
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
        description: "Partial patch of a card — only provided keys change. assignee must be a registered active identity (unknown ids rejected); one resolving to an active human identity auto-clears agent_claimable (DB trigger). assignee:'__clear__' unassigns.",
        inputSchema: {
            type: 'object',
            properties: {
                card_id: { type: 'string' },
                actor: { type: 'string', description: 'Who is editing (for the activity log)' },
                title: { type: 'string' },
                body: { type: 'string' },
                assignee: {
                    type: 'string',
                    description: "Must be a registered active identity id (see list_identities / upsert_identity), or '__clear__' to unassign."
                },
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
    },

    // ---- 3 identity tools (GH issue #62 — identities model; delete_identity
    // added by bead mws-1783883496146-1) ----
    {
        name: 'list_identities',
        description: "Lists registered kanban identities (human/persona/agent) — the set of ids create_card/update_card will accept as assignee. Defaults to active only. Always excludes the 'test:' id namespace (reserved for throwaway ids minted by tests).",
        inputSchema: {
            type: 'object',
            properties: {
                kind: { type: 'string', enum: IDENTITY_KIND_ENUM, description: 'Filter to a single kind' },
                include_inactive: { type: 'boolean', default: false }
            }
        }
    },
    {
        name: 'upsert_identity',
        description: "Registers a new identity or updates an existing one's display_name/kind/active. The ONLY sanctioned way to add an assignee value create_card/update_card will accept — there is no silent auto-create on write.",
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Matches the assignee values this identity represents, e.g. rebecca, mom, blake-merrick' },
                display_name: { type: 'string' },
                kind: {
                    type: 'string',
                    enum: IDENTITY_KIND_ENUM,
                    description: "human = never agent-claimable. persona = agent-claimable (an agent may act as this persona, including claiming as it). agent = agent-claimable registered worker identity."
                },
                active: { type: 'boolean', default: true }
            },
            required: ['id', 'kind']
        }
    },
    {
        name: 'delete_identity',
        description: "Hard-removes an identity row (e.g. a mis-registered or throwaway id). upsert_identity(active:false) is the softer 'hide from the dropdown' path (list_identities excludes inactive by default) — use delete_identity when the row should not exist at all. Not FK-enforced against kanban_cards.assignee: a card still pointing at a deleted id falls through the human-reserve fail-safe (treated as not agent-claimable) on its next write.",
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'The identity id to delete.' }
            },
            required: ['id']
        }
    }
];
