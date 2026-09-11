// src/mcps/metadata-server/schemas/metadata-crud-schemas.js
// Generic metadata CRUD tool schemas, shared by any server that wires in
// MetadataCrudHandlers (metadata-server stdio transport, book-planning-server HTTP transport).

export const metadataCrudToolsSchema = [
    {
        name: 'list_metadata',
        description: 'List metadata entries, optionally filtered by series or book',
        inputSchema: {
            type: 'object',
            properties: {
                series_id: { type: 'integer', description: 'Filter by series ID (optional)' },
                book_id: { type: 'integer', description: 'Filter by book ID (optional)' }
            },
            required: []
        }
    },
    {
        name: 'get_metadata',
        description: 'Get detailed information about a specific metadata entry',
        inputSchema: {
            type: 'object',
            properties: {
                metadata_id: { type: 'integer', description: 'The ID of the metadata entry' }
            },
            required: ['metadata_id']
        }
    },
    {
        name: 'create_metadata',
        description: 'Create a new metadata entry',
        inputSchema: {
            type: 'object',
            properties: {
                series_id: { type: 'integer', description: 'Series ID (required if book_id not provided)' },
                book_id: { type: 'integer', description: 'Book ID (required if series_id not provided)' },
                metadata_key: { type: 'string', description: 'The metadata key/field name' },
                metadata_value: { type: 'string', description: 'The metadata value' },
                metadata_type: { type: 'string', enum: ['string', 'number', 'date', 'url', 'json'], description: 'Type of metadata' }
            },
            required: ['metadata_key', 'metadata_value', 'metadata_type']
        }
    },
    {
        name: 'update_metadata',
        description: 'Update an existing metadata entry',
        inputSchema: {
            type: 'object',
            properties: {
                metadata_id: { type: 'integer', description: 'The ID of the metadata entry to update' },
                metadata_key: { type: 'string', description: 'The metadata key/field name' },
                metadata_value: { type: 'string', description: 'The metadata value' },
                metadata_type: { type: 'string', enum: ['string', 'number', 'date', 'url', 'json'], description: 'Type of metadata' }
            },
            required: ['metadata_id']
        }
    },
    {
        name: 'delete_metadata',
        description: 'Delete a metadata entry',
        inputSchema: {
            type: 'object',
            properties: {
                metadata_id: { type: 'integer', description: 'The ID of the metadata entry to delete' }
            },
            required: ['metadata_id']
        }
    }
];
