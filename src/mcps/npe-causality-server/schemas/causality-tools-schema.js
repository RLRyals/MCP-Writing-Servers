// src/mcps/npe-causality-server/schemas/causality-tools-schema.js
// Tool schema definitions for NPE Causality Chain Management
// Implements the Narrative Physics Engine causality tracking specification

// =============================================
// NPE CAUSALITY CHAIN TOOL SCHEMAS
// =============================================
export const causalityToolsSchema = [
    {
        name: 'create_causality_chain',
        description: 'Create a new NPE causality chain to track cause-effect relationships in narrative',
        inputSchema: {
            type: 'object',
            properties: {
                series_id: {
                    type: 'integer',
                    description: 'Series ID'
                },
                book_id: {
                    type: 'integer',
                    description: 'Book ID'
                },
                chain_name: {
                    type: 'string',
                    description: 'Descriptive name for this causality chain'
                },
                chain_description: {
                    type: 'string',
                    description: 'Detailed description of what this chain tracks (optional)'
                },
                initiating_decision_id: {
                    type: 'string',
                    description: 'ID of the character decision that started this chain (optional)'
                },
                initiating_character_id: {
                    type: 'integer',
                    description: 'Character who initiated this chain'
                },
                start_chapter_id: {
                    type: 'integer',
                    description: 'Chapter where chain begins (optional)'
                },
                start_scene_id: {
                    type: 'integer',
                    description: 'Scene where chain begins (optional)'
                },
                chain_type: {
                    type: 'string',
                    enum: ['linear', 'branching', 'convergent'],
                    description: 'Type of causality chain: linear (A→B→C), branching (A→B,C), or convergent (A,B→C)'
                }
            },
            required: ['series_id', 'book_id', 'chain_name', 'initiating_character_id', 'chain_type']
        }
    },
    {
        name: 'add_causal_link',
        description: 'Add a cause→effect link to an NPE causality chain',
        inputSchema: {
            type: 'object',
            properties: {
                chain_id: {
                    type: 'string',
                    description: 'ID of the causality chain to add this link to'
                },
                cause_description: {
                    type: 'string',
                    description: 'Description of the cause event'
                },
                cause_type: {
                    type: 'string',
                    enum: ['character_decision', 'character_action', 'consequence'],
                    description: 'Type of cause event'
                },
                cause_chapter_id: {
                    type: 'integer',
                    description: 'Chapter where cause occurs (optional)'
                },
                cause_scene_id: {
                    type: 'integer',
                    description: 'Scene where cause occurs (optional)'
                },
                effect_description: {
                    type: 'string',
                    description: 'Description of the effect/consequence'
                },
                effect_type: {
                    type: 'string',
                    enum: ['consequence', 'doorway_of_no_return', 'escalation'],
                    description: 'Type of effect'
                },
                effect_chapter_id: {
                    type: 'integer',
                    description: 'Chapter where effect occurs (optional)'
                },
                effect_scene_id: {
                    type: 'integer',
                    description: 'Scene where effect occurs (optional)'
                },
                link_type: {
                    type: 'string',
                    enum: ['direct', 'indirect', 'delayed'],
                    description: 'Type of causal link'
                },
                character_agency: {
                    type: 'boolean',
                    description: 'Does this link maintain character agency? (NPE compliance check)',
                    default: true
                },
                delay_chapters: {
                    type: 'integer',
                    description: 'Number of chapters between cause and effect',
                    default: 0
                },
                mediating_factors: {
                    type: 'string',
                    description: 'JSON array of intervening events (optional)'
                }
            },
            required: ['chain_id', 'cause_description', 'cause_type', 'effect_description', 'effect_type', 'link_type']
        }
    },
    {
        name: 'validate_causality_chain',
        description: 'Validate an NPE causality chain has no breaks and maintains character agency',
        inputSchema: {
            type: 'object',
            properties: {
                chain_id: {
                    type: 'string',
                    description: 'ID of the causality chain to validate'
                }
            },
            required: ['chain_id']
        }
    },
    {
        name: 'get_causality_chains_for_book',
        description: 'Get all NPE causality chains for a specific book',
        inputSchema: {
            type: 'object',
            properties: {
                book_id: {
                    type: 'integer',
                    description: 'Book ID to get chains for'
                },
                chain_type: {
                    type: 'string',
                    enum: ['linear', 'branching', 'convergent'],
                    description: 'Filter by chain type (optional)'
                },
                include_links: {
                    type: 'boolean',
                    description: 'Include all causal links in the response',
                    default: false
                }
            },
            required: ['book_id']
        }
    }
];

// =============================================
// COMBINED SCHEMA EXPORT
// =============================================
export const allCausalityTools = [
    ...causalityToolsSchema
];

// =============================================
// UTILITY FUNCTIONS
// =============================================
export function getToolSchema(toolName) {
    return allCausalityTools.find(tool => tool.name === toolName);
}

export function validateToolExists(toolName) {
    return allCausalityTools.some(tool => tool.name === toolName);
}
