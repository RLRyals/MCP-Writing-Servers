// src/mcps/author-server/schemas/author-tools-schema.js
// Centralized tool schema definitions for the Author MCP Server
// Contains all tool definitions for author management
// Using JTD (JSON Type Definition) format for reduced token usage

// =============================================
// AUTHOR MANAGEMENT TOOL SCHEMAS
// =============================================
export const authorToolsSchema = [
    {
        name: 'list_authors',
        description: 'List all authors',
        inputSchema: {
            properties: {}
        }
    },
    {
        name: 'get_author',
        description: 'Get author details',
        inputSchema: {
            properties: {
                author_id: { type: 'int32', description: 'Author ID' }
            }
        }
    },
    {
        name: 'create_author',
        description: 'Create author',
        inputSchema: {
            properties: {
                name: { type: 'string', description: 'Author name' }
            },
            optionalProperties: {
                email: { type: 'string', description: 'Email' },
                bio: { type: 'string', description: 'Bio' },
                birth_year: { type: 'int32', description: 'Birth year' }
            }
        }
    },
    {
        name: 'update_author',
        description: 'Update author',
        inputSchema: {
            properties: {
                author_id: { type: 'int32', description: 'Author ID' }
            },
            optionalProperties: {
                name: { type: 'string', description: 'Author name' },
                bio: { type: 'string', description: 'Bio' },
                birth_year: { type: 'int32', description: 'Birth year' }
            }
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
    if (!tool?.inputSchema?.properties) return [];
    return Object.keys(tool.inputSchema.properties);
}

export function getOptionalFields(toolName) {
    const tool = getToolSchema(toolName);
    if (!tool?.inputSchema?.optionalProperties) return [];
    return Object.keys(tool.inputSchema.optionalProperties);
}
