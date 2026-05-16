// src/mcps/outline-server/schemas/outline-tools-schema.js
// Centralized tool schema definitions for the Outline MCP Server.
// Grouped by handler so config-mcps aggregators can pick subsets.

// =============================================
// WORKS (hierarchy) TOOLS
// =============================================
export const worksToolsSchema = [
    {
        name: 'create_work',
        description: 'Create an outline node (series, book, act, beat, chapter, or scene). Parent_id is required for everything except a series root.',
        inputSchema: {
            type: 'object',
            properties: {
                parent_id: { type: 'integer', description: 'Parent work ID (omit ONLY for a new series root)' },
                work_type: { type: 'string', enum: ['series','book','act','beat','chapter','scene'], description: 'Zoom level' },
                sequence: { type: 'integer', description: 'Order among siblings (0-based or 1-based, your choice)' },
                title: { type: 'string', description: 'Title' },
                summary: { type: 'string', description: 'Short summary (shown in rollups)' },
                content: { type: 'string', description: 'Long-form outline text at this zoom level' },
                status: { type: 'string', description: 'planned, outlined, drafted, etc.' },
                legacy_series_id: { type: 'integer', description: 'Optional cross-link to series(id)' },
                legacy_book_id: { type: 'integer', description: 'Optional cross-link to books(id)' },
                legacy_chapter_id: { type: 'integer', description: 'Optional cross-link to chapters(id)' },
                legacy_scene_id: { type: 'integer', description: 'Optional cross-link to chapter_scenes(id)' }
            },
            required: ['work_type','sequence']
        }
    },
    {
        name: 'update_work',
        description: 'Update an outline node\'s title, summary, content, status, or sequence.',
        inputSchema: {
            type: 'object',
            properties: {
                work_id: { type: 'integer' },
                title: { type: 'string' },
                summary: { type: 'string' },
                content: { type: 'string' },
                status: { type: 'string' },
                sequence: { type: 'integer' }
            },
            required: ['work_id']
        }
    },
    {
        name: 'move_work',
        description: 'Reparent or reorder an outline node. Use for restructuring (e.g., move a scene from one chapter to another).',
        inputSchema: {
            type: 'object',
            properties: {
                work_id: { type: 'integer' },
                new_parent_id: { type: 'integer', description: 'Omit to keep current parent' },
                new_sequence: { type: 'integer' }
            },
            required: ['work_id']
        }
    },
    {
        name: 'get_outline',
        description: 'Return an outline node plus descendants to N levels deep, rendered as nested markdown. Depth 0 = this node only. The drafting/planning slice tool.',
        inputSchema: {
            type: 'object',
            properties: {
                work_id: { type: 'integer' },
                depth: { type: 'integer', description: 'How many levels of children to include (default 2)' },
                include_content: { type: 'boolean', description: 'Include long-form content field? (default true)' }
            },
            required: ['work_id']
        }
    },
    {
        name: 'get_ancestry',
        description: 'Return the parent chain (this node up to series root) with each ancestor\'s title and summary. Use to give the LLM zoom-out context when working on a scene.',
        inputSchema: {
            type: 'object',
            properties: {
                work_id: { type: 'integer' }
            },
            required: ['work_id']
        }
    }
];

// =============================================
// FACTS TOOLS
// =============================================
export const factsToolsSchema = [
    {
        name: 'create_fact',
        description: 'Register an atomic truth unit. Anything a character can know or not know.',
        inputSchema: {
            type: 'object',
            properties: {
                series_root_id: { type: 'integer', description: 'The series root outline_works.id' },
                statement: { type: 'string', description: 'Canonical wording of the fact' },
                fact_type: { type: 'string', description: 'world, case, conspiracy, character, etc. (free-form)' },
                canonical_source: { type: 'string', description: 'Why this is true / where it becomes true' },
                notes: { type: 'string' }
            },
            required: ['statement']
        }
    },
    {
        name: 'list_facts',
        description: 'List facts for a series, optionally filtered by type or search text.',
        inputSchema: {
            type: 'object',
            properties: {
                series_root_id: { type: 'integer' },
                fact_type: { type: 'string' },
                search: { type: 'string', description: 'ILIKE match against statement' }
            },
            required: []
        }
    }
];

// =============================================
// PROMISES TOOLS
// =============================================
export const promisesToolsSchema = [
    {
        name: 'create_promise',
        description: 'Register a promise (clue, foreshadow, setup, thread, romance_beat, red_herring) that needs to pay off.',
        inputSchema: {
            type: 'object',
            properties: {
                series_root_id: { type: 'integer' },
                promise_type: { type: 'string', description: 'clue, red_herring, foreshadow, thread, romance_beat, setup' },
                label: { type: 'string', description: 'Short identifying label' },
                description: { type: 'string' },
                planted_work_id: { type: 'integer', description: 'Where it is planted (often a scene work_id)' },
                carries_to_series: { type: 'boolean', description: 'Pays off in a future series?' },
                notes: { type: 'string' }
            },
            required: ['label']
        }
    },
    {
        name: 'update_promise',
        description: 'Update a promise: set payoff, change status, change carry flag.',
        inputSchema: {
            type: 'object',
            properties: {
                promise_id: { type: 'integer' },
                label: { type: 'string' },
                description: { type: 'string' },
                planted_work_id: { type: 'integer' },
                payoff_work_id: { type: 'integer' },
                status: { type: 'string', enum: ['open','progressing','paid','carried','abandoned'] },
                carries_to_series: { type: 'boolean' },
                notes: { type: 'string' }
            },
            required: ['promise_id']
        }
    },
    {
        name: 'list_open_promises',
        description: 'List promises that are open or progressing (i.e., have no payoff_work_id and have not been abandoned). Optionally scoped to a subtree.',
        inputSchema: {
            type: 'object',
            properties: {
                series_root_id: { type: 'integer', description: 'Filter to a series' },
                scope_work_id: { type: 'integer', description: 'Limit to promises planted within this subtree (e.g., act 2 only)' },
                promise_type: { type: 'string' }
            },
            required: []
        }
    }
];

// =============================================
// EVIDENCE TOOLS
// =============================================
export const evidenceToolsSchema = [
    {
        name: 'create_evidence',
        description: 'Register a finding the protagonist produces but cannot directly act on. Forces you to answer who_acts_on_it and what the action_gap costs.',
        inputSchema: {
            type: 'object',
            properties: {
                series_root_id: { type: 'integer' },
                produced_work_id: { type: 'integer', description: 'Scene/chapter where the finding is produced' },
                finding: { type: 'string', description: 'What was discovered' },
                who_acts_on_it: { type: 'string', description: 'Who can convert this into plot action' },
                action_gap_note: { type: 'string', description: 'What conversion costs (off-books, social capital, etc.)' },
                notes: { type: 'string' }
            },
            required: ['finding']
        }
    },
    {
        name: 'update_evidence',
        description: 'Update an evidence row: mark converted, set conversion location, change status.',
        inputSchema: {
            type: 'object',
            properties: {
                evidence_id: { type: 'integer' },
                finding: { type: 'string' },
                who_acts_on_it: { type: 'string' },
                action_gap_note: { type: 'string' },
                converted_work_id: { type: 'integer' },
                status: { type: 'string', enum: ['unconverted','converted','off_books','lost'] },
                notes: { type: 'string' }
            },
            required: ['evidence_id']
        }
    },
    {
        name: 'list_unconverted_evidence',
        description: 'List evidence that has not been converted into plot action. Optionally scoped to a subtree.',
        inputSchema: {
            type: 'object',
            properties: {
                series_root_id: { type: 'integer' },
                scope_work_id: { type: 'integer', description: 'Limit to evidence produced within this subtree' }
            },
            required: []
        }
    }
];

// =============================================
// SCENE EVENTS TOOLS
// =============================================
export const sceneEventsToolsSchema = [
    {
        name: 'record_scene_events',
        description: 'Record a batch of structural events for one outline node (usually a scene). Each event has an event_type and references the relevant entity by id (fact_id, promise_id, evidence_id, character_id). This is the source-of-truth tool for "what this scene does."',
        inputSchema: {
            type: 'object',
            properties: {
                work_id: { type: 'integer', description: 'The outline node these events belong to' },
                events: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            event_type: { type: 'string', enum: ['reveals_fact','plants_promise','pays_promise','character_choice','consequence','evidence_produced','evidence_converted'] },
                            fact_id: { type: 'integer' },
                            promise_id: { type: 'integer' },
                            evidence_id: { type: 'integer' },
                            character_id: { type: 'integer' },
                            ordering: { type: 'integer' },
                            note: { type: 'string' }
                        },
                        required: ['event_type']
                    }
                },
                replace: { type: 'boolean', description: 'If true, delete existing events for this work first (default false: append)' }
            },
            required: ['work_id','events']
        }
    },
    {
        name: 'what_does_character_know_at',
        description: 'Replay reveals_fact events in narrative order, filtered by character, up to and including the target work. Returns the projected knowledge state.',
        inputSchema: {
            type: 'object',
            properties: {
                character_id: { type: 'integer' },
                work_id: { type: 'integer', description: 'Replay up to and including this work' }
            },
            required: ['character_id','work_id']
        }
    }
];

// =============================================
// BRIEF TOOLS (the drafting-mode single-call)
// =============================================
export const briefToolsSchema = [
    {
        name: 'get_scene_brief',
        description: 'One-call drafting brief: scene\'s outline + ancestry summaries (chapter/act/book/series) + scene_events + open promises that could pay off here + unconverted evidence in scope + each present character\'s knowledge state. Use at the start of a drafting session to load context.',
        inputSchema: {
            type: 'object',
            properties: {
                work_id: { type: 'integer', description: 'The scene (or other node) to brief' },
                present_character_ids: { type: 'array', items: { type: 'integer' }, description: 'Characters whose knowledge state should be included (optional)' }
            },
            required: ['work_id']
        }
    }
];

// Convenience: full schema list for the standalone outline-server.
export const outlineToolsSchema = [
    ...worksToolsSchema,
    ...factsToolsSchema,
    ...promisesToolsSchema,
    ...evidenceToolsSchema,
    ...sceneEventsToolsSchema,
    ...briefToolsSchema
];
