// tests/plot-server/reveal-scene-refs.test.js
// Bead mws-7oa: information_reveals / reveal_evidence / information_flow use
// outline-scene refs instead of chapter numbers (Canon Over Time).
// Mocked db: asserts SQL/params carry scene ids and scene refs are validated.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GenreExtensions } from '../../src/mcps/plot-server/handlers/genre-extensions.js';
import { genreExtensionToolsSchema } from '../../src/mcps/plot-server/schemas/plot-tools-schema.js';
import { PlotValidators } from '../../src/mcps/plot-server/utils/plot-validators.js';

// existingScenes: outline_works ids that "exist"
const mockDb = (existingScenes = []) => {
    const calls = [];
    return {
        calls,
        async query(sql, params = []) {
            calls.push({ sql, params });
            if (sql.includes('FROM outline_works')) {
                return { rows: params[0].filter(id => existingScenes.includes(id)).map(id => ({ id })) };
            }
            if (sql.includes('FROM plot_threads')) return { rows: [{ id: 1, title: 'T' }] };
            if (sql.includes('FROM information_reveals')) return { rows: [{ id: 5, information_content: 'x' }] };
            if (sql.includes('RETURNING')) return { rows: [{ id: 9, created_at: 'now' }] };
            return { rows: [] };
        }
    };
};

const insertCall = (db, table) => db.calls.find(c => c.sql.includes(`INSERT INTO ${table}`));

describe('reveal scene refs (mws-7oa)', () => {
    it('tool schemas expose scene fields; chapter fields remain only as DEPRECATED aliases', () => {
        const byName = Object.fromEntries(genreExtensionToolsSchema.map(t => [t.name, t.inputSchema.properties]));
        assert.ok(byName.create_information_reveal.revealed_in_scene_id);
        assert.ok(byName.create_information_reveal.foreshadowing_scene_ids);
        assert.match(byName.create_information_reveal.revealed_in_chapter.description, /DEPRECATED/);
        assert.match(byName.create_information_reveal.foreshadowing_chapters.description, /DEPRECATED/);
        assert.ok(byName.add_reveal_evidence.discovery_scene_id);
        assert.match(byName.add_reveal_evidence.discovery_chapter.description, /DEPRECATED/);
        assert.ok(byName.add_information_flow.learned_in_scene_id);
        assert.ok(byName.add_information_flow.learned_by_reader);
    });

    it('create_information_reveal stores scene ids', async () => {
        const db = mockDb([10, 11, 12]);
        await new GenreExtensions(db).handleCreateInformationReveal({
            plot_thread_id: 1, reveal_type: 'secret', information_content: 'c',
            reveal_method: 'confessed', significance_level: 'major',
            revealed_in_scene_id: 12, foreshadowing_scene_ids: [10, 11] });
        const call = insertCall(db, 'information_reveals');
        assert.match(call.sql, /revealed_in_scene_id/);
        assert.match(call.sql, /foreshadowing_scene_ids/);
        assert.strictEqual(call.params[6], 12);
        assert.deepStrictEqual(call.params[8], [10, 11]);
    });

    it('create_information_reveal rejects an unknown scene', async () => {
        const db = mockDb([10]);
        await assert.rejects(
            new GenreExtensions(db).handleCreateInformationReveal({
                plot_thread_id: 1, reveal_type: 'secret', information_content: 'c',
                reveal_method: 'confessed', significance_level: 'major',
                revealed_in_scene_id: 99 }),
            /Outline scene\(s\) not found: 99/);
        assert.ok(!insertCall(db, 'information_reveals'));
    });

    it('add_reveal_evidence stores discovery_scene_id', async () => {
        const db = mockDb([20]);
        await new GenreExtensions(db).handleAddRevealEvidence({
            reveal_id: 5, evidence_type: 'physical', evidence_description: 'd', discovery_scene_id: 20 });
        const call = insertCall(db, 'reveal_evidence');
        assert.match(call.sql, /discovery_scene_id/);
        assert.strictEqual(call.params[4], 20);
    });

    it('add_information_flow records the reader as learner', async () => {
        const db = mockDb([30]);
        const res = await new GenreExtensions(db).handleAddInformationFlow({
            reveal_id: 5, learned_by_reader: true, learned_in_scene_id: 30 });
        const call = insertCall(db, 'information_flow');
        assert.deepStrictEqual(call.params.slice(0, 4), [5, null, true, 30]);
        assert.match(res.content[0].text, /the reader/);
    });

    it('add_information_flow records a character learner and needs a learner', async () => {
        const db = mockDb([]);
        await new GenreExtensions(db).handleAddInformationFlow({
            reveal_id: 5, learned_by_character_id: 3, knowledge_level: 'suspected' });
        const call = insertCall(db, 'information_flow');
        assert.deepStrictEqual(call.params.slice(0, 4), [5, 3, false, null]);
        assert.strictEqual(call.params[5], 'suspected');
        await assert.rejects(
            new GenreExtensions(mockDb()).handleAddInformationFlow({ reveal_id: 5 }),
            /learned_by_character_id, or set learned_by_reader/);
    });

    it('validators check the scene fields', () => {
        const base = { plot_thread_id: 1, reveal_type: 'secret', information_content: 'c',
            reveal_method: 'm', significance_level: 'major' };
        assert.ok(PlotValidators.validateInformationReveal({ ...base, revealed_in_scene_id: 3, foreshadowing_scene_ids: [1] }).valid);
        assert.ok(!PlotValidators.validateInformationReveal({ ...base, revealed_in_scene_id: 0 }).valid);
        assert.ok(!PlotValidators.validateInformationReveal({ ...base, foreshadowing_scene_ids: 'x' }).valid);
    });

    it('deprecated chapter params are still stored in the kept legacy columns', async () => {
        const db = mockDb([]);
        const g = new GenreExtensions(db);
        await g.handleCreateInformationReveal({
            plot_thread_id: 1, reveal_type: 'secret', information_content: 'c',
            reveal_method: 'confessed', significance_level: 'major',
            revealed_in_chapter: 4, foreshadowing_chapters: [1, 2] });
        let call = insertCall(db, 'information_reveals');
        assert.match(call.sql, /revealed_in_chapter, foreshadowing_chapters/);
        assert.strictEqual(call.params[9], 4);
        assert.deepStrictEqual(call.params[10], [1, 2]);

        await g.handleAddRevealEvidence({ reveal_id: 5, evidence_type: 'physical', evidence_description: 'd', discovery_chapter: 8 });
        call = insertCall(db, 'reveal_evidence');
        assert.match(call.sql, /discovery_chapter/);
        assert.strictEqual(call.params[6], 8);

        await g.handleAddInformationFlow({ reveal_id: 5, learned_by_character_id: 3, learned_in_chapter: 9 });
        call = insertCall(db, 'information_flow');
        assert.match(call.sql, /learned_in_chapter/);
        assert.strictEqual(call.params[7], 9);
    });

    it('validators accept and check the deprecated aliases', () => {
        const base = { plot_thread_id: 1, reveal_type: 'secret', information_content: 'c',
            reveal_method: 'm', significance_level: 'major' };
        assert.ok(PlotValidators.validateInformationReveal({ ...base, revealed_in_chapter: 3, foreshadowing_chapters: [1] }).valid);
        assert.ok(!PlotValidators.validateInformationReveal({ ...base, revealed_in_chapter: 0 }).valid);
        assert.ok(!PlotValidators.validateInformationReveal({ ...base, foreshadowing_chapters: 'x' }).valid);
    });
});
