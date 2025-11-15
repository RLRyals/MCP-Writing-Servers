// src/mcps/author-server/schemas/author-tools-schema.js
// Centralized tool schema definitions for the Author MCP Server
// Contains all tool definitions for author management

// =============================================
// AUTHOR MANAGEMENT TOOL SCHEMAS
// =============================================
export const authorToolsSchema = [
    {
        name: 'list_authors',
        description: 'List all authors',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'get_author',
        description: 'Get author details',
        inputSchema: {
            type: 'object',
            properties: {
                author_id: { type: 'integer', description: 'Author ID' }
            },
            required: ['author_id']
        }
    },
    {
        name: 'create_author',
        description: 'Create author. Only name is required.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Author name (required)' },
                email: { type: 'string', description: '(Optional) Email address', default: null },
                bio: { type: 'string', description: '(Optional) Author biography', default: null },
                birth_year: { type: 'integer', description: '(Optional) Birth year', default: null }
            },
            required: ['name'],
            additionalProperties: false
        }
    },
    {
        name: 'update_author',
        description: 'Update author. Only author_id is required.',
        inputSchema: {
            type: 'object',
            properties: {
                author_id: { type: 'integer', description: 'Author ID (required)' },
                name: { type: 'string', description: '(Optional) Author name', default: null },
                bio: { type: 'string', description: '(Optional) Author biography', default: null },
                birth_year: { type: 'integer', description: '(Optional) Birth year', default: null }
            },
            required: ['author_id'],
            additionalProperties: false
        }
    }
];

// =============================================
// COMBINED SCHEMA EXPORT FOR EASY USAGE
// =============================================
export const allAuthorServerTools = authorToolsSchema;

// =============================================
// UTILITY FUNCTIONS FOR SCHEMA VALIDATION
// =============================================
export function getToolSchema(toolName) {
    return allAuthorServerTools.find(tool => tool.name === toolName);
}

export function validateToolExists(toolName) {
    return allAuthorServerTools.some(tool => tool.name === toolName);
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