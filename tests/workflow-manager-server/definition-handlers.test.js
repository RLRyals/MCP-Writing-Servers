#!/usr/bin/env node
// tests/workflow-manager-server/definition-handlers.test.js
// Regression test for bead mws-1783883496504-9-129d637e / GH issue #57:
// the workflow_definitions upsert used `ON CONFLICT (workflow_id, version)`
// but the table's real constraints are PRIMARY KEY (workflow_id) plus a
// separate UNIQUE (workflow_id, version). Re-importing an existing
// workflow_id with a bumped version didn't match that conflict arbiter and
// instead violated the PK, raising a real Postgres error:
//   ERROR: duplicate key value violates unique constraint "workflow_definitions_pkey"
//
// Also covers bead mws-l3i: import-time snapshot-before-overwrite, the
// semver overwrite guard (refuse same-or-lower version without force), and
// restore_workflow_version round-tripping a snapshotted definition back into
// workflow_definitions.
//
// This is a hand-rolled fake DB (no real Postgres connection anywhere in
// this file) that models fictionlab.workflow_definitions (PK workflow_id,
// UNIQUE (workflow_id, version)) and fictionlab.workflow_versions (UNIQUE
// (workflow_id, version)), plus a transaction() that rolls back in-memory
// state on a thrown error the same way a real Postgres BEGIN/ROLLBACK would.
//
// Run: node tests/workflow-manager-server/definition-handlers.test.js

import { DefinitionHandlers } from '../../src/mcps/workflow-manager-server/handlers/definition-handlers.js';

let pass = 0;
let fail = 0;

function check(label, condition, detail) {
    if (condition) {
        console.log(`  PASS  ${label}`);
        pass++;
    } else {
        console.log(`  FAIL  ${label}${detail ? ' -- ' + detail : ''}`);
        fail++;
    }
}

function clone(value) {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Fake DB modeling:
//   fictionlab.workflow_definitions -- PRIMARY KEY (workflow_id), UNIQUE (workflow_id, version)
//   fictionlab.workflow_versions    -- UNIQUE (workflow_id, version)
//   fictionlab.workflow_imports     -- append-only log
// Parses just enough of each query's SQL text + params to apply the same
// constraint/arbiter semantics real Postgres would, including raising the
// same kind of duplicate-key error on an ON CONFLICT arbiter mismatch.
// ---------------------------------------------------------------------------
function makeFakeDb() {
    const rows = [];     // workflow_definitions
    const versions = []; // workflow_versions
    const imports = [];

    async function query(text, params = []) {
        const sql = text.trim();

        if (sql.startsWith('INSERT INTO fictionlab.workflow_definitions')) {
            const [workflow_id, name, version, description, graph_json, dependencies, tags, metadata, created_by] = params;

            const existingByPk = rows.find((r) => r.workflow_id === workflow_id);

            const arbiterMatch = sql.match(/ON CONFLICT \(([^)]+)\)/);
            const arbiterCols = arbiterMatch[1].split(',').map((c) => c.trim());

            if (existingByPk) {
                // A real Postgres PK collision only resolves via ON CONFLICT if
                // the arbiter is exactly the PK (workflow_id). An arbiter of
                // (workflow_id, version) does NOT match a plain workflow_id
                // collision -- Postgres falls through to the unhandled
                // duplicate-key error, same as the real bug.
                const arbiterIsPk = arbiterCols.length === 1 && arbiterCols[0] === 'workflow_id';
                if (!arbiterIsPk) {
                    const err = new Error(
                        `duplicate key value violates unique constraint "workflow_definitions_pkey"\n` +
                        `DETAIL: Key (workflow_id)=(${workflow_id}) already exists.`
                    );
                    err.code = '23505';
                    err.constraint = 'workflow_definitions_pkey';
                    throw err;
                }

                // Arbiter matches the PK -> DO UPDATE SET applies.
                existingByPk.name = name;
                existingByPk.version = version;
                existingByPk.description = description;
                existingByPk.graph_json = clone(graph_json);
                existingByPk.dependencies = clone(dependencies);
                existingByPk.tags = clone(tags);
                existingByPk.metadata = clone(metadata);
                existingByPk.updated_at = new Date().toISOString();

                return {
                    rows: [{
                        workflow_id: existingByPk.workflow_id,
                        version: existingByPk.version,
                        created_at: existingByPk.created_at
                    }]
                };
            }

            // No existing row for this workflow_id -> plain insert.
            const row = {
                workflow_id,
                name,
                version,
                description,
                graph_json: clone(graph_json),
                dependencies: clone(dependencies),
                tags: clone(tags),
                metadata: clone(metadata),
                created_by,
                is_system: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            rows.push(row);
            return { rows: [{ workflow_id: row.workflow_id, version: row.version, created_at: row.created_at }] };
        }

        if (sql.startsWith('SELECT') && sql.includes('FROM fictionlab.workflow_definitions')) {
            const [workflow_id] = params;
            const row = rows.find((r) => r.workflow_id === workflow_id);
            return { rows: row ? [clone(row)] : [] };
        }

        if (sql.startsWith('UPDATE fictionlab.workflow_definitions')) {
            const [workflow_id, name, version, description, graph_json, dependencies, tags, metadata] = params;
            const row = rows.find((r) => r.workflow_id === workflow_id);
            if (!row) return { rows: [], rowCount: 0 };

            row.name = name;
            row.version = version;
            row.description = description;
            row.graph_json = clone(graph_json);
            row.dependencies = clone(dependencies);
            row.tags = clone(tags);
            row.metadata = clone(metadata);
            row.updated_at = new Date().toISOString();

            return { rows: [clone(row)], rowCount: 1 };
        }

        if (sql.startsWith('INSERT INTO fictionlab.workflow_versions')) {
            const [workflow_id, version, definition_json, changelog, parent_version, created_by] = params;
            const existing = versions.find((v) => v.workflow_id === workflow_id && v.version === version);

            if (existing) {
                existing.definition_json = clone(definition_json);
                if (sql.includes('changelog = EXCLUDED.changelog')) {
                    existing.changelog = changelog;
                }
                return { rows: [{ id: existing.id, created_at: existing.created_at }] };
            }

            const record = {
                id: versions.length + 1,
                workflow_id,
                version,
                definition_json: clone(definition_json),
                changelog,
                parent_version,
                created_by,
                created_at: new Date().toISOString()
            };
            versions.push(record);
            return { rows: [{ id: record.id, created_at: record.created_at }] };
        }

        if (sql.startsWith('SELECT') && sql.includes('FROM fictionlab.workflow_versions')) {
            if (sql.includes('AND version = $2')) {
                const [workflow_id, version] = params;
                const found = versions.find((v) => v.workflow_id === workflow_id && v.version === version);
                return { rows: found ? [clone(found)] : [] };
            }
            const [workflow_id] = params;
            const found = versions
                .filter((v) => v.workflow_id === workflow_id)
                .sort((a, b) => b.created_at.localeCompare(a.created_at));
            return { rows: found.map((v) => clone(v)) };
        }

        if (sql.startsWith('INSERT INTO fictionlab.workflow_imports')) {
            const [workflow_id, source_type, source_path, imported_by, installation_log] = params;
            imports.push({ workflow_id, source_type, source_path, imported_by, installation_log });
            return { rows: [] };
        }

        throw new Error(`makeFakeDb: unhandled query: ${sql}`);
    }

    return {
        rows,
        versions,
        imports,
        query,
        // Real Postgres transaction semantics: on a thrown error, none of the
        // writes made against the client during the callback should stick.
        // Snapshot/restore the in-memory arrays around the callback so a
        // rejected import (guard failure) leaves zero trace, same as a real
        // ROLLBACK would.
        async transaction(callback) {
            const rowsSnapshot = clone(rows);
            const versionsSnapshot = clone(versions);
            const importsSnapshot = clone(imports);
            try {
                return await callback({ query });
            } catch (error) {
                rows.length = 0;
                rows.push(...rowsSnapshot);
                versions.length = 0;
                versions.push(...versionsSnapshot);
                imports.length = 0;
                imports.push(...importsSnapshot);
                throw error;
            }
        }
    };
}

async function main() {
    console.log('definition-handlers.test.js\n');

    // -----------------------------------------------------------------
    // 1. Importing a brand-new workflow_id inserts a row.
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb();
        const handlers = new DefinitionHandlers(db);

        const result = await handlers.handleImportWorkflowDefinition({
            id: 'series-cover-pipeline',
            name: 'Series Cover Pipeline',
            version: '1.0.0',
            description: 'v1',
            graph_json: { nodes: [], edges: [] },
            dependencies_json: { agents: [], skills: [], mcpServers: [] },
            tags: ['cover']
        });

        check('initial import succeeds', result.workflow_id === 'series-cover-pipeline' && result.version === '1.0.0');
        check('exactly one row exists after first import', db.rows.length === 1);
        check('the new version is snapshotted into workflow_versions', db.versions.length === 1 && db.versions[0].version === '1.0.0');
    }

    // -----------------------------------------------------------------
    // 2. Re-importing the SAME workflow_id with a BUMPED version succeeds
    //    (this is the acceptance criterion from the bead / issue #57 --
    //    fails with the old ON CONFLICT (workflow_id, version) SQL).
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb();
        const handlers = new DefinitionHandlers(db);

        await handlers.handleImportWorkflowDefinition({
            id: 'series-cover-pipeline',
            name: 'Series Cover Pipeline',
            version: '1.0.0',
            description: 'v1',
            graph_json: { nodes: [{ id: 'a' }], edges: [] },
            dependencies_json: { agents: [], skills: [], mcpServers: [] },
            tags: ['cover']
        });

        let bumpResult;
        let bumpError = null;
        try {
            bumpResult = await handlers.handleImportWorkflowDefinition({
                id: 'series-cover-pipeline',
                name: 'Series Cover Pipeline',
                version: '1.1.0',
                description: 'v1.1 adds trend research',
                graph_json: { nodes: [{ id: 'a' }, { id: 'b' }], edges: [] },
                dependencies_json: { agents: [], skills: [], mcpServers: [] },
                tags: ['cover', 'trend-research']
            });
        } catch (error) {
            bumpError = error;
        }

        check('version bump does not throw a duplicate-key error', bumpError === null, bumpError?.message);
        check('version bump returns the new version', bumpResult?.version === '1.1.0');
        check('still exactly one row for this workflow_id (PK, not a second row)', db.rows.length === 1, `rows=${db.rows.length}`);
        check('the single row now shows the bumped version', db.rows[0].version === '1.1.0');
        check('the single row now shows the updated graph_json', db.rows[0].graph_json.nodes.length === 2);
        check('the single row now shows the updated description', db.rows[0].description === 'v1.1 adds trend research');
        check('both the outgoing (1.0.0) and incoming (1.1.0) versions are snapshotted', db.versions.length === 2);
        check('the outgoing snapshot preserves the pre-bump graph_json', db.versions.find(v => v.version === '1.0.0').definition_json.graph_json.nodes.length === 1);
    }

    // -----------------------------------------------------------------
    // 3. Re-importing the SAME workflow_id + SAME version + SAME graph_json
    //    still updates in place without force (existing behavior preserved --
    //    only content-changing overwrites are guarded).
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb();
        const handlers = new DefinitionHandlers(db);

        await handlers.handleImportWorkflowDefinition({
            id: 'series-cover-pipeline',
            name: 'Series Cover Pipeline',
            version: '1.0.0',
            description: 'original description',
            graph_json: { nodes: [], edges: [] },
            dependencies_json: { agents: [], skills: [], mcpServers: [] },
            tags: ['cover']
        });

        const sameVersionResult = await handlers.handleImportWorkflowDefinition({
            id: 'series-cover-pipeline',
            name: 'Series Cover Pipeline',
            version: '1.0.0',
            description: 'corrected description, same version',
            graph_json: { nodes: [], edges: [] },
            dependencies_json: { agents: [], skills: [], mcpServers: [] },
            tags: ['cover']
        });

        check('same-version/same-graph_json re-import succeeds', sameVersionResult.version === '1.0.0');
        check('still exactly one row', db.rows.length === 1);
        check('description was updated in place', db.rows[0].description === 'corrected description, same version');
    }

    // -----------------------------------------------------------------
    // 4. OVERWRITE GUARD: a LOWER version than current is refused without force.
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb();
        const handlers = new DefinitionHandlers(db);

        await handlers.handleImportWorkflowDefinition({
            id: 'chapter-workflow',
            name: 'Chapter Workflow',
            version: '2.0.0',
            graph_json: { nodes: [{ id: 'good' }], edges: [] },
            dependencies_json: {}
        });

        let error = null;
        try {
            await handlers.handleImportWorkflowDefinition({
                id: 'chapter-workflow',
                name: 'Chapter Workflow',
                version: '1.0.0',
                graph_json: { nodes: [{ id: 'garbage' }], edges: [] },
                dependencies_json: {}
            });
        } catch (e) {
            error = e;
        }

        check('lower-version import without force is refused', error !== null);
        check('the good definition is untouched after the refused import', db.rows[0].graph_json.nodes[0].id === 'good');
        check('no snapshot was written for the refused attempt (rolled back)', db.versions.length === 1);
    }

    // -----------------------------------------------------------------
    // 5. OVERWRITE GUARD: SAME version with DIFFERENT graph_json is refused
    //    without force -- this is the exact "garbage over good" incident
    //    shape (a bad script re-shipped under the same version number).
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb();
        const handlers = new DefinitionHandlers(db);

        await handlers.handleImportWorkflowDefinition({
            id: 'chapter-workflow',
            name: 'Chapter Workflow',
            version: '2.0.0',
            graph_json: { nodes: [{ id: 'good' }], edges: [] },
            dependencies_json: {}
        });

        let error = null;
        try {
            await handlers.handleImportWorkflowDefinition({
                id: 'chapter-workflow',
                name: 'Chapter Workflow',
                version: '2.0.0',
                graph_json: { nodes: [{ id: 'garbage' }], edges: [] },
                dependencies_json: {}
            });
        } catch (e) {
            error = e;
        }

        check('same-version-different-content import without force is refused', error !== null, error?.message);
        check('the good definition is untouched after the refused import', db.rows[0].graph_json.nodes[0].id === 'good');
    }

    // -----------------------------------------------------------------
    // 6. force=true without a changelog is ALSO refused (changelog is
    //    required, not merely encouraged, when overriding the guard).
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb();
        const handlers = new DefinitionHandlers(db);

        await handlers.handleImportWorkflowDefinition({
            id: 'chapter-workflow',
            name: 'Chapter Workflow',
            version: '2.0.0',
            graph_json: { nodes: [{ id: 'good' }], edges: [] },
            dependencies_json: {}
        });

        let error = null;
        try {
            await handlers.handleImportWorkflowDefinition({
                id: 'chapter-workflow',
                name: 'Chapter Workflow',
                version: '1.0.0',
                graph_json: { nodes: [{ id: 'garbage' }], edges: [] },
                dependencies_json: {},
                force: true
            });
        } catch (e) {
            error = e;
        }

        check('force=true without a changelog is still refused', error !== null, error?.message);
    }

    // -----------------------------------------------------------------
    // 7. force=true WITH a changelog overrides the guard, and the outgoing
    //    (good) definition is still snapshotted -- recoverable, not lost.
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb();
        const handlers = new DefinitionHandlers(db);

        await handlers.handleImportWorkflowDefinition({
            id: 'chapter-workflow',
            name: 'Chapter Workflow',
            version: '2.0.0',
            graph_json: { nodes: [{ id: 'good' }], edges: [] },
            dependencies_json: {}
        });

        const forced = await handlers.handleImportWorkflowDefinition({
            id: 'chapter-workflow',
            name: 'Chapter Workflow',
            version: '1.0.0',
            graph_json: { nodes: [{ id: 'garbage' }], edges: [] },
            dependencies_json: {},
            force: true,
            changelog: 'intentional rollback to a known-good older revision'
        });

        check('forced import with changelog succeeds', forced.version === '1.0.0');
        check('the live definition now reflects the forced import', db.rows[0].graph_json.nodes[0].id === 'garbage');
        const outgoingSnapshot = db.versions.find(v => v.version === '2.0.0');
        check('the overwritten (good) definition was snapshotted before the forced overwrite', outgoingSnapshot?.definition_json.graph_json.nodes[0].id === 'good');
    }

    // -----------------------------------------------------------------
    // 8. get_workflow_versions surfaces changelog/parent_version.
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb();
        const handlers = new DefinitionHandlers(db);

        await handlers.handleImportWorkflowDefinition({
            id: 'chapter-workflow',
            name: 'Chapter Workflow',
            version: '1.0.0',
            graph_json: { nodes: [] },
            dependencies_json: {}
        });
        await handlers.handleImportWorkflowDefinition({
            id: 'chapter-workflow',
            name: 'Chapter Workflow',
            version: '2.0.0',
            graph_json: { nodes: [{ id: 'a' }] },
            dependencies_json: {},
            changelog: 'added node a'
        });

        const history = await handlers.handleGetWorkflowVersions({ workflow_id: 'chapter-workflow' });

        check('version history has both entries', history.length === 2);
        const v2 = history.find(v => v.version === '2.0.0');
        check('changelog is surfaced', v2?.changelog === 'added node a');
        check('parent_version is surfaced', v2?.parent_version === '1.0.0');
    }

    // -----------------------------------------------------------------
    // 9. RESTORE: restoring an older version round-trips graph_json
    //    byte-identically, and snapshots the current definition first so
    //    the restore itself is undoable.
    // -----------------------------------------------------------------
    {
        const db = makeFakeDb();
        const handlers = new DefinitionHandlers(db);

        const originalGraph = { nodes: [{ id: 'good', label: 'the good workflow' }], edges: [] };

        await handlers.handleImportWorkflowDefinition({
            id: 'chapter-workflow',
            name: 'Chapter Workflow',
            version: '1.0.0',
            graph_json: originalGraph,
            dependencies_json: {}
        });
        await handlers.handleImportWorkflowDefinition({
            id: 'chapter-workflow',
            name: 'Chapter Workflow',
            version: '2.0.0',
            graph_json: { nodes: [{ id: 'garbage' }], edges: [] },
            dependencies_json: {}
        });

        const restored = await handlers.handleRestoreWorkflowVersion({
            workflow_id: 'chapter-workflow',
            version: '1.0.0'
        });

        check('restore reports the restored version', restored.restored_version === '1.0.0');
        check('restore reports the previous version', restored.previous_version === '2.0.0');
        check('the live definition graph_json is byte-identical to the original', JSON.stringify(db.rows[0].graph_json) === JSON.stringify(originalGraph));
        check('the live definition version field reflects the restored version', db.rows[0].version === '1.0.0');

        const snapshotOf2 = db.versions.find(v => v.version === '2.0.0');
        check('the pre-restore (2.0.0) definition was snapshotted before being overwritten', snapshotOf2?.definition_json.graph_json.nodes[0].id === 'garbage');
    }

    console.log(`\n${pass} passed, ${fail} failed. (definition-handlers.test.js)`);
    process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('definition-handlers.test.js crashed:', error);
    process.exit(1);
});
