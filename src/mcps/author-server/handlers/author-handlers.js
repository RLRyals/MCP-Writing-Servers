// src/mcps/author-server/handlers/author-handlers.js
// Core Author Management Handler - CRUD operations for authors
// Designed for AI Writing Teams to manage author information

import { authorToolsSchema } from '../schemas/author-tools-schema.js';

export class AuthorHandlers {
    constructor(db) {
        this.db = db;
    }

    // =============================================
    // AUTHOR TOOL DEFINITIONS
    // =============================================
    getAuthorTools() {
        return authorToolsSchema;
    }

    // =============================================
    // AUTHOR MANAGEMENT HANDLERS
    // =============================================

    async handleListAuthors(args) {
        try {
            const query = 'SELECT * FROM authors ORDER BY name';
            const result = await this.db.query(query);

            return {
                authors: result.rows.map(author => ({
                    id: author.id,
                    name: author.name,
                    email: author.email,
                    birth_year: author.birth_year,
                    bio: author.bio,
                    created_at: author.created_at,
                    updated_at: author.updated_at
                }))
            };
        } catch (error) {
            throw new Error(`Failed to list authors: ${error.message}`);
        }
    }

    async handleGetAuthor(args) {
        try {
            const { author_id } = args;
            const query = 'SELECT * FROM authors WHERE id = $1';
            const result = await this.db.query(query, [author_id]);

            if (result.rows.length === 0) {
                return {
                    error: 'not_found',
                    author_id,
                    message: `No author found with ID: ${author_id}`
                };
            }

            const author = result.rows[0];

            return {
                author: {
                    id: author.id,
                    name: author.name,
                    email: author.email,
                    birth_year: author.birth_year,
                    bio: author.bio,
                    created_at: author.created_at,
                    updated_at: author.updated_at
                }
            };
        } catch (error) {
            throw new Error(`Failed to get author: ${error.message}`);
        }
    }

    async handleCreateAuthor(args) {
        try {
            const { name, email, bio, birth_year } = args;
            const query = `
                INSERT INTO authors (name, email, bio, birth_year)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `;
            const result = await this.db.query(query, [
                name,
                email || null,
                bio || null,
                birth_year || null
            ]);
            const author = result.rows[0];

            return {
                content: [
                    {
                        type: 'text',
                        text: `Created author successfully!\n\n` +
                              `ID: ${author.id}\n` +
                              `Name: ${author.name}\n` +
                              `Birth Year: ${author.birth_year || 'Unknown'}\n` +
                              `Bio: ${author.bio || 'No biography provided'}`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to create author: ${error.message}`);
        }
    }

    async handleUpdateAuthor(args) {
        try {
            const { author_id, name, bio, birth_year } = args;

            // Build dynamic update query
            const updates = [];
            const values = [];
            let paramCount = 1;

            if (name !== undefined) {
                updates.push(`name = $${paramCount++}`);
                values.push(name);
            }
            if (bio !== undefined) {
                updates.push(`bio = $${paramCount++}`);
                values.push(bio);
            }
            if (birth_year !== undefined) {
                updates.push(`birth_year = $${paramCount++}`);
                values.push(birth_year);
            }

            if (updates.length === 0) {
                throw new Error('No fields to update');
            }

            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(author_id);

            const query = `
                UPDATE authors
                SET ${updates.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            const result = await this.db.query(query, values);

            if (result.rows.length === 0) {
                return {
                    error: 'not_found',
                    author_id,
                    message: `No author found with ID: ${author_id}`
                };
            }

            const author = result.rows[0];

            return {
                author: {
                    id: author.id,
                    name: author.name,
                    email: author.email,
                    birth_year: author.birth_year,
                    bio: author.bio,
                    created_at: author.created_at,
                    updated_at: author.updated_at
                }
            };
        } catch (error) {
            throw new Error(`Failed to update author: ${error.message}`);
        }
    }
}