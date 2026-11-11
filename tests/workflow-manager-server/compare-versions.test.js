// tests/workflow-manager-server/compare-versions.test.js
// Bead mws-12w: compareVersions must parse the numeric core before the tag so
// dev copies (e.g. 1.1.10-dev.r8) can move past a two-digit patch.
// No live DB: the handler test uses a tiny in-memory fake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, DefinitionHandlers } from '../../src/mcps/workflow-manager-server/handlers/definition-handlers.js';

test('two-digit patch with a tag is greater', () => {
    assert.equal(compareVersions('1.1.10-dev.r8', '1.1.8-dev.r7'), 1);
    assert.equal(compareVersions('1.1.8-dev.r7', '1.1.10-dev.r8'), -1);
    assert.equal(compareVersions('1.6.11-dev.r8', '1.6.9-dev.r7'), 1);
});

test('same core: later tag is greater', () => {
    assert.equal(compareVersions('1.2.6-dev.r8', '1.2.6-dev.r7'), 1);
    assert.equal(compareVersions('1.2.6-dev.r7', '1.2.6-dev.r8'), -1);
});

test('untagged release is greater than the same core with a tag', () => {
    assert.equal(compareVersions('1.2.6', '1.2.6-dev.r8'), 1);
    assert.equal(compareVersions('1.2.6-dev.r8', '1.2.6'), -1);
});

test('identical versions are equal', () => {
    assert.equal(compareVersions('1.2.6-dev.r7', '1.2.6-dev.r7'), 0);
    assert.equal(compareVersions('1.2', '1.2.0'), 0);
});

test('numeric segments compare as integers', () => {
    assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
});

test('malformed input returns a number and never throws', () => {
    for (const [a, b] of [['abc', '1.0.0'], ['1.x.0', '1.0.0'], ['', ''], [undefined, null], ['1..2', '1.2'], ['-dev', '1.0.0']]) {
        assert.equal(typeof compareVersions(a, b), 'number');
    }
});

function fakeDb(existing) {
    return {
        async transaction(fn) {
            return fn({
                async query(sql) {
                    if (sql.includes('FROM fictionlab.workflow_definitions')) return { rows: [existing] };
                    if (sql.includes('RETURNING workflow_id')) return { rows: [{ workflow_id: 'wf', version: 'x', created_at: 'now' }] };
                    return { rows: [] };
                }
            });
        }
    };
}
const existingRow = (version) => ({
    workflow_id: 'wf', name: 'wf', version, description: '', graph_json: { nodes: [] },
    dependencies: {}, tags: [], metadata: {}, created_by: 'test'
});
const incoming = (version) => ({
    id: 'wf', name: 'wf', version, description: '', graph_json: { nodes: [] },
    dependencies_json: {}, tags: [], created_by: 'test'
});

test('overwrite guard accepts 1.1.10-dev.r8 over existing 1.1.8-dev.r7', async () => {
    const h = new DefinitionHandlers(fakeDb(existingRow('1.1.8-dev.r7')));
    const r = await h.handleImportWorkflowDefinition(incoming('1.1.10-dev.r8'));
    assert.equal(r.workflow_id, 'wf');
});

test('overwrite guard still refuses 1.1.8-dev.r7 over existing 1.1.10-dev.r8', async () => {
    const h = new DefinitionHandlers(fakeDb(existingRow('1.1.10-dev.r8')));
    await assert.rejects(
        () => h.handleImportWorkflowDefinition(incoming('1.1.8-dev.r7')),
        /would overwrite existing version 1\.1\.10-dev\.r8/
    );
});
