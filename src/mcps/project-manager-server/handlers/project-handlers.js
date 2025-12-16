// src/mcps/project-manager-server/handlers/project-handlers.js
// Project Management Handlers - CRUD operations for project folder references

import { projectToolsSchema } from '../schemas/project-tools-schema.js';

export class ProjectHandlers {
    constructor(db) {
        this.db = db;
    }

    // =============================================
    // PROJECT TOOL DEFINITIONS
    // =============================================
    getProjectTools() {
        return projectToolsSchema;
    }

    // =============================================
    // PROJECT MANAGEMENT HANDLERS
    // =============================================

    async handleCreateProject(args) {
        try {
            const {
                project_name,
                folder_location,
                description = null,
                author_id = null,
                series_id = null,
                book_id = null
            } = args;

            // Validate required fields
            if (!project_name || !folder_location) {
                throw new Error('project_name and folder_location are required');
            }

            // Check if folder location already exists
            const existingProject = await this.db.query(`
                SELECT id, project_name FROM projects
                WHERE folder_location = $1
            `, [folder_location]);

            if (existingProject.rows.length > 0) {
                throw new Error(
                    `A project already exists at this location: "${existingProject.rows[0].project_name}" (ID: ${existingProject.rows[0].id})`
                );
            }

            // Validate foreign keys if provided
            if (author_id) {
                const authorCheck = await this.db.query('SELECT id FROM authors WHERE id = $1', [author_id]);
                if (authorCheck.rows.length === 0) {
                    throw new Error(`Author with ID ${author_id} not found`);
                }
            }

            if (series_id) {
                const seriesCheck = await this.db.query('SELECT id FROM series WHERE id = $1', [series_id]);
                if (seriesCheck.rows.length === 0) {
                    throw new Error(`Series with ID ${series_id} not found`);
                }
            }

            if (book_id) {
                const bookCheck = await this.db.query('SELECT id FROM books WHERE id = $1', [book_id]);
                if (bookCheck.rows.length === 0) {
                    throw new Error(`Book with ID ${book_id} not found`);
                }
            }

            // Create the project
            const result = await this.db.query(`
                INSERT INTO projects (
                    project_name,
                    folder_location,
                    description,
                    author_id,
                    series_id,
                    book_id
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `, [project_name, folder_location, description, author_id, series_id, book_id]);

            const project = result.rows[0];

            // Get linked entity names for display
            const details = await this._getProjectDetails(project.id);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Created project successfully!\n\n` +
                              `ID: ${details.id}\n` +
                              `Name: ${details.project_name}\n` +
                              `Folder: ${details.folder_location}\n` +
                              `Description: ${details.description || 'None'}\n` +
                              `Author: ${details.author_name || 'Not linked'}\n` +
                              `Series: ${details.series_title || 'Not linked'}\n` +
                              `Book: ${details.book_title || 'Not linked'}\n` +
                              `Created: ${new Date(details.created_at).toLocaleString()}`
                    }
                ]
            };
        } catch (error) {
            if (error.code === '23505') { // Unique constraint violation
                throw new Error('A project already exists at this folder location');
            }
            throw new Error(`Failed to create project: ${error.message}`);
        }
    }

    async handleListProjects(args) {
        try {
            const {
                author_id = null,
                series_id = null,
                book_id = null,
                include_orphaned = true
            } = args;

            let query = `SELECT * FROM projects_with_details WHERE 1=1`;
            const params = [];
            let paramCount = 1;

            // Apply filters
            if (author_id !== null) {
                query += ` AND author_id = $${paramCount++}`;
                params.push(author_id);
            }

            if (series_id !== null) {
                query += ` AND series_id = $${paramCount++}`;
                params.push(series_id);
            }

            if (book_id !== null) {
                query += ` AND book_id = $${paramCount++}`;
                params.push(book_id);
            }

            query += ` ORDER BY created_at DESC`;

            const result = await this.db.query(query, params);
            const projects = result.rows;

            if (projects.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'No projects found matching the criteria.'
                        }
                    ]
                };
            }

            // Format output
            const projectList = projects.map(p => {
                const orphaned = (
                    (p.author_id && !p.author_name) ||
                    (p.series_id && !p.series_title) ||
                    (p.book_id && !p.book_title)
                ) ? ' [ORPHANED]' : '';

                return `ID: ${p.id}\n` +
                       `Name: ${p.project_name}${orphaned}\n` +
                       `Folder: ${p.folder_location}\n` +
                       `Author: ${p.author_name || 'Not linked'}\n` +
                       `Series: ${p.series_title || 'Not linked'}\n` +
                       `Book: ${p.book_title || 'Not linked'}\n` +
                       `Created: ${new Date(p.created_at).toLocaleString()}`;
            }).join('\n\n---\n\n');

            return {
                content: [
                    {
                        type: 'text',
                        text: `Found ${projects.length} project(s):\n\n${projectList}`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to list projects: ${error.message}`);
        }
    }

    async handleGetProject(args) {
        try {
            const { project_id } = args;

            if (!project_id) {
                throw new Error('project_id is required');
            }

            const details = await this._getProjectDetails(project_id);

            if (!details) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No project found with ID: ${project_id}`
                        }
                    ]
                };
            }

            const orphaned = (
                (details.author_id && !details.author_name) ||
                (details.series_id && !details.series_title) ||
                (details.book_id && !details.book_title)
            );

            return {
                content: [
                    {
                        type: 'text',
                        text: `Project Details:\n\n` +
                              `ID: ${details.id}\n` +
                              `Name: ${details.project_name}\n` +
                              `Folder: ${details.folder_location}\n` +
                              `Description: ${details.description || 'None'}\n` +
                              `Author: ${details.author_name || 'Not linked'}\n` +
                              `Series: ${details.series_title || 'Not linked'}\n` +
                              `Book: ${details.book_title || 'Not linked'}\n` +
                              `Status: ${orphaned ? 'ORPHANED (linked entity deleted)' : 'Active'}\n` +
                              `Created: ${new Date(details.created_at).toLocaleString()}\n` +
                              `Updated: ${new Date(details.updated_at).toLocaleString()}`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to get project: ${error.message}`);
        }
    }

    async handleUpdateProject(args) {
        try {
            const {
                project_id,
                project_name,
                folder_location,
                description,
                author_id,
                series_id,
                book_id
            } = args;

            if (!project_id) {
                throw new Error('project_id is required');
            }

            // Check if project exists
            const existingProject = await this.db.query('SELECT id FROM projects WHERE id = $1', [project_id]);
            if (existingProject.rows.length === 0) {
                throw new Error(`Project with ID ${project_id} not found`);
            }

            // Validate foreign keys if provided
            if (author_id !== undefined && author_id !== null) {
                const authorCheck = await this.db.query('SELECT id FROM authors WHERE id = $1', [author_id]);
                if (authorCheck.rows.length === 0) {
                    throw new Error(`Author with ID ${author_id} not found`);
                }
            }

            if (series_id !== undefined && series_id !== null) {
                const seriesCheck = await this.db.query('SELECT id FROM series WHERE id = $1', [series_id]);
                if (seriesCheck.rows.length === 0) {
                    throw new Error(`Series with ID ${series_id} not found`);
                }
            }

            if (book_id !== undefined && book_id !== null) {
                const bookCheck = await this.db.query('SELECT id FROM books WHERE id = $1', [book_id]);
                if (bookCheck.rows.length === 0) {
                    throw new Error(`Book with ID ${book_id} not found`);
                }
            }

            // Build dynamic update query
            const updates = [];
            const values = [];
            let paramCount = 1;

            if (project_name !== undefined) {
                updates.push(`project_name = $${paramCount++}`);
                values.push(project_name);
            }

            if (folder_location !== undefined) {
                updates.push(`folder_location = $${paramCount++}`);
                values.push(folder_location);
            }

            if (description !== undefined) {
                updates.push(`description = $${paramCount++}`);
                values.push(description);
            }

            if (author_id !== undefined) {
                updates.push(`author_id = $${paramCount++}`);
                values.push(author_id);
            }

            if (series_id !== undefined) {
                updates.push(`series_id = $${paramCount++}`);
                values.push(series_id);
            }

            if (book_id !== undefined) {
                updates.push(`book_id = $${paramCount++}`);
                values.push(book_id);
            }

            if (updates.length === 0) {
                throw new Error('No fields to update');
            }

            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(project_id);

            const query = `
                UPDATE projects
                SET ${updates.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            await this.db.query(query, values);

            // Get updated project details
            const details = await this._getProjectDetails(project_id);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Updated project successfully!\n\n` +
                              `ID: ${details.id}\n` +
                              `Name: ${details.project_name}\n` +
                              `Folder: ${details.folder_location}\n` +
                              `Description: ${details.description || 'None'}\n` +
                              `Author: ${details.author_name || 'Not linked'}\n` +
                              `Series: ${details.series_title || 'Not linked'}\n` +
                              `Book: ${details.book_title || 'Not linked'}\n` +
                              `Updated: ${new Date(details.updated_at).toLocaleString()}`
                    }
                ]
            };
        } catch (error) {
            if (error.code === '23505') {
                throw new Error('A project already exists at this folder location');
            }
            throw new Error(`Failed to update project: ${error.message}`);
        }
    }

    async handleDeleteProject(args) {
        try {
            const { project_id } = args;

            if (!project_id) {
                throw new Error('project_id is required');
            }

            // Get project details before deletion
            const details = await this._getProjectDetails(project_id);

            if (!details) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No project found with ID: ${project_id}`
                        }
                    ]
                };
            }

            // Delete the project reference
            await this.db.query('DELETE FROM projects WHERE id = $1', [project_id]);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Deleted project reference successfully!\n\n` +
                              `ID: ${details.id}\n` +
                              `Name: ${details.project_name}\n` +
                              `Folder: ${details.folder_location}\n\n` +
                              `NOTE: The actual folder on disk was NOT deleted, only the database reference.`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to delete project: ${error.message}`);
        }
    }

    async handleLinkToSeries(args) {
        try {
            const { project_id, series_id } = args;

            if (!project_id || !series_id) {
                throw new Error('project_id and series_id are required');
            }

            // Validate series exists
            const seriesCheck = await this.db.query('SELECT id, title FROM series WHERE id = $1', [series_id]);
            if (seriesCheck.rows.length === 0) {
                throw new Error(`Series with ID ${series_id} not found`);
            }

            // Update project
            const result = await this.db.query(`
                UPDATE projects
                SET series_id = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *
            `, [series_id, project_id]);

            if (result.rows.length === 0) {
                throw new Error(`Project with ID ${project_id} not found`);
            }

            const details = await this._getProjectDetails(project_id);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Linked project to series successfully!\n\n` +
                              `Project: ${details.project_name}\n` +
                              `Series: ${details.series_title}\n` +
                              `Updated: ${new Date(details.updated_at).toLocaleString()}`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to link project to series: ${error.message}`);
        }
    }

    async handleLinkToBook(args) {
        try {
            const { project_id, book_id } = args;

            if (!project_id || !book_id) {
                throw new Error('project_id and book_id are required');
            }

            // Validate book exists
            const bookCheck = await this.db.query('SELECT id, title FROM books WHERE id = $1', [book_id]);
            if (bookCheck.rows.length === 0) {
                throw new Error(`Book with ID ${book_id} not found`);
            }

            // Update project
            const result = await this.db.query(`
                UPDATE projects
                SET book_id = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *
            `, [book_id, project_id]);

            if (result.rows.length === 0) {
                throw new Error(`Project with ID ${project_id} not found`);
            }

            const details = await this._getProjectDetails(project_id);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Linked project to book successfully!\n\n` +
                              `Project: ${details.project_name}\n` +
                              `Book: ${details.book_title}\n` +
                              `Updated: ${new Date(details.updated_at).toLocaleString()}`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to link project to book: ${error.message}`);
        }
    }

    async handleUnlinkProject(args) {
        try {
            const {
                project_id,
                unlink_author = false,
                unlink_series = false,
                unlink_book = false
            } = args;

            if (!project_id) {
                throw new Error('project_id is required');
            }

            if (!unlink_author && !unlink_series && !unlink_book) {
                throw new Error('At least one unlink flag must be true');
            }

            const updates = [];
            if (unlink_author) updates.push('author_id = NULL');
            if (unlink_series) updates.push('series_id = NULL');
            if (unlink_book) updates.push('book_id = NULL');
            updates.push('updated_at = CURRENT_TIMESTAMP');

            const result = await this.db.query(`
                UPDATE projects
                SET ${updates.join(', ')}
                WHERE id = $1
                RETURNING *
            `, [project_id]);

            if (result.rows.length === 0) {
                throw new Error(`Project with ID ${project_id} not found`);
            }

            const details = await this._getProjectDetails(project_id);

            const unlinked = [];
            if (unlink_author) unlinked.push('Author');
            if (unlink_series) unlinked.push('Series');
            if (unlink_book) unlinked.push('Book');

            return {
                content: [
                    {
                        type: 'text',
                        text: `Unlinked project successfully!\n\n` +
                              `Project: ${details.project_name}\n` +
                              `Removed links: ${unlinked.join(', ')}\n` +
                              `Updated: ${new Date(details.updated_at).toLocaleString()}`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to unlink project: ${error.message}`);
        }
    }

    // =============================================
    // HELPER METHODS
    // =============================================

    async _getProjectDetails(project_id) {
        const result = await this.db.query(`
            SELECT * FROM projects_with_details
            WHERE id = $1
        `, [project_id]);

        return result.rows[0] || null;
    }
}
