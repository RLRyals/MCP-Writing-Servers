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
// This is a hand-rolled fake DB (no real Postgres connection anywhere in
// this file) that models exactly those two constraints -- PK on
// workflow_id, UNIQUE on (workflow_id, version) -- and raises the same kind
// of error a real Postgres would when an INSERT's ON CONFLICT arbiter
// doesn't match the row that's actually colliding. That means this test
// fails against the old `ON CONFLICT (workflow_id, version)` SQL and passes
// against the fixed `ON CONFLICT (workflow_id)` SQL.
//
// Run: node tests/workflow-manager-server/definition-handlers.test.js

import { strict as assert } from 'assert';
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

// ---------------------------------------------------------------------------
// Fake DB modeling fictionlab.workflow_definitions:
//   PRIMARY KEY (workflow_id)
//   UNIQUE (workflow_id, version)
// Parses the INSERT ... ON CONFLICT (<arbiter columns>) DO UPDATE SET ...
// text well enough to (a) find an existing row via the real PK, (b) check
// whether the given ON CONFLICT arbiter actually matches that collision,
// and (c) either apply the DO UPDATE SET or throw a Postgres-shaped error
// when the arbiter is wrong -- exactly the bug this test guards against.
// ---------------------------------------------------------------------------
function makeFakeDb() {
    const rows = []; // { workflow_id, name, version, description, graph_json, dependencies, tags, metadata, created_by, is_system, created_at, updated_at }
    const imports = [];

    return {
        rows,
        imports,
        async query(text, params = []) {
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
                    existingByPk.graph_json = graph_json;
                    existingByPk.dependencies = dependencies;
                    existingByPk.tags = tags;
                    existingByPk.metadata = metadata;
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
                    graph_json,
                    dependencies,
                    tags,
                    metadata,
                    created_by,
                    is_system: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                rows.push(row);
                return { rows: [{ workflow_id: row.workflow_id, version: row.version, created_at: row.created_at }] };
            }

            if (sql.startsWith('INSERT INTO fictionlab.workflow_imports')) {
                const [workflow_id, source_type, source_path, imported_by, installation_log] = params;
                imports.push({ workflow_id, source_type, source_path, imported_by, installation_log });
                return { rows: [] };
            }

            throw new Error(`makeFakeDb: unhandled query: ${sql}`);
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
    }

    // -----------------------------------------------------------------
    // 3. Re-importing the SAME workflow_id + SAME version still updates
    //    in place (existing behavior preserved, per acceptance criteria).
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

        check('same-version re-import succeeds', sameVersionResult.version === '1.0.0');
        check('still exactly one row', db.rows.length === 1);
        check('description was updated in place', db.rows[0].description === 'corrected description, same version');
    }

    console.log(`\n${pass} passed, ${fail} failed. (definition-handlers.test.js)`);
    process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('definition-handlers.test.js crashed:', error);
    process.exit(1);
});
