// src/mcps/npe-scene-server/handlers/npe-scene-handlers.js
// NPE Scene Validation Handler - Validates scenes against NPE (Narrative Physics Engine) rules
// Designed for AI Writing Teams to ensure NPE compliance in narrative scenes

import { npeSceneToolsSchema } from '../schemas/npe-scene-tools-schema.js';
import { randomUUID } from 'crypto';

export class NPESceneHandlers {
    constructor(db) {
        this.db = db;
    }

    // =============================================
    // NPE SCENE TOOL DEFINITIONS
    // =============================================
    getNPESceneTools() {
        return npeSceneToolsSchema;
    }

    // =============================================
    // NPE SCENE VALIDATION HANDLERS
    // =============================================

    /**
     * Validate scene architecture against NPE Rule #4
     * Checks for: intention, obstacle, pivot, consequence
     * Determines if scene should be summarized (missing key elements)
     */
    async handleValidateSceneArchitecture(args) {
        try {
            const {
                scene_id,
                has_intention,
                intention_description,
                has_obstacle,
                obstacle_description,
                has_pivot,
                pivot_type,
                has_consequence,
                consequence_description
            } = args;

            // Validate scene exists
            const sceneCheck = await this.db.query(
                'SELECT id, chapter_id, book_id FROM chapter_scenes WHERE id = $1',
                [scene_id]
            );

            if (sceneCheck.rows.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Scene with ID ${scene_id} not found`
                        }
                    ]
                };
            }

            const scene = sceneCheck.rows[0];

            // Calculate compliance
            const missing_elements = [];
            if (!has_intention) missing_elements.push('character_intention');
            if (!has_obstacle) missing_elements.push('obstacle');
            if (!has_pivot) missing_elements.push('pivot');
            if (!has_consequence) missing_elements.push('consequence');

            const compliant = missing_elements.length === 0;

            // NPE Rule: A scene missing 2+ key elements should be summarized
            const should_be_summarized = missing_elements.length >= 2;

            // Validate pivot type if pivot exists
            if (has_pivot && pivot_type) {
                const valid_pivot_types = ['power', 'information', 'emotional_truth'];
                if (!valid_pivot_types.includes(pivot_type)) {
                    throw new Error(`Invalid pivot_type. Must be one of: ${valid_pivot_types.join(', ')}`);
                }
            }

            // Create or update validation record
            const validationId = randomUUID();

            // Check if validation already exists for this scene
            const existingValidation = await this.db.query(
                'SELECT id FROM npe_scene_validation WHERE scene_id = $1',
                [scene_id]
            );

            let query;
            let values;

            if (existingValidation.rows.length > 0) {
                // Update existing record
                query = `
                    UPDATE npe_scene_validation
                    SET has_character_intention = $1,
                        intention_description = $2,
                        has_obstacle = $3,
                        obstacle_description = $4,
                        has_pivot = $5,
                        pivot_type = $6,
                        pivot_description = NULL,
                        has_consequence = $7,
                        consequence_description = $8,
                        should_be_summarized = $9,
                        validated_at = CURRENT_TIMESTAMP
                    WHERE scene_id = $10
                    RETURNING *
                `;
                values = [
                    has_intention,
                    intention_description || null,
                    has_obstacle,
                    obstacle_description || null,
                    has_pivot,
                    pivot_type || null,
                    has_consequence,
                    consequence_description || null,
                    should_be_summarized,
                    scene_id
                ];
            } else {
                // Insert new record
                query = `
                    INSERT INTO npe_scene_validation (
                        id,
                        scene_id,
                        book_id,
                        chapter_id,
                        has_character_intention,
                        intention_description,
                        has_obstacle,
                        obstacle_description,
                        has_pivot,
                        pivot_type,
                        has_consequence,
                        consequence_description,
                        should_be_summarized
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                    RETURNING *
                `;
                values = [
                    validationId,
                    scene_id,
                    scene.book_id,
                    scene.chapter_id,
                    has_intention,
                    intention_description || null,
                    has_obstacle,
                    obstacle_description || null,
                    has_pivot,
                    pivot_type || null,
                    has_consequence,
                    consequence_description || null,
                    should_be_summarized
                ];
            }

            const result = await this.db.query(query, values);
            const validation = result.rows[0];

            // Format response
            const response = {
                validation_id: validation.id,
                scene_id: scene_id,
                compliant: compliant,
                missing_elements: missing_elements,
                should_be_summarized: should_be_summarized,
                details: {
                    has_intention: has_intention,
                    has_obstacle: has_obstacle,
                    has_pivot: has_pivot,
                    has_consequence: has_consequence
                }
            };

            if (pivot_type) {
                response.details.pivot_type = pivot_type;
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `NPE Scene Architecture Validation:\n\n` +
                              `Scene ID: ${scene_id}\n` +
                              `Compliant: ${compliant ? 'YES' : 'NO'}\n` +
                              `Should be summarized: ${should_be_summarized ? 'YES' : 'NO'}\n\n` +
                              `Architecture Elements:\n` +
                              `- Character Intention: ${has_intention ? '✓' : '✗'}\n` +
                              `- Obstacle: ${has_obstacle ? '✓' : '✗'}\n` +
                              `- Pivot: ${has_pivot ? '✓' : '✗'}${pivot_type ? ` (${pivot_type})` : ''}\n` +
                              `- Consequence: ${has_consequence ? '✓' : '✗'}\n\n` +
                              (missing_elements.length > 0
                                  ? `Missing Elements: ${missing_elements.join(', ')}\n\n`
                                  : '') +
                              `Validation Record ID: ${validation.id}\n\n` +
                              `JSON Response:\n${JSON.stringify(response, null, 2)}`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to validate scene architecture: ${error.message}`);
        }
    }

    /**
     * Validate dialogue physics against NPE Rule #5
     * Checks for echolalia (characters echoing each other) and subtext
     */
    async handleValidateDialoguePhysics(args) {
        try {
            const { scene_id, dialogue_lines } = args;

            // Validate scene exists
            const sceneCheck = await this.db.query(
                'SELECT id, chapter_id, book_id FROM chapter_scenes WHERE id = $1',
                [scene_id]
            );

            if (sceneCheck.rows.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Scene with ID ${scene_id} not found`
                        }
                    ]
                };
            }

            const scene = sceneCheck.rows[0];

            // Check for echolalia (line mirroring/repetition)
            const echolalia_violations = [];
            const normalizeText = (text) => text.toLowerCase().trim().replace(/[.,!?;:]/g, '');

            for (let i = 0; i < dialogue_lines.length; i++) {
                const currentLine = dialogue_lines[i];
                const currentNormalized = normalizeText(currentLine.line);

                // Check against subsequent lines (within next 3 lines)
                for (let j = i + 1; j < Math.min(i + 4, dialogue_lines.length); j++) {
                    const nextLine = dialogue_lines[j];
                    const nextNormalized = normalizeText(nextLine.line);

                    // Check for exact match (echolalia)
                    if (currentNormalized === nextNormalized) {
                        echolalia_violations.push({
                            line_index_1: i,
                            line_index_2: j,
                            character_id_1: currentLine.character_id,
                            character_id_2: nextLine.character_id,
                            repeated_line: currentLine.line,
                            violation_type: 'exact_repetition'
                        });
                    }
                    // Check for significant overlap (>80% similar words)
                    else {
                        const words1 = currentNormalized.split(/\s+/);
                        const words2 = nextNormalized.split(/\s+/);
                        const commonWords = words1.filter(w => words2.includes(w));
                        const similarity = commonWords.length / Math.max(words1.length, words2.length);

                        if (similarity > 0.8 && words1.length > 3) {
                            echolalia_violations.push({
                                line_index_1: i,
                                line_index_2: j,
                                character_id_1: currentLine.character_id,
                                character_id_2: nextLine.character_id,
                                line_1: currentLine.line,
                                line_2: nextLine.line,
                                similarity_ratio: similarity,
                                violation_type: 'high_similarity'
                            });
                        }
                    }
                }
            }

            const compliant = echolalia_violations.length === 0;

            // Subtext analysis (simplified heuristic)
            // In real implementation, this would use NLP or more sophisticated analysis
            const subtext_indicators = dialogue_lines.filter(dl => {
                const line = dl.line.toLowerCase();
                return (
                    line.includes('...') ||  // Trailing off
                    line.includes('—') ||    // Em dash interruption
                    line.length < 30 ||      // Short, clipped responses
                    /\?$/.test(line.trim())  // Questions (often indirect)
                );
            });
            const subtext_present = subtext_indicators.length > dialogue_lines.length * 0.3;

            // Update validation record if it exists
            const existingValidation = await this.db.query(
                'SELECT id FROM npe_scene_validation WHERE scene_id = $1',
                [scene_id]
            );

            if (existingValidation.rows.length > 0) {
                await this.db.query(
                    `UPDATE npe_scene_validation
                     SET has_dialogue = $1,
                         dialogue_has_subtext = $2,
                         avoids_echolalia = $3,
                         dialogue_violations = $4,
                         validated_at = CURRENT_TIMESTAMP
                     WHERE scene_id = $5`,
                    [
                        true,
                        subtext_present,
                        compliant,
                        JSON.stringify(echolalia_violations),
                        scene_id
                    ]
                );
            } else {
                // Create new validation record
                const validationId = randomUUID();
                await this.db.query(
                    `INSERT INTO npe_scene_validation (
                        id, scene_id, book_id, chapter_id,
                        has_dialogue, dialogue_has_subtext, avoids_echolalia,
                        dialogue_violations
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        validationId,
                        scene_id,
                        scene.book_id,
                        scene.chapter_id,
                        true,
                        subtext_present,
                        compliant,
                        JSON.stringify(echolalia_violations)
                    ]
                );
            }

            const response = {
                scene_id: scene_id,
                compliant: compliant,
                echolalia_violations: echolalia_violations,
                subtext_present: subtext_present,
                dialogue_line_count: dialogue_lines.length,
                subtext_indicator_count: subtext_indicators.length
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: `NPE Dialogue Physics Validation:\n\n` +
                              `Scene ID: ${scene_id}\n` +
                              `Compliant: ${compliant ? 'YES' : 'NO'}\n` +
                              `Subtext Present: ${subtext_present ? 'YES' : 'NO'}\n` +
                              `Dialogue Lines Analyzed: ${dialogue_lines.length}\n\n` +
                              `Echolalia Violations: ${echolalia_violations.length}\n` +
                              (echolalia_violations.length > 0
                                  ? echolalia_violations.map((v, i) =>
                                      `\n${i + 1}. ${v.violation_type} between lines ${v.line_index_1} and ${v.line_index_2}\n` +
                                      `   Characters: ${v.character_id_1} ↔ ${v.character_id_2}\n` +
                                      (v.repeated_line ? `   Repeated: "${v.repeated_line}"\n` : '') +
                                      (v.similarity_ratio ? `   Similarity: ${(v.similarity_ratio * 100).toFixed(0)}%\n` : '')
                                  ).join('')
                                  : '\n(No violations detected)\n') +
                              `\nSubtext Analysis:\n` +
                              `- Subtext indicators found: ${subtext_indicators.length}/${dialogue_lines.length}\n` +
                              `- Ratio: ${((subtext_indicators.length / dialogue_lines.length) * 100).toFixed(0)}%\n\n` +
                              `JSON Response:\n${JSON.stringify(response, null, 2)}`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to validate dialogue physics: ${error.message}`);
        }
    }

    /**
     * Get complete NPE compliance report for a scene
     * Returns full npe_scene_validation record
     */
    async handleGetSceneNPECompliance(args) {
        try {
            const { scene_id } = args;

            // Get validation record
            const query = `
                SELECT
                    v.*,
                    s.scene_type,
                    s.title as scene_title,
                    c.title as chapter_title,
                    b.title as book_title
                FROM npe_scene_validation v
                JOIN chapter_scenes s ON v.scene_id = s.id
                JOIN chapters c ON v.chapter_id = c.id
                JOIN books b ON v.book_id = b.id
                WHERE v.scene_id = $1
            `;

            const result = await this.db.query(query, [scene_id]);

            if (result.rows.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No NPE validation record found for scene ID ${scene_id}.\n\n` +
                                  `Please run validate_scene_architecture or validate_dialogue_physics first.`
                        }
                    ]
                };
            }

            const validation = result.rows[0];

            // Parse JSON fields
            let violations = [];
            let dialogue_violations = [];

            try {
                if (validation.violations) {
                    violations = JSON.parse(validation.violations);
                }
                if (validation.dialogue_violations) {
                    dialogue_violations = JSON.parse(validation.dialogue_violations);
                }
            } catch (e) {
                console.error('Error parsing JSON fields:', e);
            }

            // Calculate overall compliance
            const architecture_compliant =
                validation.has_character_intention &&
                validation.has_obstacle &&
                validation.has_pivot &&
                validation.has_consequence;

            const dialogue_compliant =
                validation.has_dialogue ? validation.avoids_echolalia : true;

            const overall_compliant = architecture_compliant && dialogue_compliant;

            return {
                content: [
                    {
                        type: 'text',
                        text: `NPE Scene Compliance Report\n` +
                              `${'='.repeat(50)}\n\n` +
                              `Scene: ${validation.scene_title || 'Untitled'}\n` +
                              `Chapter: ${validation.chapter_title || 'Unknown'}\n` +
                              `Book: ${validation.book_title || 'Unknown'}\n` +
                              `Scene ID: ${scene_id}\n\n` +
                              `Overall Compliance: ${overall_compliant ? '✓ COMPLIANT' : '✗ NON-COMPLIANT'}\n` +
                              `Should be Summarized: ${validation.should_be_summarized ? 'YES' : 'NO'}\n\n` +
                              `Scene Architecture (NPE Rule #4):\n` +
                              `${'-'.repeat(40)}\n` +
                              `- Character Intention: ${validation.has_character_intention ? '✓' : '✗'}` +
                              (validation.intention_description ? `\n  "${validation.intention_description}"` : '') + `\n` +
                              `- Obstacle: ${validation.has_obstacle ? '✓' : '✗'}` +
                              (validation.obstacle_description ? `\n  "${validation.obstacle_description}"` : '') + `\n` +
                              `- Pivot: ${validation.has_pivot ? '✓' : '✗'}` +
                              (validation.pivot_type ? ` (${validation.pivot_type})` : '') + `\n` +
                              `- Consequence: ${validation.has_consequence ? '✓' : '✗'}` +
                              (validation.consequence_description ? `\n  "${validation.consequence_description}"` : '') + `\n\n` +
                              (validation.has_dialogue
                                  ? `Dialogue Physics (NPE Rule #5):\n` +
                                    `${'-'.repeat(40)}\n` +
                                    `- Has Dialogue: ✓\n` +
                                    `- Subtext Present: ${validation.dialogue_has_subtext ? '✓' : '✗'}\n` +
                                    `- Avoids Echolalia: ${validation.avoids_echolalia ? '✓' : '✗'}\n` +
                                    (dialogue_violations.length > 0
                                        ? `- Echolalia Violations: ${dialogue_violations.length}\n`
                                        : '') + `\n`
                                  : `Dialogue Physics: No dialogue in scene\n\n`) +
                              (validation.scene_length_category
                                  ? `Pacing (NPE Rule #3):\n` +
                                    `${'-'.repeat(40)}\n` +
                                    `- Scene Length: ${validation.scene_length_category}\n` +
                                    (validation.time_treatment ? `- Time Treatment: ${validation.time_treatment}\n` : '') +
                                    (validation.energy_modulation ? `- Energy Modulation: ${validation.energy_modulation}\n` : '') + `\n`
                                  : '') +
                              (validation.pov_character_id
                                  ? `POV Physics (NPE Rule #6):\n` +
                                    `${'-'.repeat(40)}\n` +
                                    `- POV Character ID: ${validation.pov_character_id}\n` +
                                    `- Subjective POV: ${validation.pov_is_subjective ? '✓' : '✗'}\n` +
                                    `- Has Bias: ${validation.pov_has_bias ? '✓' : '✗'}\n` +
                                    `- Misreads Events: ${validation.pov_misreads_events ? '✓' : '✗'}\n\n`
                                  : '') +
                              `Validation Details:\n` +
                              `${'-'.repeat(40)}\n` +
                              `Validation ID: ${validation.id}\n` +
                              `Last Validated: ${validation.validated_at}\n\n` +
                              `Full Record (JSON):\n${JSON.stringify(validation, null, 2)}`
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to get scene NPE compliance: ${error.message}`);
        }
    }
}
