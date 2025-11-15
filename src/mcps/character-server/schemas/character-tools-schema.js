// src/mcps/character-server/schemas/character-tools-schema.js
// Centralized tool schema definitions for the Character MCP Server
// Contains all tool definitions for character management, details, knowledge, and timeline tracking

// =============================================
// CHARACTER MANAGEMENT TOOL SCHEMAS
// =============================================
export const characterToolsSchema = [
    {
        name: 'list_characters',
        description: 'List characters in series',
        inputSchema: {
            type: 'object',
            properties: {
                series_id: { type: 'integer', description: 'Series ID' },
                character_type: {
                    type: ['string', 'null'],
                    enum: ['main', 'supporting', 'minor', 'antagonist', null],
                    description: 'Type filter (optional)'
                },
                status: {
                    type: ['string', 'null'],
                    enum: ['alive', 'dead', 'missing', 'unknown', null],
                    description: 'Status filter (optional)'
                }
            },
            required: ['series_id']
        }
    },
    {
        name: 'get_character',
        description: 'Get character details',
        inputSchema: {
            type: 'object',
            properties: {
                character_id: { type: 'integer', description: 'Character ID' }
            },
            required: ['character_id']
        }
    },
    {
        name: 'create_character',
        description: 'Create character',
        inputSchema: {
            type: 'object',
            properties: {
                series_id: { type: 'integer', description: 'Series ID' },
                name: { type: 'string', description: 'Primary name' },
                full_name: { type: ['string', 'null'], description: 'Full name (optional)' },
                aliases: {
                    type: ['array', 'null'],
                    items: { type: 'string' },
                    description: 'Alt names/nicknames (optional)'
                },
                character_type: {
                    type: ['string', 'null'],
                    enum: ['main', 'supporting', 'minor', 'antagonist', null],
                    description: 'Importance level (optional)'
                },
                first_appearance_book_id: { type: ['integer', 'null'], description: 'First appearance book ID (optional)' },
                status: {
                    type: ['string', 'null'],
                    enum: ['alive', 'dead', 'missing', 'unknown', null],
                    description: 'Status (optional)'
                }
            },
            required: ['series_id', 'name']
        }
    },
    {
        name: 'update_character',
        description: 'Update character',
        inputSchema: {
            type: 'object',
            properties: {
                character_id: { type: 'integer', description: 'Character ID' },
                name: { type: ['string', 'null'], description: 'Primary name (optional)' },
                full_name: { type: ['string', 'null'], description: 'Full name (optional)' },
                character_type: {
                    type: ['string', 'null'],
                    enum: ['main', 'supporting', 'minor', 'antagonist', null],
                    description: 'Importance level (optional)'
                },
                status: {
                    type: ['string', 'null'],
                    enum: ['alive', 'dead', 'missing', 'unknown', null],
                    description: 'Status (optional)'
                }
            },
            required: ['character_id']
        }
    }
];

// =============================================
// CHARACTER DETAILS TOOL SCHEMAS
// =============================================
export const characterDetailToolsSchema = [
    {
        name: 'add_character_detail',
        description: 'Add/update character detail',
        inputSchema: {
            type: 'object',
            properties: {
                character_id: { type: 'integer', description: 'Character ID' },
                category: {
                    type: 'string',
                    description: 'Category (physical/personality/background/skills)'
                },
                attribute: {
                    type: 'string',
                    description: 'Attribute (eye_color/height/temperament)'
                },
                value: { type: 'string', description: 'Value' },
                source_book_id: { type: ['integer', 'null'], description: 'Source book ID (optional)' },
                confidence_level: {
                    type: ['string', 'null'],
                    enum: ['established', 'mentioned', 'implied', null],
                    description: 'Confidence level (optional)'
                }
            },
            required: ['character_id', 'category', 'attribute', 'value']
        }
    },
    {
        name: 'get_character_details',
        description: 'Get character details',
        inputSchema: {
            type: 'object',
            properties: {
                character_id: { type: 'integer', description: 'Character ID' },
                category: {
                    type: ['string', 'null'],
                    description: 'Category filter (optional)'
                }
            },
            required: ['character_id']
        }
    },
    {
        name: 'update_character_detail',
        description: 'Update character detail',
        inputSchema: {
            type: 'object',
            properties: {
                character_id: { type: 'integer', description: 'Character ID' },
                category: {
                    type: 'string',
                    description: 'Category (physical/personality/background/skills)'
                },
                attribute: {
                    type: 'string',
                    description: 'Attribute to update'
                },
                value: { type: 'string', description: 'New value' },
                source_book_id: { type: ['integer', 'null'], description: 'Source book ID (optional)' },
                confidence_level: {
                    type: ['string', 'null'],
                    enum: ['established', 'mentioned', 'implied', null],
                    description: 'Confidence level (optional)'
                }
            },
            required: ['character_id', 'category', 'attribute', 'value']
        }
    },
    {
        name: 'delete_character_detail',
        description: 'Delete character detail',
        inputSchema: {
            type: 'object',
            properties: {
                character_id: { type: 'integer', description: 'Character ID' },
                category: {
                    type: 'string',
                    description: 'Category'
                },
                attribute: {
                    type: 'string',
                    description: 'Attribute to delete'
                }
            },
            required: ['character_id', 'category', 'attribute']
        }
    }
];

// =============================================
// CHARACTER KNOWLEDGE TOOL SCHEMAS
// =============================================
export const characterKnowledgeToolsSchema = [
    {
        name: 'add_character_knowledge',
        description: 'Track character knowledge',
        inputSchema: {
            type: 'object',
            properties: {
                character_id: { type: 'integer', description: 'Character ID' },
                knowledge_category: {
                    type: 'string',
                    description: 'Type (secret/skill/person/location/event)'
                },
                knowledge_item: {
                    type: 'string',
                    description: 'What they know'
                },
                knowledge_level: {
                    type: ['string', 'null'],
                    enum: ['knows', 'suspects', 'unaware', 'forgot', null],
                    description: 'Knowledge level (optional)'
                },
                learned_book_id: { type: ['integer', 'null'], description: 'Book learned in (optional)' },
                learned_context: {
                    type: ['string', 'null'],
                    description: 'How/when learned (optional)'
                }
            },
            required: ['character_id', 'knowledge_category', 'knowledge_item']
        }
    },
    {
        name: 'add_character_knowledge_with_chapter',
        description: 'Add knowledge w/ chapter ref',
        inputSchema: {
            type: 'object',
            properties: {
                character_id: { type: 'integer', description: 'Character ID' },
                knowledge_category: {
                    type: 'string',
                    description: 'Type (secret/skill/person/location/event)'
                },
                knowledge_item: {
                    type: 'string',
                    description: 'What they know'
                },
                knowledge_level: {
                    type: ['string', 'null'],
                    enum: ['knows', 'suspects', 'unaware', 'forgot', null],
                    description: 'Knowledge level (optional)',
                    default: 'knows'
                },
                learned_chapter_id: { type: 'integer', description: 'Chapter learned in' },
                learned_scene: { type: ['integer', 'null'], description: 'Scene number (optional)' },
                learned_context: {
                    type: ['string', 'null'],
                    description: 'How/when learned (optional)'
                }
            },
            required: ['character_id', 'knowledge_category', 'knowledge_item', 'learned_chapter_id']
        }
    },
    {
        name: 'check_character_knowledge',
        description: 'Check character knowledge',
        inputSchema: {
            type: 'object',
            properties: {
                character_id: { type: 'integer', description: 'Character ID' },
                knowledge_item: {
                    type: ['string', 'null'],
                    description: 'Item to check (partial match, optional)'
                },
                knowledge_category: {
                    type: ['string', 'null'],
                    description: 'Category filter (optional)'
                }
            },
            required: ['character_id']
        }
    },
    {
        name: 'get_characters_who_know',
        description: 'Find who knows about something',
        inputSchema: {
            type: 'object',
            properties: {
                series_id: { type: 'integer', description: 'Series ID' },
                knowledge_item: {
                    type: 'string',
                    description: 'Search term (partial match)'
                },
                knowledge_level: {
                    type: ['string', 'null'],
                    enum: ['knows', 'suspects', 'unaware', 'forgot', null],
                    description: 'Level filter (optional)'
                }
            },
            required: ['series_id', 'knowledge_item']
        }
    }
];

// =============================================
// CHARACTER TIMELINE & PRESENCE TOOL SCHEMAS
// =============================================
export const characterTimelineToolsSchema = [
    {
        name: 'track_character_presence',
        description: 'Track character in chapter',
        inputSchema: {
            type: 'object',
            properties: {
                character_id: { type: 'integer', description: 'Character ID' },
                chapter_id: { type: 'integer', description: 'Chapter ID' },
                scene_id: { type: ['integer', 'null'], description: 'Scene ID (optional)' },
                presence_type: {
                    type: 'string',
                    enum: ['present', 'mentioned', 'flashback', 'dream', 'phone_call'],
                    description: 'Presence type'
                },
                importance_level: {
                    type: ['string', 'null'],
                    enum: ['major', 'minor', 'cameo', 'background', null],
                    description: 'Importance (optional)'
                },
                physical_state: { type: ['string', 'null'], description: 'Physical state (optional)' },
                emotional_state: { type: ['string', 'null'], description: 'Emotional state (optional)' },
                enters_at_scene: { type: ['integer', 'null'], description: 'Entry scene # (optional)' },
                exits_at_scene: { type: ['integer', 'null'], description: 'Exit scene # (optional)' },
                learns_this_chapter: {
                    type: ['array', 'null'],
                    items: { type: 'string' },
                    description: 'Info learned (optional)'
                },
                reveals_this_chapter: {
                    type: ['array', 'null'],
                    items: { type: 'string' },
                    description: 'Secrets revealed (optional)'
                },
                character_growth: { type: ['string', 'null'], description: 'Character changes (optional)' }
            },
            required: ['character_id', 'chapter_id', 'presence_type']
        }
    },
    {
        name: 'get_character_timeline',
        description: 'Get character timeline',
        inputSchema: {
            type: 'object',
            properties: {
                character_id: { type: 'integer', description: 'Character ID' },
                book_id: { type: ['integer', 'null'], description: 'Book ID (optional)' },
                include_scenes: { type: ['boolean', 'null'], description: 'Include scenes (optional)', default: false },
                include_knowledge: { type: ['boolean', 'null'], description: 'Include knowledge (optional)', default: true },
                include_relationships: { type: ['boolean', 'null'], description: 'Include relationships (optional)', default: false }
            },
            required: ['character_id']
        }
    },
    {
        name: 'check_character_continuity',
        description: 'Check character continuity',
        inputSchema: {
            type: 'object',
            properties: {
                character_id: { type: 'integer', description: 'Character ID' },
                from_chapter_id: { type: 'integer', description: 'Start chapter' },
                to_chapter_id: { type: 'integer', description: 'End chapter' },
                check_type: {
                    type: ['string', 'null'],
                    enum: ['physical_state', 'emotional_state', 'knowledge', 'location', 'all', null],
                    description: 'Check type (optional)',
                    default: 'all'
                }
            },
            required: ['character_id', 'from_chapter_id', 'to_chapter_id']
        }
    },
    {
        name: 'get_characters_in_chapter',
        description: 'Get chapter characters',
        inputSchema: {
            type: 'object',
            properties: {
                chapter_id: { type: 'integer', description: 'Chapter ID' },
                scene_number: { type: ['integer', 'null'], description: 'Scene # filter (optional)' },
                presence_type: {
                    type: ['string', 'null'],
                    enum: ['present', 'mentioned', 'flashback', 'dream', 'phone_call', null],
                    description: 'Presence filter (optional)'
                },
                importance_level: {
                    type: ['string', 'null'],
                    enum: ['major', 'minor', 'cameo', 'background', null],
                    description: 'Importance filter (optional)'
                }
            },
            required: ['chapter_id']
        }
    }
];

// =============================================
// COMBINED SCHEMA EXPORT FOR EASY USAGE
// =============================================
export const allCharacterServerTools = [
    ...characterToolsSchema,
    ...characterDetailToolsSchema,
    ...characterKnowledgeToolsSchema,
    ...characterTimelineToolsSchema
];

// =============================================
// TOOL CATEGORIES FOR ORGANIZATIONAL USE
// =============================================
export const toolCategories = {
    character_management: characterToolsSchema,
    character_details: characterDetailToolsSchema,
    character_knowledge: characterKnowledgeToolsSchema,
    character_timeline: characterTimelineToolsSchema
};

// =============================================
// UTILITY FUNCTIONS FOR SCHEMA VALIDATION
// =============================================
export function getToolSchema(toolName) {
    return allCharacterServerTools.find(tool => tool.name === toolName);
}

export function getToolsByCategory(category) {
    return toolCategories[category] || [];
}

export function validateToolExists(toolName) {
    return allCharacterServerTools.some(tool => tool.name === toolName);
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
