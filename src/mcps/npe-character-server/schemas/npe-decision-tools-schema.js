// src/mcps/npe-character-server/schemas/npe-decision-tools-schema.js
// Tool schema definitions for the NPE Character Decision Tracking MCP Server
// Contains all tool definitions for character decision logging and validation

// =============================================
// NPE CHARACTER DECISION TOOL SCHEMAS
// =============================================
export const npeDecisionToolsSchema = [
    {
        name: 'log_character_decision',
        description: 'Log a character decision with NPE alignment checks',
        inputSchema: {
            type: 'object',
            properties: {
                character_id: {
                    type: 'integer',
                    description: 'Character ID'
                },
                book_id: {
                    type: 'integer',
                    description: 'Book ID'
                },
                scene_id: {
                    type: 'integer',
                    description: 'Scene ID where decision occurs'
                },
                decision_description: {
                    type: 'string',
                    description: 'Description of the decision'
                },
                character_version: {
                    type: 'string',
                    enum: ['V1', 'V2', 'V3', 'V4'],
                    description: 'Character version at time of decision'
                },
                alternatives: {
                    type: 'array',
                    items: { type: 'string' },
                    minItems: 2,
                    maxItems: 3,
                    description: 'Array of 2-3 plausible alternative choices'
                },
                aligned_with_goals: {
                    type: 'boolean',
                    description: 'Is decision aligned with character goals?'
                },
                aligned_with_fears: {
                    type: 'boolean',
                    description: 'Is decision aligned with character fears?'
                },
                aligned_with_wounds: {
                    type: 'boolean',
                    description: 'Is decision aligned with character wounds?'
                },
                operating_on_incomplete_info: {
                    type: 'boolean',
                    description: 'Is character operating on incomplete information?',
                    default: true
                },
                why_this_choice: {
                    type: 'string',
                    description: 'Explanation of why character chose this option?'
                },
                context_state: {
                    type: 'string',
                    enum: ['baseline', 'mild_stress', 'extreme_stress'],
                    description: 'Character context state at decision?'
                },
                immediate_consequence: {
                    type: 'string',
                    description: 'Immediate consequence of this decision?'
                }
            },
            required: [
                'character_id',
                'book_id',
                'scene_id',
                'decision_description',
                'character_version',
                'alternatives',
                'aligned_with_goals',
                'aligned_with_fears',
                'aligned_with_wounds',
                'operating_on_incomplete_info'
            ]
        }
    },
    {
        name: 'validate_character_decision',
        description: 'Validate that a decision aligns with character traits (NPE compliance)',
        inputSchema: {
            type: 'object',
            properties: {
                decision_id: {
                    type: 'string',
                    description: 'Decision ID to validate'
                }
            },
            required: ['decision_id']
        }
    },
    {
        name: 'get_character_decisions_in_scene',
        description: 'Get all character decisions in a specific scene',
        inputSchema: {
            type: 'object',
            properties: {
                scene_id: {
                    type: 'integer',
                    description: 'Scene ID'
                }
            },
            required: ['scene_id']
        }
    }
];

// =============================================
// COMBINED SCHEMA EXPORT FOR EASY USAGE
// =============================================
export const allNPEDecisionTools = [
    ...npeDecisionToolsSchema
];

// =============================================
// UTILITY FUNCTIONS FOR SCHEMA VALIDATION
// =============================================
export function getToolSchema(toolName) {
    return allNPEDecisionTools.find(tool => tool.name === toolName);
}

export function validateToolExists(toolName) {
    return allNPEDecisionTools.some(tool => tool.name === toolName);
}

export function getRequiredFields(toolName) {
    const tool = getToolSchema(toolName);
    return tool?.inputSchema?.required || [];
}

export function getOptionalFields(toolName) {
    const tool = getToolSchema(toolName);
    if (!tool?.inputSchema?.properties) return [];

    const required = tool.inputSchema.required || [];
    const allFields = Object.keys(tool.inputSchema.properties);
    return allFields.filter(field => !required.includes(field));
}
