// src/mcps/story-analysis-server/handlers/storyweave-handlers.js
// Handlers for the encode tracks (`storyweave_tracks`) and interleave beats
// (`storyweave_interleave`) tables (migration 060, mws-ci9). Both hang off a
// storyform row (series master or per-book), so every tool resolves scope the
// same way as storyform-handlers.js and requires the storyform to exist.

import { StoryformHandlers } from './storyform-handlers.js';
import { storyweaveToolsSchema } from '../schemas/storyform-tools-schema.js';

const THROUGHLINES = ['OS', 'MC', 'IC', 'RS'];

function text(t) {
    return { content: [{ type: 'text', text: t }] };
}

export class StoryweaveHandlers {
    constructor(db) {
        this.db = db;
        this.scope = new StoryformHandlers(db);
    }

    getStoryweaveTools() {
        return storyweaveToolsSchema;
    }

    async resolveStoryform(args) {
        const { bookId } = await this.scope.resolveScope(args);
        const result = bookId === null
            ? await this.db.query('SELECT id FROM storyforms WHERE series_id = $1 AND book_id IS NULL', [args.series_id])
            : await this.db.query('SELECT id FROM storyforms WHERE series_id = $1 AND book_id = $2', [args.series_id, bookId]);
        if (result.rows.length === 0) {
            throw new Error(`No storyform exists for series ${args.series_id} (${bookId === null ? 'series master' : `book ${bookId}`}) -- use create_storyform first`);
        }
        return result.rows[0].id;
    }

    validateThroughline(value, label) {
        if (!THROUGHLINES.includes(value)) {
            throw new Error(`${label}: throughline must be one of ${THROUGHLINES.join(', ')}`);
        }
    }

    validateInt(value, min, max, label) {
        if (!Number.isInteger(value) || value < min || value > max) {
            throw new Error(`${label} must be an integer between ${min} and ${max}`);
        }
    }

    async handleSetStoryweaveTracks(args) {
        try {
            if (!Array.isArray(args.tracks) || args.tracks.length === 0) {
                throw new Error('tracks must be a non-empty array');
            }
            args.tracks.forEach((t, i) => {
                this.validateThroughline(t.throughline, `tracks[${i}]`);
                this.validateInt(t.progression, 1, 16, `tracks[${i}].progression`);
                if (t.signpost !== undefined && t.signpost !== null) {
                    this.validateInt(t.signpost, 1, 4, `tracks[${i}].signpost`);
                }
            });

            const storyformId = await this.resolveStoryform(args);

            if (args.replace) {
                await this.db.query('DELETE FROM storyweave_tracks WHERE storyform_id = $1', [storyformId]);
            }

            for (const t of args.tracks) {
                await this.db.query(`
                    INSERT INTO storyweave_tracks (storyform_id, throughline, progression, signpost, appreciation, text, hidden_text, extra)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (storyform_id, throughline, progression) DO UPDATE SET
                        signpost = COALESCE(EXCLUDED.signpost, storyweave_tracks.signpost),
                        appreciation = COALESCE(EXCLUDED.appreciation, storyweave_tracks.appreciation),
                        text = COALESCE(EXCLUDED.text, storyweave_tracks.text),
                        hidden_text = COALESCE(EXCLUDED.hidden_text, storyweave_tracks.hidden_text),
                        extra = COALESCE(EXCLUDED.extra, storyweave_tracks.extra),
                        updated_at = CURRENT_TIMESTAMP
                `, [
                    storyformId, t.throughline, t.progression,
                    t.signpost ?? null, t.appreciation ?? null, t.text ?? null, t.hidden_text ?? null,
                    t.extra ? JSON.stringify(t.extra) : null
                ]);
            }

            return text(`Storyweave tracks saved: ${args.tracks.length} track(s) for storyform ${storyformId}${args.replace ? ' (replaced)' : ''}`);
        } catch (error) {
            throw new Error(`Failed to set storyweave tracks: ${error.message}`);
        }
    }

    async handleGetStoryweaveTracks(args) {
        try {
            if (args.throughline !== undefined) this.validateThroughline(args.throughline, 'filter');
            const storyformId = await this.resolveStoryform(args);

            const params = [storyformId];
            let where = 'storyform_id = $1';
            if (args.throughline) {
                params.push(args.throughline);
                where += ' AND throughline = $2';
            }
            const result = await this.db.query(
                `SELECT * FROM storyweave_tracks WHERE ${where}
                 ORDER BY CASE throughline WHEN 'OS' THEN 1 WHEN 'MC' THEN 2 WHEN 'IC' THEN 3 ELSE 4 END, progression`,
                params
            );

            const payload = { storyform_id: storyformId, count: result.rows.length, tracks: result.rows };
            return text(JSON.stringify(payload, null, 2));
        } catch (error) {
            throw new Error(`Failed to get storyweave tracks: ${error.message}`);
        }
    }

    async handleSetStoryweaveInterleave(args) {
        try {
            if (!Array.isArray(args.beats)) {
                throw new Error('beats must be an array');
            }
            const seen = new Set();
            const rows = args.beats.map((b, i) => {
                const seq = b.seq ?? i + 1;
                this.validateInt(seq, 1, Number.MAX_SAFE_INTEGER, `beats[${i}].seq`);
                if (seen.has(seq)) throw new Error(`beats[${i}]: duplicate seq ${seq}`);
                seen.add(seq);
                if (typeof b.beat !== 'string' || b.beat.trim() === '') {
                    throw new Error(`beats[${i}].beat must be a non-empty string`);
                }
                if (b.throughline !== undefined && b.throughline !== null) {
                    this.validateThroughline(b.throughline, `beats[${i}]`);
                }
                if (b.progression !== undefined && b.progression !== null) {
                    this.validateInt(b.progression, 1, 16, `beats[${i}].progression`);
                }
                return { ...b, seq };
            });

            const storyformId = await this.resolveStoryform(args);

            await this.db.query('DELETE FROM storyweave_interleave WHERE storyform_id = $1', [storyformId]);
            for (const b of rows) {
                await this.db.query(`
                    INSERT INTO storyweave_interleave (storyform_id, seq, throughline, progression, beat, extra)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [
                    storyformId, b.seq, b.throughline ?? null, b.progression ?? null, b.beat,
                    b.extra ? JSON.stringify(b.extra) : null
                ]);
            }

            return text(`Storyweave interleave saved: ${rows.length} beat(s) for storyform ${storyformId} (replaced)`);
        } catch (error) {
            throw new Error(`Failed to set storyweave interleave: ${error.message}`);
        }
    }

    async handleGetStoryweaveInterleave(args) {
        try {
            const storyformId = await this.resolveStoryform(args);
            const result = await this.db.query(
                'SELECT * FROM storyweave_interleave WHERE storyform_id = $1 ORDER BY seq',
                [storyformId]
            );
            const payload = { storyform_id: storyformId, count: result.rows.length, beats: result.rows };
            return text(JSON.stringify(payload, null, 2));
        } catch (error) {
            throw new Error(`Failed to get storyweave interleave: ${error.message}`);
        }
    }
}
