// src/mcps/character-server/handlers/character-detail-handlers.js
// Character Details Management Handler - Tracking physical traits, personality, background, etc.
// Designed for AI Writing Teams to manage detailed character information

import { characterDetailToolsSchema } from '../schemas/character-tools-schema.js';

export class CharacterDetailHandlers {
    constructor(db) {
        this.db = db;
    }

    // =============================================
    // CHARACTER DETAIL TOOL DEFINITIONS
    // =============================================
    getCharacterDetailTools() {
        return characterDetailToolsSchema;
    }

    formatSpan(startId, endId, startTitle, endTitle) {
        if (!startId && !endId) return 'always';
        const from = startId ? `from scene ${startId}${startTitle ? ` (${startTitle})` : ''}` : 'from the start';
        const until = endId ? `until scene ${endId}${endTitle ? ` (${endTitle})` : ''}` : 'onward';
        return `${from} ${until}`;
    }

    // =============================================
    // CHARACTER DETAIL MANAGEMENT HANDLERS
    // =============================================

    async handleAddCharacterDetail(args) {
        try {
            const { character_id, category, attribute, value, source_book_id, confidence_level = 'established',
                    start_scene_id = null, end_scene_id = null } = args;

            const result = await this.db.query(
                `INSERT INTO character_details (character_id, category, attribute, value, source_book_id, confidence_level, start_scene_id, end_scene_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (character_id, category, attribute, (COALESCE(start_scene_id, 0)))
                 DO UPDATE SET
                   value = EXCLUDED.value,
                   source_book_id = EXCLUDED.source_book_id,
                   confidence_level = EXCLUDED.confidence_level,
                   end_scene_id = EXCLUDED.end_scene_id,
                   updated_at = CURRENT_TIMESTAMP
                 RETURNING *`,
                [character_id, category, attribute, value, source_book_id || null, confidence_level, start_scene_id, end_scene_id]
            );

            return {
                content: [
                    {
                        type: 'text',
                        text: `Character detail added/updated successfully!\n\n` +
                              `Character ID: ${character_id}\n` +
                              `${category}/${attribute}: ${value}\n` +
                              `Confidence: ${confidence_level}\n` +
                              `Source Book ID: ${source_book_id || 'Not specified'}\n` +
                              `True: ${this.formatSpan(start_scene_id, end_scene_id)}`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to add character detail: ${error.message}`);
        }
    }

    async handleGetCharacterDetails(args) {
        try {
            const { character_id, category } = args;

            let query = `
                SELECT cd.*, c.name as character_name, b.title as source_book_title,
                       ss.title as start_scene_title, es.title as end_scene_title
                FROM character_details cd
                JOIN characters c ON cd.character_id = c.id
                LEFT JOIN books b ON cd.source_book_id = b.id
                LEFT JOIN outline_works ss ON cd.start_scene_id = ss.id
                LEFT JOIN outline_works es ON cd.end_scene_id = es.id
                WHERE cd.character_id = $1
            `;
            const params = [character_id];

            if (category) {
                query += ` AND cd.category = $2`;
                params.push(category);
            }

            query += ` ORDER BY cd.category, cd.attribute, cd.start_scene_id NULLS FIRST`;

            const result = await this.db.query(query, params);

            if (result.rows.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No details found for character ID: ${character_id}${category ? ` in category: ${category}` : ''}`
                        }
                    ]
                };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Character Details for ${result.rows[0].character_name}:\n\n` +
                              result.rows.map(detail =>
                                  `${detail.category}/${detail.attribute}: ${detail.value}\n` +
                                  `  Confidence: ${detail.confidence_level}\n` +
                                  `  Source: ${detail.source_book_title || 'Not specified'}\n` +
                                  `  True: ${this.formatSpan(detail.start_scene_id, detail.end_scene_id, detail.start_scene_title, detail.end_scene_title)}\n`
                              ).join('\n')
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to get character details: ${error.message}`);
        }
    }

    async handleUpdateCharacterDetail(args) {
        try {
            const { character_id, category, attribute, value, source_book_id, confidence_level,
                    start_scene_id, new_start_scene_id, end_scene_id } = args;

            // start_scene_id picks which span row of the attribute to update (omit = the open-start row)
            // Check if the detail exists first
            const checkResult = await this.db.query(
                `SELECT * FROM character_details
                 WHERE character_id = $1 AND category = $2 AND attribute = $3
                   AND COALESCE(start_scene_id, 0) = COALESCE($4::int, 0)`,
                [character_id, category, attribute, start_scene_id ?? null]
            );

            if (checkResult.rows.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No character detail found with:\n` +
                                  `Character ID: ${character_id}\n` +
                                  `Category: ${category}\n` +
                                  `Attribute: ${attribute}\n\n` +
                                  `Use add_character_detail to create a new detail.`
                        }
                    ]
                };
            }

            // Build dynamic update query
            const updateFields = [];
            const params = [character_id, category, attribute, start_scene_id ?? null];
            let paramCount = 4;

            updateFields.push(`value = $${++paramCount}`);
            params.push(value);

            if (source_book_id !== undefined) {
                updateFields.push(`source_book_id = $${++paramCount}`);
                params.push(source_book_id);
            }

            if (confidence_level !== undefined) {
                updateFields.push(`confidence_level = $${++paramCount}`);
                params.push(confidence_level);
            }

            if (new_start_scene_id !== undefined) {
                updateFields.push(`start_scene_id = $${++paramCount}`);
                params.push(new_start_scene_id);
            }

            if (end_scene_id !== undefined) {
                updateFields.push(`end_scene_id = $${++paramCount}`);
                params.push(end_scene_id);
            }

            updateFields.push('updated_at = CURRENT_TIMESTAMP');

            const query = `
                UPDATE character_details
                SET ${updateFields.join(', ')}
                WHERE character_id = $1 AND category = $2 AND attribute = $3
                  AND COALESCE(start_scene_id, 0) = COALESCE($4::int, 0)
                RETURNING *
            `;

            const result = await this.db.query(query, params);
            const detail = result.rows[0];

            return {
                content: [
                    {
                        type: 'text',
                        text: `Character detail updated successfully!\n\n` +
                              `Character ID: ${character_id}\n` +
                              `${category}/${attribute}: ${detail.value}\n` +
                              `Confidence: ${detail.confidence_level}\n` +
                              `Source Book ID: ${detail.source_book_id || 'Not specified'}\n` +
                              `True: ${this.formatSpan(detail.start_scene_id, detail.end_scene_id)}\n`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to update character detail: ${error.message}`);
        }
    }

    async handleDeleteCharacterDetail(args) {
        try {
            const { character_id, category, attribute, start_scene_id } = args;

            // Check if the detail exists and get info before deleting
            const checkResult = await this.db.query(
                `SELECT cd.*, c.name as character_name
                 FROM character_details cd
                 JOIN characters c ON cd.character_id = c.id
                 WHERE cd.character_id = $1 AND cd.category = $2 AND cd.attribute = $3
                   AND COALESCE(cd.start_scene_id, 0) = COALESCE($4::int, 0)`,
                [character_id, category, attribute, start_scene_id ?? null]
            );

            if (checkResult.rows.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No character detail found to delete with:\n` +
                                  `Character ID: ${character_id}\n` +
                                  `Category: ${category}\n` +
                                  `Attribute: ${attribute}`
                        }
                    ]
                };
            }

            const deletedDetail = checkResult.rows[0];

            // Delete the detail
            await this.db.query(
                `DELETE FROM character_details
                 WHERE character_id = $1 AND category = $2 AND attribute = $3
                   AND COALESCE(start_scene_id, 0) = COALESCE($4::int, 0)`,
                [character_id, category, attribute, start_scene_id ?? null]
            );

            return {
                content: [
                    {
                        type: 'text',
                        text: `Character detail deleted successfully!\n\n` +
                              `Character: ${deletedDetail.character_name}\n` +
                              `Deleted: ${category}/${attribute}\n` +
                              `Previous Value: ${deletedDetail.value}`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to delete character detail: ${error.message}`);
        }
    }
}
