// src/mcps/outline-server/handlers/works-handlers.js
// Outline hierarchy CRUD + zoom queries (get_outline, get_ancestry).
// outline_works is self-referential: series -> book -> act -> beat? -> chapter -> scene.

import { worksToolsSchema } from '../schemas/outline-tools-schema.js';

// Canonical tables each outline_works cross-link column points at.
const CROSS_LINK_TABLES = {
    series_id: 'series',
    book_id: 'books',
    chapter_id: 'chapters',
    scene_id: 'chapter_scenes'
};

export class WorksHandlers {
    constructor(db) {
        this.db = db;
    }

    getWorksTools() {
        return worksToolsSchema;
    }

    // Validates any provided cross-link ids (series_id/book_id/chapter_id/scene_id)
    // against their canonical tables. Ignores undefined/null fields (optional links).
    // Throws a clear error naming the field and id on the first miss.
    async validateCrossLinks(links) {
        for (const [field, table] of Object.entries(CROSS_LINK_TABLES)) {
            const value = links[field];
            if (value === undefined || value === null) continue;

            const check = await this.db.query(`SELECT id FROM ${table} WHERE id = $1`, [value]);
            if (check.rows.length === 0) {
                throw new Error(`${field} ${value} not found in ${table} -- cross-links must be real ids`);
            }
        }
    }

    async handleCreateWork(args) {
        try {
            const {
                parent_id, work_type, sequence, title, summary, content, status,
                pov_character_id,
                series_id, book_id, chapter_id, scene_id
            } = args;

            if (work_type !== 'series' && !parent_id) {
                throw new Error('parent_id is required for any work_type other than "series".');
            }
            if (work_type === 'series' && parent_id) {
                throw new Error('A "series" work cannot have a parent_id.');
            }

            await this.validateCrossLinks({ series_id, book_id, chapter_id, scene_id });

            const result = await this.db.query(
                `INSERT INTO outline_works
                    (parent_id, work_type, sequence, title, summary, content, status,
                     pov_character_id,
                     series_id, book_id, chapter_id, scene_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                 RETURNING *`,
                [parent_id || null, work_type, sequence ?? 0, title || null,
                 summary || null, content || null, status || 'planned',
                 pov_character_id || null,
                 series_id || null, book_id || null,
                 chapter_id || null, scene_id || null]
            );

            const w = result.rows[0];
            return {
                content: [{ type: 'text', text:
                    `Created outline work.\n\n` +
                    `ID: ${w.id}\n` +
                    `Type: ${w.work_type}\n` +
                    `Parent: ${w.parent_id ?? '(root)'}\n` +
                    `Sequence: ${w.sequence}\n` +
                    `Title: ${w.title ?? '(none)'}\n` +
                    `Status: ${w.status}`
                }]
            };
        } catch (err) {
            throw new Error(`create_work failed: ${err.message}`);
        }
    }

    async handleUpdateWork(args) {
        try {
            const {
                work_id, title, summary, content, status, sequence, pov_character_id,
                series_id, book_id, chapter_id, scene_id
            } = args;

            await this.validateCrossLinks({
                series_id: series_id || null,
                book_id: book_id || null,
                chapter_id: chapter_id || null,
                scene_id: scene_id || null
            });

            const updates = [];
            const values = [];
            let p = 1;
            if (title !== undefined)    { updates.push(`title = $${p++}`);    values.push(title); }
            if (summary !== undefined)  { updates.push(`summary = $${p++}`);  values.push(summary); }
            if (content !== undefined)  { updates.push(`content = $${p++}`);  values.push(content); }
            if (status !== undefined)   { updates.push(`status = $${p++}`);   values.push(status); }
            if (sequence !== undefined) { updates.push(`sequence = $${p++}`); values.push(sequence); }
            if (pov_character_id !== undefined) {
                updates.push(`pov_character_id = $${p++}`);
                values.push(pov_character_id || null);
            }
            if (series_id !== undefined)  { updates.push(`series_id = $${p++}`);  values.push(series_id || null); }
            if (book_id !== undefined)    { updates.push(`book_id = $${p++}`);    values.push(book_id || null); }
            if (chapter_id !== undefined) { updates.push(`chapter_id = $${p++}`); values.push(chapter_id || null); }
            if (scene_id !== undefined)   { updates.push(`scene_id = $${p++}`);   values.push(scene_id || null); }

            if (updates.length === 0) {
                return { content: [{ type: 'text', text: 'No fields to update.' }] };
            }
            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(work_id);

            const result = await this.db.query(
                `UPDATE outline_works SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
                values
            );
            if (result.rows.length === 0) {
                return { content: [{ type: 'text', text: `No work found with ID ${work_id}.` }] };
            }
            const w = result.rows[0];
            return { content: [{ type: 'text', text:
                `Updated work ${w.id} (${w.work_type}).\nTitle: ${w.title ?? '(none)'}\nStatus: ${w.status}`
            }] };
        } catch (err) {
            throw new Error(`update_work failed: ${err.message}`);
        }
    }

    async handleMoveWork(args) {
        try {
            const { work_id, new_parent_id, new_sequence } = args;

            const cur = await this.db.query(
                `SELECT id, work_type, parent_id, sequence FROM outline_works WHERE id = $1`,
                [work_id]
            );
            if (cur.rows.length === 0) throw new Error(`Work ${work_id} not found.`);
            const w = cur.rows[0];

            if (new_parent_id !== undefined && new_parent_id !== null) {
                if (w.work_type === 'series') {
                    throw new Error('Cannot reparent a series root.');
                }
                // Prevent moving into own descendant
                const desc = await this.db.query(
                    `WITH RECURSIVE d AS (
                         SELECT id FROM outline_works WHERE id = $1
                         UNION ALL
                         SELECT c.id FROM outline_works c JOIN d ON c.parent_id = d.id
                     ) SELECT 1 FROM d WHERE id = $2`,
                    [work_id, new_parent_id]
                );
                if (desc.rows.length > 0) {
                    throw new Error('Cannot move a work into its own descendant.');
                }
            }

            const updates = [];
            const values = [];
            let p = 1;
            if (new_parent_id !== undefined) { updates.push(`parent_id = $${p++}`); values.push(new_parent_id); }
            if (new_sequence !== undefined)  { updates.push(`sequence = $${p++}`);  values.push(new_sequence); }
            if (updates.length === 0) {
                return { content: [{ type: 'text', text: 'No changes specified.' }] };
            }
            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(work_id);

            await this.db.query(
                `UPDATE outline_works SET ${updates.join(', ')} WHERE id = $${p}`,
                values
            );
            return { content: [{ type: 'text', text: `Moved work ${work_id}.` }] };
        } catch (err) {
            throw new Error(`move_work failed: ${err.message}`);
        }
    }

    // Shared by get_outline and get_works_for_book: renders a node plus
    // descendants to N levels deep as nested markdown lines. Returns null if
    // work_id doesn't exist.
    async renderTreeLines(workId, depth, includeContent) {
        const result = await this.db.query(
            `WITH RECURSIVE tree AS (
                 SELECT id, parent_id, work_type, sequence, title, summary, content, status,
                        0 AS rel_depth,
                        ARRAY[sequence]::int[] AS path
                   FROM outline_works WHERE id = $1
                 UNION ALL
                 SELECT w.id, w.parent_id, w.work_type, w.sequence, w.title, w.summary, w.content, w.status,
                        t.rel_depth + 1,
                        t.path || w.sequence
                   FROM outline_works w
                   JOIN tree t ON w.parent_id = t.id
                  WHERE t.rel_depth < $2
             )
             SELECT * FROM tree ORDER BY path`,
            [workId, depth]
        );

        if (result.rows.length === 0) return null;

        const lines = [];
        for (const r of result.rows) {
            const indent = '  '.repeat(r.rel_depth);
            const heading = '#'.repeat(Math.min(r.rel_depth + 1, 6));
            lines.push(`${indent}${heading} [${r.work_type}#${r.id}] ${r.title ?? '(untitled)'} (seq ${r.sequence}, ${r.status})`);
            if (r.summary) lines.push(`${indent}_${r.summary}_`);
            if (includeContent && r.content) lines.push(`${indent}${r.content}`);
            lines.push('');
        }
        return lines;
    }

    async handleGetOutline(args) {
        try {
            const { work_id, depth = 2, include_content = true } = args;

            const lines = await this.renderTreeLines(work_id, depth, include_content);
            if (lines === null) {
                return { content: [{ type: 'text', text: `No work found with ID ${work_id}.` }] };
            }

            return { content: [{ type: 'text', text: lines.join('\n') }] };
        } catch (err) {
            throw new Error(`get_outline failed: ${err.message}`);
        }
    }

    async handleGetWorksForBook(args) {
        try {
            const { book_id, depth = 2, include_content = true } = args;

            if (!book_id || typeof book_id !== 'number' || book_id < 1) {
                throw new Error('book_id must be a positive number');
            }

            const bookCheck = await this.db.query('SELECT id, title FROM books WHERE id = $1', [book_id]);
            if (bookCheck.rows.length === 0) {
                throw new Error(`Book with ID ${book_id} not found`);
            }

            const roots = await this.db.query(
                `SELECT id, work_type, title FROM outline_works WHERE book_id = $1 ORDER BY work_type, sequence, id`,
                [book_id]
            );

            if (roots.rows.length === 0) {
                return { content: [{ type: 'text', text:
                    `No outline nodes are cross-linked to book_id ${book_id} ("${bookCheck.rows[0].title}") yet.`
                }] };
            }

            const sections = [];
            for (const root of roots.rows) {
                const lines = await this.renderTreeLines(root.id, depth, include_content);
                sections.push((lines || []).join('\n'));
            }

            return { content: [{ type: 'text', text:
                `${roots.rows.length} outline node(s) cross-linked to book_id ${book_id} ("${bookCheck.rows[0].title}"):\n\n` +
                sections.join('\n---\n\n')
            }] };
        } catch (err) {
            throw new Error(`get_works_for_book failed: ${err.message}`);
        }
    }

    async handleGetAncestry(args) {
        try {
            const { work_id } = args;

            const result = await this.db.query(
                `WITH RECURSIVE up AS (
                     SELECT id, parent_id, work_type, sequence, title, summary, 0 AS depth
                       FROM outline_works WHERE id = $1
                     UNION ALL
                     SELECT w.id, w.parent_id, w.work_type, w.sequence, w.title, w.summary, u.depth + 1
                       FROM outline_works w
                       JOIN up u ON w.id = u.parent_id
                 )
                 SELECT * FROM up ORDER BY depth DESC`,
                [work_id]
            );

            if (result.rows.length === 0) {
                return { content: [{ type: 'text', text: `No work found with ID ${work_id}.` }] };
            }

            const lines = result.rows.map(r =>
                `[${r.work_type}#${r.id}] ${r.title ?? '(untitled)'}` +
                (r.summary ? `\n    ${r.summary}` : '')
            );
            return { content: [{ type: 'text', text:
                `Ancestry (root -> self):\n\n${lines.join('\n\n')}`
            }] };
        } catch (err) {
            throw new Error(`get_ancestry failed: ${err.message}`);
        }
    }

    async handleDeleteWork(args) {
        try {
            const { work_id, confirm } = args;
            if (!confirm) {
                throw new Error('confirm must be true to hard-delete. To soft-delete, call update_work with status="abandoned".');
            }
            const result = await this.db.query(
                `DELETE FROM outline_works WHERE id = $1 RETURNING id, work_type, title`,
                [work_id]
            );
            if (result.rows.length === 0) {
                return { content: [{ type: 'text', text: `Work ${work_id} not found.` }] };
            }
            const w = result.rows[0];
            return { content: [{ type: 'text', text:
                `Deleted [${w.work_type}#${w.id}] ${w.title ?? '(untitled)'} and all descendants (cascade).`
            }] };
        } catch (err) {
            throw new Error(`delete_work failed: ${err.message}`);
        }
    }

    async handleListSeriesRoots(args) {
        try {
            const { include_abandoned = false } = args;
            const where = [`work_type = 'series'`];
            if (!include_abandoned) where.push(`status <> 'abandoned'`);
            const result = await this.db.query(
                `SELECT id, title, summary, status, created_at
                   FROM outline_works
                  WHERE ${where.join(' AND ')}
                  ORDER BY sequence, id`
            );
            if (result.rows.length === 0) {
                return { content: [{ type: 'text', text: 'No series roots found.' }] };
            }
            const lines = result.rows.map(r =>
                `[series#${r.id}] ${r.title ?? '(untitled)'} (${r.status})` +
                (r.summary ? `\n    ${r.summary}` : '')
            );
            return { content: [{ type: 'text', text:
                `${result.rows.length} series root(s):\n\n${lines.join('\n\n')}`
            }] };
        } catch (err) {
            throw new Error(`list_series_roots failed: ${err.message}`);
        }
    }

    async handleListWorks(args) {
        try {
            const { parent_id, ancestor_id, work_type, status, title_search, limit = 100 } = args;

            const where = [];
            const values = [];
            let p = 1;
            if (parent_id !== undefined) { where.push(`w.parent_id = $${p++}`); values.push(parent_id); }
            if (work_type)               { where.push(`w.work_type = $${p++}`); values.push(work_type); }
            if (status)                  { where.push(`w.status = $${p++}`);    values.push(status); }
            if (title_search)            { where.push(`w.title ILIKE $${p++}`); values.push(`%${title_search}%`); }

            let sql;
            if (ancestor_id !== undefined) {
                sql = `
                    WITH RECURSIVE subtree AS (
                        SELECT id FROM outline_works WHERE id = $${p++}
                        UNION ALL
                        SELECT c.id FROM outline_works c JOIN subtree s ON c.parent_id = s.id
                    )
                    SELECT w.id, w.parent_id, w.work_type, w.sequence, w.title, w.summary, w.status
                      FROM outline_works w
                     WHERE w.id IN (SELECT id FROM subtree)
                       AND w.id <> $${p - 1}
                       ${where.length ? 'AND ' + where.join(' AND ') : ''}
                     ORDER BY w.work_type, w.sequence, w.id
                     LIMIT $${p++}`;
                values.push(ancestor_id, limit);
            } else {
                sql = `
                    SELECT w.id, w.parent_id, w.work_type, w.sequence, w.title, w.summary, w.status
                      FROM outline_works w
                     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                     ORDER BY w.work_type, w.sequence, w.id
                     LIMIT $${p++}`;
                values.push(limit);
            }

            const result = await this.db.query(sql, values);
            if (result.rows.length === 0) {
                return { content: [{ type: 'text', text: 'No works match.' }] };
            }
            const lines = result.rows.map(r =>
                `[${r.work_type}#${r.id}] ${r.title ?? '(untitled)'} ` +
                `(parent ${r.parent_id ?? 'none'}, seq ${r.sequence}, ${r.status})` +
                (r.summary ? `\n    ${r.summary}` : '')
            );
            return { content: [{ type: 'text', text:
                `${result.rows.length} work(s):\n\n${lines.join('\n\n')}`
            }] };
        } catch (err) {
            throw new Error(`list_works failed: ${err.message}`);
        }
    }

    async handleSearchWorks(args) {
        try {
            const { query, ancestor_id, work_type, limit = 50 } = args;
            if (!query || !query.trim()) {
                throw new Error('query is required.');
            }

            const values = [];
            let p = 1;
            const pattern = `%${query}%`;
            values.push(pattern, pattern, pattern);
            const matchClause = `(w.title ILIKE $${p++} OR w.summary ILIKE $${p++} OR w.content ILIKE $${p++})`;

            const extra = [];
            if (work_type) { extra.push(`w.work_type = $${p++}`); values.push(work_type); }

            let sql;
            if (ancestor_id !== undefined) {
                sql = `
                    WITH RECURSIVE subtree AS (
                        SELECT id FROM outline_works WHERE id = $${p++}
                        UNION ALL
                        SELECT c.id FROM outline_works c JOIN subtree s ON c.parent_id = s.id
                    )
                    SELECT w.id, w.work_type, w.sequence, w.title, w.summary,
                           CASE
                             WHEN w.title ILIKE $1 THEN 'title'
                             WHEN w.summary ILIKE $2 THEN 'summary'
                             ELSE 'content'
                           END AS hit_field
                      FROM outline_works w
                     WHERE ${matchClause}
                       AND w.id IN (SELECT id FROM subtree)
                       ${extra.length ? 'AND ' + extra.join(' AND ') : ''}
                     ORDER BY w.work_type, w.sequence, w.id
                     LIMIT $${p++}`;
                values.push(ancestor_id, limit);
            } else {
                sql = `
                    SELECT w.id, w.work_type, w.sequence, w.title, w.summary,
                           CASE
                             WHEN w.title ILIKE $1 THEN 'title'
                             WHEN w.summary ILIKE $2 THEN 'summary'
                             ELSE 'content'
                           END AS hit_field
                      FROM outline_works w
                     WHERE ${matchClause}
                       ${extra.length ? 'AND ' + extra.join(' AND ') : ''}
                     ORDER BY w.work_type, w.sequence, w.id
                     LIMIT $${p++}`;
                values.push(limit);
            }

            const result = await this.db.query(sql, values);
            if (result.rows.length === 0) {
                return { content: [{ type: 'text', text: `No works match "${query}".` }] };
            }
            const lines = result.rows.map(r =>
                `[${r.work_type}#${r.id}] ${r.title ?? '(untitled)'} — hit in ${r.hit_field}` +
                (r.summary ? `\n    ${r.summary}` : '')
            );
            return { content: [{ type: 'text', text:
                `${result.rows.length} match(es) for "${query}":\n\n${lines.join('\n\n')}`
            }] };
        } catch (err) {
            throw new Error(`search_works failed: ${err.message}`);
        }
    }
}
