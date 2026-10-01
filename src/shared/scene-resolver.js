// src/shared/scene-resolver.js
// Resolve a scene within a caller-supplied book. scene_id is a GLOBAL
// chapter_scenes.id, so it is never accepted on its own (mws-0md / mws-8uw):
// a guessed id silently wrote into another book.

export async function resolveScene(db, { book_id, scene_id, chapter_number, scene_number }) {
    if (!book_id) {
        throw new Error('book_id is required (scene_id is a global id and is never accepted on its own)');
    }

    const hasNumbers = chapter_number !== undefined && chapter_number !== null &&
        scene_number !== undefined && scene_number !== null;
    const hasId = scene_id !== undefined && scene_id !== null;

    if (!hasNumbers && !hasId) {
        throw new Error('Either scene_id, or chapter_number + scene_number, must be provided with book_id');
    }

    const selectScene = `
        SELECT
            cs.id, cs.scene_number, cs.chapter_id,
            c.title as chapter_title, c.book_id,
            b.title as book_title
        FROM chapter_scenes cs
        JOIN chapters c ON cs.chapter_id = c.id
        JOIN books b ON c.book_id = b.id
    `;

    let scene;
    if (hasNumbers) {
        const result = await db.query(
            `${selectScene} WHERE c.book_id = $1 AND c.chapter_number = $2 AND cs.scene_number = $3`,
            [book_id, chapter_number, scene_number]
        );
        if (result.rows.length === 0) {
            throw new Error(`No scene ${scene_number} in chapter_number ${chapter_number} found for book_id ${book_id}`);
        }
        scene = result.rows[0];
        if (hasId && scene.id !== scene_id) {
            throw new Error(
                `scene_id ${scene_id} does not match chapter_number ${chapter_number} / scene_number ${scene_number} in book_id ${book_id} (that scene is id ${scene.id})`
            );
        }
    } else {
        const result = await db.query(`${selectScene} WHERE cs.id = $1`, [scene_id]);
        if (result.rows.length === 0) {
            throw new Error(`Scene with ID ${scene_id} not found`);
        }
        scene = result.rows[0];
        if (scene.book_id !== book_id) {
            throw new Error(
                `scene_id ${scene_id} belongs to book_id ${scene.book_id}, not book_id ${book_id}. ` +
                `scene_id is a GLOBAL id -- pass chapter_number + scene_number instead.`
            );
        }
    }

    return scene;
}
