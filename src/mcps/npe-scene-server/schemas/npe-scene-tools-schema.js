// src/mcps/npe-scene-server/schemas/npe-scene-tools-schema.js
// Centralized tool schema definitions for the NPE Scene Validation MCP Server
// Contains all tool definitions for NPE scene validation and compliance

// =============================================
// NPE SCENE VALIDATION TOOL SCHEMAS
// =============================================
export const npeSceneToolsSchema = [
    {
        name: 'validate_scene_architecture',
        description: 'Validate scene against NPE architecture rules (intention, obstacle, pivot, consequence)',
        inputSchema: {
            type: 'object',
            properties: {
                scene_id: {
                    type: 'integer',
                    description: 'Scene ID to validate'
                },
                has_intention: {
                    type: 'boolean',
                    description: 'Does scene have character intention?'
                },
                intention_description: {
                    type: 'string',
                    description: 'Description of character intention (optional)'
                },
                has_obstacle: {
                    type: 'boolean',
                    description: 'Does scene have an obstacle?'
                },
                obstacle_description: {
                    type: 'string',
                    description: 'Description of obstacle (optional)'
                },
                has_pivot: {
                    type: 'boolean',
                    description: 'Does scene have a pivot moment?'
                },
                pivot_type: {
                    type: 'string',
                    description: 'Type of pivot: power, information, or emotional_truth (optional)'
                },
                has_consequence: {
                    type: 'boolean',
                    description: 'Does scene have a consequence?'
                },
                consequence_description: {
                    type: 'string',
                    description: 'Description of consequence (optional)'
                }
            },
            required: ['scene_id', 'has_intention', 'has_obstacle', 'has_pivot', 'has_consequence']
        }
    },
    {
        name: 'validate_dialogue_physics',
        description: 'Check dialogue for echolalia (line mirroring) and subtext presence',
        inputSchema: {
            type: 'object',
            properties: {
                scene_id: {
                    type: 'integer',
                    description: 'Scene ID to validate'
                },
                dialogue_lines: {
                    type: 'array',
                    description: 'Array of dialogue line objects with character_id and line text',
                    items: {
                        type: 'object',
                        properties: {
                            character_id: { type: 'integer', description: 'Character ID' },
                            line: { type: 'string', description: 'Dialogue line text' }
                        },
                        required: ['character_id', 'line']
                    }
                }
            },
            required: ['scene_id', 'dialogue_lines']
        }
    },
    {
        name: 'get_scene_npe_compliance',
        description: 'Get complete NPE compliance report for a scene',
        inputSchema: {
            type: 'object',
            properties: {
                scene_id: {
                    type: 'integer',
                    description: 'Scene ID to get compliance report for'
                }
            },
            required: ['scene_id']
        }
    }
];

// =============================================
// COMBINED SCHEMA EXPORT FOR EASY USAGE
// =============================================
export const allNPESceneServerTools = npeSceneToolsSchema;

// =============================================
// UTILITY FUNCTIONS FOR SCHEMA VALIDATION
// =============================================
export function getToolSchema(toolName) {
    return allNPESceneServerTools.find(tool => tool.name === toolName);
}

export function validateToolExists(toolName) {
    return allNPESceneServerTools.some(tool => tool.name === toolName);
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
