// src/mcps/series-server/schemas/series-tools-schema.js
// Centralized tool schema definitions for the Series MCP Server

export const seriesToolsSchema = [
    {
        name: 'list_series',
        description: 'List all series',
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'create_series',
        description: 'Create series',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Title' },
                author_id: { type: 'integer', description: 'Author ID' },
                description: { type: ['string', 'null'], description: 'Description (optional)' },
                genre_ids: { type: ['array', 'null'], items: { type: 'integer' }, description: 'Genre IDs (optional)' },
                start_year: { type: ['integer', 'null'], description: 'Start year (optional)' },
                status: { type: ['string', 'null'], enum: ['ongoing', 'completed', 'hiatus', null], description: 'Status (optional)' }
            },
            required: ['title', 'author_id']
        }
    },
    {
        name: 'get_series',
        description: 'Get series details',
        inputSchema: {
            type: 'object',
            properties: {
                series_id: { type: 'integer', description: 'Series ID' }
            },
            required: ['series_id']
        }
    },
    {
        name: 'update_series',
        description: 'Update series',
        inputSchema: {
            type: 'object',
            properties: {
                series_id: { type: 'integer', description: 'Series ID' },
                title: { type: ['string', 'null'], description: 'Title (optional)' },
                description: { type: ['string', 'null'], description: 'Description (optional)' },
                genre_ids: { type: ['array', 'null'], items: { type: 'integer' }, description: 'Genre IDs (replaces all, optional)' },
                start_year: { type: ['integer', 'null'], description: 'Start year (optional)' },
                status: { type: ['string', 'null'], enum: ['ongoing', 'completed', 'hiatus', null], description: 'Status (optional)' }
            },
            required: ['series_id']
        }
    }
];
