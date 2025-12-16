// src/mcps/project-manager-server/schemas/project-tools-schema.js
// Centralized tool schema definitions for the Project Manager MCP Server

export const projectToolsSchema = [
    {
        name: 'create_project',
        description: 'Create a new project folder reference with optional links to author/series/book',
        inputSchema: {
            type: 'object',
            properties: {
                project_name: {
                    type: 'string',
                    description: 'User-friendly name for the project'
                },
                folder_location: {
                    type: 'string',
                    description: 'Absolute path to the project folder on the file system'
                },
                description: {
                    type: 'string',
                    description: 'Optional description of the project purpose/content'
                },
                author_id: {
                    type: 'integer',
                    description: 'Optional ID of the author this project is linked to'
                },
                series_id: {
                    type: 'integer',
                    description: 'Optional ID of the series this project is linked to'
                },
                book_id: {
                    type: 'integer',
                    description: 'Optional ID of the book this project is linked to'
                }
            },
            required: ['project_name', 'folder_location']
        }
    },
    {
        name: 'list_projects',
        description: 'List all project folder references, optionally filtered by author/series/book',
        inputSchema: {
            type: 'object',
            properties: {
                author_id: {
                    type: 'integer',
                    description: 'Optional: Filter projects by author ID'
                },
                series_id: {
                    type: 'integer',
                    description: 'Optional: Filter projects by series ID'
                },
                book_id: {
                    type: 'integer',
                    description: 'Optional: Filter projects by book ID'
                },
                include_orphaned: {
                    type: 'boolean',
                    description: 'Optional: Include projects with broken links (default: true)'
                }
            },
            required: []
        }
    },
    {
        name: 'get_project',
        description: 'Get detailed information about a specific project by ID',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'integer',
                    description: 'ID of the project to retrieve'
                }
            },
            required: ['project_id']
        }
    },
    {
        name: 'update_project',
        description: 'Update project details (name, folder location, description, or links)',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'integer',
                    description: 'ID of the project to update'
                },
                project_name: {
                    type: 'string',
                    description: 'Optional: New project name'
                },
                folder_location: {
                    type: 'string',
                    description: 'Optional: New absolute path to project folder'
                },
                description: {
                    type: 'string',
                    description: 'Optional: New project description'
                },
                author_id: {
                    type: 'integer',
                    description: 'Optional: New author ID to link to (null to unlink)'
                },
                series_id: {
                    type: 'integer',
                    description: 'Optional: New series ID to link to (null to unlink)'
                },
                book_id: {
                    type: 'integer',
                    description: 'Optional: New book ID to link to (null to unlink)'
                }
            },
            required: ['project_id']
        }
    },
    {
        name: 'delete_project',
        description: 'Delete a project folder reference (does NOT delete the actual folder on disk)',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'integer',
                    description: 'ID of the project reference to delete'
                }
            },
            required: ['project_id']
        }
    },
    {
        name: 'link_to_series',
        description: 'Link an existing project to a series',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'integer',
                    description: 'ID of the project to link'
                },
                series_id: {
                    type: 'integer',
                    description: 'ID of the series to link to'
                }
            },
            required: ['project_id', 'series_id']
        }
    },
    {
        name: 'link_to_book',
        description: 'Link an existing project to a book',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'integer',
                    description: 'ID of the project to link'
                },
                book_id: {
                    type: 'integer',
                    description: 'ID of the book to link to'
                }
            },
            required: ['project_id', 'book_id']
        }
    },
    {
        name: 'unlink_project',
        description: 'Remove author/series/book links from a project',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: {
                    type: 'integer',
                    description: 'ID of the project to unlink'
                },
                unlink_author: {
                    type: 'boolean',
                    description: 'Set to true to remove author link'
                },
                unlink_series: {
                    type: 'boolean',
                    description: 'Set to true to remove series link'
                },
                unlink_book: {
                    type: 'boolean',
                    description: 'Set to true to remove book link'
                }
            },
            required: ['project_id']
        }
    }
];
