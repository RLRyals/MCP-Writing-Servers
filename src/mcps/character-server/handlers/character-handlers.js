// src/mcps/character-server/handlers/character-handlers.js
// Core Character Management Handler - CRUD operations for characters within series
// Designed for AI Writing Teams to manage character information

import { characterToolsSchema } from '../schemas/character-tools-schema.js';
import { findDependents, referencedResponse } from '../../../shared/delete-guard.js';

// Rows that still point at a character; any hit blocks the delete.
const CHARACTER_DEPENDENTS = [
    { table: 'character_details', column: 'character_id', label: 'character details' },
    { table: 'character_knowledge', column: 'character_id', label: 'character knowledge' },
    { table: 'character_arcs', column: 'character_id', label: 'character arcs' },
    { table: 'character_chapter_presence', column: 'character_id', label: 'chapter presence records' },
    { table: 'character_throughlines', column: 'character_id', label: 'throughlines' },
    { table: 'event_participants', column: 'character_id', label: 'event participants' },
    { table: 'chapters', column: 'pov_character_id', label: 'chapters with this POV' },
    { table: 'chapter_scenes', column: 'pov_character_id', label: 'chapter scenes with this POV' },
    { table: 'event_chapter_mappings', column: 'pov_character_id', label: 'event chapter mappings (POV)' },
    { table: 'outline_scene_events', column: 'character_id', label: 'outline scene events' },
    { table: 'outline_works', column: 'pov_character_id', label: 'outline works with this POV' },
    { table: 'reveal_evidence', column: 'spotted_by_character_id', label: 'reveal evidence (spotted by)' },
    { table: 'tracker_changes', column: 'character_id', label: 'tracker changes' },
    { table: 'npe_causality_chains', column: 'initiating_character_id', label: 'NPE causality chains' },
    { table: 'npe_character_decisions', column: 'character_id', label: 'NPE character decisions' },
    { table: 'npe_information_economy', column: 'character_affected_id', label: 'NPE information economy rows' },
    { table: 'npe_relationship_tension', column: 'character_a_id', label: 'NPE relationship tension (character A)' },
    { table: 'npe_relationship_tension', column: 'character_b_id', label: 'NPE relationship tension (character B)' },
    { table: 'npe_scene_validation', column: 'pov_character_id', label: 'NPE scene validations (POV)' }
];

export class CharacterHandlers {
    constructor(db) {
        this.db = db;
    }

    // =============================================
    // CHARACTER TOOL DEFINITIONS
    // =============================================
    getCharacterTools() {
        return characterToolsSchema;
    }

    // =============================================
    // CHARACTER MANAGEMENT HANDLERS
    // =============================================

    async handleListCharacters(args) {
        try {
            const { series_id, character_type, status, search } = args;

            if (!series_id && !search) {
                throw new Error('Provide series_id or search (or both). Unscoped listing is not supported.');
            }

            const where = [];
            const params = [];
            let p = 1;

            if (series_id) {
                where.push(`c.series_id = $${p++}`);
                params.push(series_id);
            }
            if (character_type) {
                where.push(`c.character_type = $${p++}`);
                params.push(character_type);
            }
            if (status) {
                where.push(`c.status = $${p++}`);
                params.push(status);
            }
            if (search) {
                where.push(`(c.name ILIKE $${p} OR c.full_name ILIKE $${p} OR EXISTS (SELECT 1 FROM unnest(c.aliases) a WHERE a ILIKE $${p}))`);
                params.push(`%${search}%`);
                p++;
            }

            const query = `
                SELECT c.*, s.title as series_title
                FROM characters c
                JOIN series s ON c.series_id = s.id
                WHERE ${where.join(' AND ')}
                ORDER BY c.character_type, c.name
            `;

            const result = await this.db.query(query, params);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Found ${result.rows.length} characters:\n\n` +
                              result.rows.map(char =>
                                  `ID: ${char.id}\n` +
                                  `Name: ${char.name}${char.full_name ? ` (${char.full_name})` : ''}\n` +
                                  `Type: ${char.character_type}\n` +
                                  `Status: ${char.status}\n` +
                                  `Aliases: ${char.aliases && char.aliases.length > 0 ? char.aliases.join(', ') : 'None'}\n`
                              ).join('\n---\n\n')
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to list characters: ${error.message}`);
        }
    }

    async handleGetCharacter(args) {
        try {
            const { character_id } = args;

            const result = await this.db.query(
                `SELECT c.*, s.title as series_title
                 FROM characters c
                 JOIN series s ON c.series_id = s.id
                 WHERE c.id = $1`,
                [character_id]
            );

            if (result.rows.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No character found with ID: ${character_id}`
                        }
                    ]
                };
            }

            const character = result.rows[0];

            return {
                content: [
                    {
                        type: 'text',
                        text: `Character Information:\n\n` +
                              `ID: ${character.id}\n` +
                              `Name: ${character.name}${character.full_name ? ` (${character.full_name})` : ''}\n` +
                              `Series: ${character.series_title}\n` +
                              `Type: ${character.character_type}\n` +
                              `Status: ${character.status}\n` +
                              `Aliases: ${character.aliases && character.aliases.length > 0 ? character.aliases.join(', ') : 'None'}\n` 
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to get character: ${error.message}`);
        }
    }

    async handleCreateCharacter(args) {
        try {
            const { series_id, name, full_name, aliases, character_type = 'main',
                    first_appearance_book_id, status = 'alive' } = args;

            const result = await this.db.query(
                `INSERT INTO characters (series_id, name, full_name, aliases, character_type,
                                        first_appearance_book_id, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING *`,
                [series_id, name, full_name || null, aliases || [],
                 character_type, first_appearance_book_id || null, status]
            );

            const character = result.rows[0];

            return {
                content: [
                    {
                        type: 'text',
                        text: `Created character successfully!\n\n` +
                              `ID: ${character.id}\n` +
                              `Name: ${character.name}${character.full_name ? ` (${character.full_name})` : ''}\n` +
                              `Type: ${character.character_type}\n` +
                              `Status: ${character.status}\n` +
                              `Aliases: ${character.aliases && character.aliases.length > 0 ? character.aliases.join(', ') : 'None'}`
                    }
                ]
            };
        } catch (error) {
            if (error.code === '23503') { // Foreign key violation
                throw new Error('Invalid series_id: Series not found');
            }
            throw new Error(`Failed to create character: ${error.message}`);
        }
    }

    async handleUpdateCharacter(args) {
        try {
            const { character_id, ...updates } = args;

            // Build dynamic update query
            const updateFields = [];
            const params = [character_id];
            let paramCount = 1;

            for (const [key, value] of Object.entries(updates)) {
                if (value !== undefined) {
                    paramCount++;
                    updateFields.push(`${key} = $${paramCount}`);
                    params.push(value);
                }
            }

            if (updateFields.length === 0) {
                throw new Error('No fields to update');
            }

            updateFields.push('updated_at = CURRENT_TIMESTAMP');

            const query = `
                UPDATE characters
                SET ${updateFields.join(', ')}
                WHERE id = $1
                RETURNING *
            `;

            const result = await this.db.query(query, params);

            if (result.rows.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No character found with ID: ${character_id}`
                        }
                    ]
                };
            }

            const character = result.rows[0];

            return {
                content: [
                    {
                        type: 'text',
                        text: `Updated character successfully!\n\n` +
                              `ID: ${character.id}\n` +
                              `Name: ${character.name}${character.full_name ? ` (${character.full_name})` : ''}\n` +
                              `Type: ${character.character_type}\n` +
                              `Status: ${character.status}\n` 
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to update character: ${error.message}`);
        }
    }

    // =============================================
    // UTILITY METHODS FOR CROSS-COMPONENT USE
    // =============================================

    async getCharacterById(character_id) {
        try {
            const query = `
                SELECT c.*, s.title as series_title
                FROM characters c
                JOIN series s ON c.series_id = s.id
                WHERE c.id = $1
            `;
            const result = await this.db.query(query, [character_id]);
            return result.rows[0] || null;
        } catch (error) {
            throw new Error(`Failed to get character by ID: ${error.message}`);
        }
    }

    async handleDeleteCharacter(args) {
        try {
            const { character_id, confirm } = args;
            if (confirm !== true) {
                throw new Error('confirm must be true to delete.');
            }

            // Never cascade: refuse while anything still references this character.
            const dependents = await findDependents(this.db, CHARACTER_DEPENDENTS, character_id);
            if (dependents.length > 0) {
                return referencedResponse('Character', character_id, dependents);
            }

            const result = await this.db.query(
                'DELETE FROM characters WHERE id = $1 RETURNING *',
                [character_id]
            );
            if (result.rows.length === 0) {
                return {
                    error: 'not_found',
                    character_id,
                    message: `No character found with ID: ${character_id}`
                };
            }
            return { deleted: result.rows[0] };
        } catch (error) {
            throw new Error(`Failed to delete character: ${error.message}`);
        }
    }

}
