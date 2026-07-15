// src/mcps/story-analysis-server/handlers/storyform-handlers.js
// Read/CRUD handlers for the `storyforms` table (migration 046).
// Canon-DB flip 01 -- see
// FictIonLab-Downloads/specs/2026-07-10-canon-db-migration/01-storyform-storage.md
//
// One row per scope: series-master (book_id NULL) or per-book (book_id set).
// create_storyform / update_storyform are a CRUD pair (matching the rest of
// this codebase's create_*/update_* convention -- see book-handlers.js):
// create_storyform fails if a row already exists at that scope, and
// update_storyform fails if one does not.

import { storyformToolsSchema } from '../schemas/storyform-tools-schema.js';

function scopeLabel(bookId) {
    return bookId === null || bookId === undefined ? 'series master' : `book ${bookId}`;
}

export class StoryformHandlers {
    constructor(db) {
        this.db = db;
    }

    getStoryformTools() {
        return storyformToolsSchema;
    }

    async validateScope(args) {
        const errors = [];

        if (!args.series_id || typeof args.series_id !== 'number' || args.series_id < 1) {
            errors.push('series_id must be a positive number');
        }

        if (args.book_id !== undefined && args.book_id !== null) {
            if (typeof args.book_id !== 'number' || args.book_id < 1) {
                errors.push('book_id must be a positive number when provided');
            }
        }

        return errors;
    }

    async resolveScope(args) {
        const errors = await this.validateScope(args);
        if (errors.length > 0) {
            throw new Error(`Validation failed: ${errors.join(', ')}`);
        }

        const seriesCheck = await this.db.query('SELECT id, title FROM series WHERE id = $1', [args.series_id]);
        if (seriesCheck.rows.length === 0) {
            throw new Error(`Series with ID ${args.series_id} not found`);
        }

        const bookId = args.book_id ?? null;

        if (bookId !== null) {
            const bookCheck = await this.db.query('SELECT id, series_id, title FROM books WHERE id = $1', [bookId]);
            if (bookCheck.rows.length === 0) {
                throw new Error(`Book with ID ${bookId} not found`);
            }
            if (bookCheck.rows[0].series_id !== args.series_id) {
                throw new Error(`Book ${bookId} does not belong to series ${args.series_id}`);
            }
        }

        return { seriesTitle: seriesCheck.rows[0].title, bookId };
    }

    formatStoryform(row, seriesTitle) {
        let output = `# Storyform: ${seriesTitle} (${scopeLabel(row.book_id)})\n\n`;
        output += `**Storyform ID:** ${row.id}\n`;
        output += `**Series ID:** ${row.series_id}\n`;
        output += `**Book ID:** ${row.book_id ?? 'none (series master)'}\n\n`;

        output += `## Four-Throughline Casting\n`;
        output += `- **OS Domain:** ${row.os_domain || 'not set'}\n`;
        output += `- **MC Domain:** ${row.mc_domain || 'not set'}\n`;
        output += `- **IC Domain:** ${row.ic_domain || 'not set'}\n`;
        output += `- **RS Domain:** ${row.rs_domain || 'not set'}\n\n`;

        output += `## Core Dynamics\n`;
        output += `- **Story Driver:** ${row.story_driver || 'not set'}\n`;
        output += `- **Story Limit:** ${row.story_limit || 'not set'}\n`;
        output += `- **Story Outcome:** ${row.outcome_name || row.story_outcome_id || 'not set'}\n`;
        output += `- **Story Judgment:** ${row.judgment_name || row.story_judgment_id || 'not set'}\n`;
        output += `- **Story Concern:** ${row.concern_name || row.story_concern_id || 'not set'}\n`;
        output += `- **MC Resolve:** ${row.mc_resolve || 'not set'}\n`;
        output += `- **MC Growth:** ${row.mc_growth || 'not set'}\n`;
        output += `- **MC Approach:** ${row.mc_approach || 'not set'}\n`;
        output += `- **MC Problem-Solving Style:** ${row.mc_ps_style || 'not set'}\n\n`;

        if (row.rationale) {
            output += `## Rationale\n${row.rationale}\n\n`;
        }

        if (row.appreciations) {
            const appreciations = typeof row.appreciations === 'string'
                ? JSON.parse(row.appreciations)
                : row.appreciations;
            output += `## Appreciations\n\`\`\`json\n${JSON.stringify(appreciations, null, 2)}\n\`\`\`\n`;
        }

        return output;
    }

    async handleCreateStoryform(args) {
        try {
            const { seriesTitle, bookId } = await this.resolveScope(args);

            const existing = bookId === null
                ? await this.db.query('SELECT id FROM storyforms WHERE series_id = $1 AND book_id IS NULL', [args.series_id])
                : await this.db.query('SELECT id FROM storyforms WHERE series_id = $1 AND book_id = $2', [args.series_id, bookId]);

            if (existing.rows.length > 0) {
                throw new Error(`Storyform already exists for series ${args.series_id} (${scopeLabel(bookId)}) -- use update_storyform`);
            }

            const insertQuery = `
                INSERT INTO storyforms (
                    series_id, book_id, os_domain, mc_domain, ic_domain, rs_domain,
                    story_driver, story_limit, story_outcome_id, story_judgment_id, story_concern_id,
                    mc_resolve, mc_growth, mc_approach, mc_ps_style, rationale, appreciations
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                RETURNING *
            `;

            const result = await this.db.query(insertQuery, [
                args.series_id,
                bookId,
                args.os_domain || null,
                args.mc_domain || null,
                args.ic_domain || null,
                args.rs_domain || null,
                args.story_driver || null,
                args.story_limit || null,
                args.story_outcome_id || null,
                args.story_judgment_id || null,
                args.story_concern_id || null,
                args.mc_resolve || null,
                args.mc_growth || null,
                args.mc_approach || null,
                args.mc_ps_style || null,
                args.rationale || null,
                args.appreciations ? JSON.stringify(args.appreciations) : null
            ]);

            return {
                content: [{
                    type: 'text',
                    text: `Storyform created!\n\n${this.formatStoryform(result.rows[0], seriesTitle)}`
                }]
            };
        } catch (error) {
            throw new Error(`Failed to create storyform: ${error.message}`);
        }
    }

    async handleUpdateStoryform(args) {
        try {
            const { seriesTitle, bookId } = await this.resolveScope(args);

            const existing = bookId === null
                ? await this.db.query('SELECT id FROM storyforms WHERE series_id = $1 AND book_id IS NULL', [args.series_id])
                : await this.db.query('SELECT id FROM storyforms WHERE series_id = $1 AND book_id = $2', [args.series_id, bookId]);

            if (existing.rows.length === 0) {
                throw new Error(`No storyform exists for series ${args.series_id} (${scopeLabel(bookId)}) -- use create_storyform`);
            }

            const updateQuery = `
                UPDATE storyforms
                SET os_domain = COALESCE($1, os_domain),
                    mc_domain = COALESCE($2, mc_domain),
                    ic_domain = COALESCE($3, ic_domain),
                    rs_domain = COALESCE($4, rs_domain),
                    story_driver = COALESCE($5, story_driver),
                    story_limit = COALESCE($6, story_limit),
                    story_outcome_id = COALESCE($7, story_outcome_id),
                    story_judgment_id = COALESCE($8, story_judgment_id),
                    story_concern_id = COALESCE($9, story_concern_id),
                    mc_resolve = COALESCE($10, mc_resolve),
                    mc_growth = COALESCE($11, mc_growth),
                    mc_approach = COALESCE($12, mc_approach),
                    mc_ps_style = COALESCE($13, mc_ps_style),
                    rationale = COALESCE($14, rationale),
                    appreciations = COALESCE($15, appreciations),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $16
                RETURNING *
            `;

            const result = await this.db.query(updateQuery, [
                args.os_domain || null,
                args.mc_domain || null,
                args.ic_domain || null,
                args.rs_domain || null,
                args.story_driver || null,
                args.story_limit || null,
                args.story_outcome_id || null,
                args.story_judgment_id || null,
                args.story_concern_id || null,
                args.mc_resolve || null,
                args.mc_growth || null,
                args.mc_approach || null,
                args.mc_ps_style || null,
                args.rationale || null,
                args.appreciations ? JSON.stringify(args.appreciations) : null,
                existing.rows[0].id
            ]);

            return {
                content: [{
                    type: 'text',
                    text: `Storyform updated!\n\n${this.formatStoryform(result.rows[0], seriesTitle)}`
                }]
            };
        } catch (error) {
            throw new Error(`Failed to update storyform: ${error.message}`);
        }
    }

    async handleGetStoryform(args) {
        try {
            const { seriesTitle, bookId } = await this.resolveScope(args);

            const query = `
                SELECT sf.*, so.outcome_name, sj.judgment_name, sc.concern_name
                FROM storyforms sf
                LEFT JOIN story_outcomes so ON sf.story_outcome_id = so.id
                LEFT JOIN story_judgments sj ON sf.story_judgment_id = sj.id
                LEFT JOIN story_concerns sc ON sf.story_concern_id = sc.id
                WHERE sf.series_id = $1 AND ${bookId === null ? 'sf.book_id IS NULL' : 'sf.book_id = $2'}
            `;
            const params = bookId === null ? [args.series_id] : [args.series_id, bookId];
            const result = await this.db.query(query, params);

            if (result.rows.length === 0) {
                return {
                    content: [{
                        type: 'text',
                        text: `No storyform found for series ${args.series_id} (${scopeLabel(bookId)})`
                    }]
                };
            }

            return {
                content: [{
                    type: 'text',
                    text: this.formatStoryform(result.rows[0], seriesTitle)
                }]
            };
        } catch (error) {
            throw new Error(`Failed to get storyform: ${error.message}`);
        }
    }
}
