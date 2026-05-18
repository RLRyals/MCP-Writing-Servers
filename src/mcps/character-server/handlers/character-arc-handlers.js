// src/mcps/character-server/handlers/character-arc-handlers.js
// Character Arc Management for Books
// Tracks character development arcs within specific books

export class CharacterArcHandlers {
    constructor(db) {
        this.db = db;
    }

    async handleCreateCharacterArc(args) {
        const { character_id, book_id, arc_name, arc_description, start_state, end_state } = args;

        const query = `
            INSERT INTO character_arcs (character_id, book_id, arc_name, arc_description, starting_state, ending_state)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (character_id, book_id)
            DO UPDATE SET
                arc_name = EXCLUDED.arc_name,
                arc_description = EXCLUDED.arc_description,
                starting_state = EXCLUDED.starting_state,
                ending_state = EXCLUDED.ending_state,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;

        await this.db.query(query, [
            character_id,
            book_id,
            arc_name || null,
            arc_description,
            start_state || null,
            end_state || null
        ]);

        return {
            content: [{
                type: 'text',
                text: `Created character arc for character ID ${character_id} in book ID ${book_id}\n\n` +
                      `Name: ${arc_name || '(unnamed)'}\n` +
                      `Description: ${arc_description}\n` +
                      `Start State: ${start_state || 'Not specified'}\n` +
                      `End State: ${end_state || 'Not specified'}`
            }]
        };
    }

    async handleUpdateCharacterArc(args) {
        try {
            const {
                id,
                character_id,
                book_id,
                arc_name,
                arc_description,
                start_state,
                end_state,
                key_events,
                growth_areas
            } = args;

            if (!id && !(character_id && book_id)) {
                throw new Error('Must provide either `id` or both `character_id` and `book_id` to identify the arc');
            }

            // Locate the row
            const lookup = id
                ? await this.db.query('SELECT * FROM character_arcs WHERE id = $1', [id])
                : await this.db.query(
                    'SELECT * FROM character_arcs WHERE character_id = $1 AND book_id = $2',
                    [character_id, book_id]
                );

            if (lookup.rows.length === 0) {
                return {
                    content: [{
                        type: 'text',
                        text: `No character arc found ${id ? `with id ${id}` : `for character ${character_id} in book ${book_id}`}.\n` +
                              `Use create_character_arc to add one.`
                    }]
                };
            }

            const existing = lookup.rows[0];

            const updates = [];
            const params = [];
            let p = 0;

            const setField = (column, value) => {
                if (value !== undefined) {
                    updates.push(`${column} = $${++p}`);
                    params.push(value);
                }
            };

            setField('arc_name', arc_name);
            setField('arc_description', arc_description);
            setField('starting_state', start_state);
            setField('ending_state', end_state);
            setField('key_events', key_events);
            setField('growth_areas', growth_areas);

            if (updates.length === 0) {
                return {
                    content: [{
                        type: 'text',
                        text: 'No fields provided to update.'
                    }]
                };
            }

            updates.push('updated_at = CURRENT_TIMESTAMP');
            params.push(existing.id);

            const result = await this.db.query(
                `UPDATE character_arcs SET ${updates.join(', ')} WHERE id = $${++p} RETURNING *`,
                params
            );
            const arc = result.rows[0];

            return {
                content: [{
                    type: 'text',
                    text: `Character arc updated successfully!\n\n` +
                          `ID: ${arc.id}\n` +
                          `Character ID: ${arc.character_id}\n` +
                          `Book ID: ${arc.book_id}\n` +
                          `Name: ${arc.arc_name || '(unnamed)'}\n` +
                          `Description: ${arc.arc_description || '(none)'}\n` +
                          `Start State: ${arc.starting_state || 'Not specified'}\n` +
                          `End State: ${arc.ending_state || 'Not specified'}\n` +
                          `Key Events: ${(arc.key_events && arc.key_events.length) ? arc.key_events.join('; ') : 'None'}\n` +
                          `Growth Areas: ${(arc.growth_areas && arc.growth_areas.length) ? arc.growth_areas.join('; ') : 'None'}`
                }]
            };
        } catch (error) {
            throw new Error(`Failed to update character arc: ${error.message}`);
        }
    }

    async handleDeleteCharacterArc(args) {
        try {
            const { id, character_id, book_id } = args;

            if (!id && !(character_id && book_id)) {
                throw new Error('Must provide either `id` or both `character_id` and `book_id` to identify the arc');
            }

            const lookup = id
                ? await this.db.query(
                    `SELECT ca.*, c.name AS character_name, b.title AS book_title
                     FROM character_arcs ca
                     JOIN characters c ON ca.character_id = c.id
                     JOIN books b ON ca.book_id = b.id
                     WHERE ca.id = $1`,
                    [id]
                )
                : await this.db.query(
                    `SELECT ca.*, c.name AS character_name, b.title AS book_title
                     FROM character_arcs ca
                     JOIN characters c ON ca.character_id = c.id
                     JOIN books b ON ca.book_id = b.id
                     WHERE ca.character_id = $1 AND ca.book_id = $2`,
                    [character_id, book_id]
                );

            if (lookup.rows.length === 0) {
                return {
                    content: [{
                        type: 'text',
                        text: `No character arc found to delete ${id ? `with id ${id}` : `for character ${character_id} in book ${book_id}`}.`
                    }]
                };
            }

            const arc = lookup.rows[0];

            await this.db.query('DELETE FROM character_arcs WHERE id = $1', [arc.id]);

            return {
                content: [{
                    type: 'text',
                    text: `Character arc deleted successfully!\n\n` +
                          `ID: ${arc.id}\n` +
                          `Character: ${arc.character_name} (ID ${arc.character_id})\n` +
                          `Book: ${arc.book_title} (ID ${arc.book_id})\n` +
                          `Name: ${arc.arc_name || '(unnamed)'}`
                }]
            };
        } catch (error) {
            throw new Error(`Failed to delete character arc: ${error.message}`);
        }
    }

    async handleListCharacterArcs(args = {}) {
        try {
            const { character_id, book_id, series_id } = args;

            const where = [];
            const params = [];
            let p = 0;

            if (character_id !== undefined) {
                where.push(`ca.character_id = $${++p}`);
                params.push(character_id);
            }
            if (book_id !== undefined) {
                where.push(`ca.book_id = $${++p}`);
                params.push(book_id);
            }
            if (series_id !== undefined) {
                where.push(`b.series_id = $${++p}`);
                params.push(series_id);
            }

            const query = `
                SELECT ca.*, c.name AS character_name, b.title AS book_title, b.book_number
                FROM character_arcs ca
                JOIN characters c ON ca.character_id = c.id
                JOIN books b ON ca.book_id = b.id
                ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                ORDER BY b.book_number NULLS LAST, b.id, c.name
            `;

            const result = await this.db.query(query, params);

            if (result.rows.length === 0) {
                return {
                    content: [{
                        type: 'text',
                        text: 'No character arcs found for the given filters.'
                    }]
                };
            }

            const lines = result.rows.map(arc =>
                `[${arc.id}] ${arc.character_name} — ${arc.book_title}` +
                (arc.book_number ? ` (Book ${arc.book_number})` : '') + `\n` +
                `   Name: ${arc.arc_name || '(unnamed)'}\n` +
                `   Description: ${arc.arc_description || '(none)'}\n` +
                `   Start → End: ${arc.starting_state || '—'} → ${arc.ending_state || '—'}`
            );

            return {
                content: [{
                    type: 'text',
                    text: `Found ${result.rows.length} character arc(s):\n\n${lines.join('\n\n')}`
                }]
            };
        } catch (error) {
            throw new Error(`Failed to list character arcs: ${error.message}`);
        }
    }

    getCharacterArcTools() {
        return [
            {
                name: 'create_character_arc',
                description: 'Create or update a character arc for this book. arc_name is a short label (<=255 chars); arc_description is the long-form arc.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        character_id: { type: 'integer', description: 'Character ID' },
                        book_id: { type: 'integer', description: 'Book ID' },
                        arc_name: { type: 'string', description: 'Short label for the arc (e.g. "From cynic to believer"). Max 255 chars.' },
                        arc_description: { type: 'string', description: 'Long-form description of the character arc' },
                        start_state: { type: 'string', description: 'Character state at book start' },
                        end_state: { type: 'string', description: 'Character state at book end' }
                    },
                    required: ['character_id', 'book_id', 'arc_description']
                }
            },
            {
                name: 'update_character_arc',
                description: 'Update an existing character arc. Identify the arc by `id` OR by `character_id`+`book_id`. Only provided fields are changed.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', description: 'Character arc row id (preferred identifier)' },
                        character_id: { type: 'integer', description: 'Character ID (use with book_id if id not provided)' },
                        book_id: { type: 'integer', description: 'Book ID (use with character_id if id not provided)' },
                        arc_name: { type: 'string', description: 'Short label for the arc. Max 255 chars.' },
                        arc_description: { type: 'string', description: 'Long-form description of the character arc' },
                        start_state: { type: 'string', description: 'Character state at book start' },
                        end_state: { type: 'string', description: 'Character state at book end' },
                        key_events: { type: 'array', items: { type: 'string' }, description: 'Key arc-relevant events in this book' },
                        growth_areas: { type: 'array', items: { type: 'string' }, description: 'Growth/change areas this arc covers' }
                    }
                }
            },
            {
                name: 'delete_character_arc',
                description: 'Delete a character arc. Identify by `id` OR by `character_id`+`book_id`.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', description: 'Character arc row id (preferred identifier)' },
                        character_id: { type: 'integer', description: 'Character ID (use with book_id if id not provided)' },
                        book_id: { type: 'integer', description: 'Book ID (use with character_id if id not provided)' }
                    }
                }
            },
            {
                name: 'list_character_arcs',
                description: 'List character arcs. All filters are optional; with no filters, returns every arc. Filter by character_id, book_id, and/or series_id.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        character_id: { type: 'integer', description: 'Filter to arcs for a specific character' },
                        book_id: { type: 'integer', description: 'Filter to arcs for a specific book' },
                        series_id: { type: 'integer', description: 'Filter to arcs whose book belongs to this series' }
                    }
                }
            }
        ];
    }
}
