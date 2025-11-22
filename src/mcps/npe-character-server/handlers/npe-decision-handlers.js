// src/mcps/npe-character-server/handlers/npe-decision-handlers.js
// NPE Character Decision Handler - Track and validate character decisions with NPE alignment
// Designed for AI Writing Teams to ensure characters make decisions consistent with NPE principles

import { randomUUID } from 'crypto';
import { npeDecisionToolsSchema } from '../schemas/npe-decision-tools-schema.js';

export class NPEDecisionHandlers {
    constructor(db) {
        this.db = db;
    }

    // =============================================
    // NPE DECISION TOOL DEFINITIONS
    // =============================================
    getNPEDecisionTools() {
        return npeDecisionToolsSchema;
    }

    // =============================================
    // NPE DECISION MANAGEMENT HANDLERS
    // =============================================

    async handleLogCharacterDecision(args) {
        try {
            const {
                character_id,
                book_id,
                scene_id,
                decision_description,
                character_version,
                alternatives,
                aligned_with_goals,
                aligned_with_fears,
                aligned_with_wounds,
                operating_on_incomplete_info,
                why_this_choice,
                context_state,
                immediate_consequence
            } = args;

            // Validate alternatives count (must be 2-3)
            if (!alternatives || alternatives.length < 2 || alternatives.length > 3) {
                throw new Error('alternatives_count must be between 2 and 3. Received: ' + (alternatives?.length || 0));
            }

            const alternatives_count = alternatives.length;

            // Generate UUID for TEXT primary key
            const decision_id = randomUUID();

            // Get chapter_id from scene_id
            let chapter_id = null;
            if (scene_id) {
                const sceneResult = await this.db.query(
                    'SELECT chapter_id FROM chapter_scenes WHERE id = $1',
                    [scene_id]
                );
                if (sceneResult.rows.length > 0) {
                    chapter_id = sceneResult.rows[0].chapter_id;
                }
            }

            // Verify character exists
            const characterCheck = await this.db.query(
                'SELECT id, name FROM characters WHERE id = $1',
                [character_id]
            );

            if (characterCheck.rows.length === 0) {
                throw new Error(`Character with ID ${character_id} not found`);
            }

            const characterName = characterCheck.rows[0].name;

            // Verify book exists
            const bookCheck = await this.db.query(
                'SELECT id, title FROM books WHERE id = $1',
                [book_id]
            );

            if (bookCheck.rows.length === 0) {
                throw new Error(`Book with ID ${book_id} not found`);
            }

            const bookTitle = bookCheck.rows[0].title;

            // Insert the decision
            const result = await this.db.query(
                `INSERT INTO npe_character_decisions (
                    id, character_id, book_id, chapter_id, scene_id,
                    decision_description, character_version, alternatives_count,
                    alternatives, why_this_choice, context_state,
                    aligned_with_goals, aligned_with_fears, aligned_with_wounds,
                    operating_on_incomplete_info, immediate_consequence
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                RETURNING *`,
                [
                    decision_id,
                    character_id,
                    book_id,
                    chapter_id,
                    scene_id,
                    decision_description,
                    character_version,
                    alternatives_count,
                    JSON.stringify(alternatives),
                    why_this_choice || null,
                    context_state || null,
                    aligned_with_goals,
                    aligned_with_fears,
                    aligned_with_wounds,
                    operating_on_incomplete_info,
                    immediate_consequence || null
                ]
            );

            const decision = result.rows[0];

            return {
                content: [
                    {
                        type: 'text',
                        text: `Character Decision Logged Successfully!\n\n` +
                              `Decision ID: ${decision.id}\n` +
                              `Character: ${characterName} (ID: ${character_id})\n` +
                              `Book: ${bookTitle} (ID: ${book_id})\n` +
                              `Scene ID: ${scene_id}\n` +
                              `Chapter ID: ${chapter_id || 'Not specified'}\n\n` +
                              `Decision: ${decision_description}\n\n` +
                              `NPE Alignment:\n` +
                              `  - Aligned with Goals: ${aligned_with_goals ? '✓' : '✗'}\n` +
                              `  - Aligned with Fears: ${aligned_with_fears ? '✓' : '✗'}\n` +
                              `  - Aligned with Wounds: ${aligned_with_wounds ? '✓' : '✗'}\n` +
                              `  - Operating on Incomplete Info: ${operating_on_incomplete_info ? 'Yes' : 'No'}\n\n` +
                              `Character Version: ${character_version}\n` +
                              `Context State: ${context_state || 'Not specified'}\n\n` +
                              `Alternatives (${alternatives_count}):\n` +
                              alternatives.map((alt, i) => `  ${i + 1}. ${alt}`).join('\n') + '\n\n' +
                              (why_this_choice ? `Why This Choice: ${why_this_choice}\n\n` : '') +
                              (immediate_consequence ? `Immediate Consequence: ${immediate_consequence}` : '')
                    }
                ]
            };
        } catch (error) {
            if (error.code === '23503') { // Foreign key violation
                throw new Error(`Invalid reference: ${error.message}`);
            }
            throw new Error(`Failed to log character decision: ${error.message}`);
        }
    }

    async handleValidateCharacterDecision(args) {
        try {
            const { decision_id } = args;

            // Get the decision with character details
            const result = await this.db.query(
                `SELECT
                    d.*,
                    c.name as character_name,
                    b.title as book_title
                FROM npe_character_decisions d
                JOIN characters c ON d.character_id = c.id
                JOIN books b ON d.book_id = b.id
                WHERE d.id = $1`,
                [decision_id]
            );

            if (result.rows.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No decision found with ID: ${decision_id}`
                        }
                    ]
                };
            }

            const decision = result.rows[0];

            // Calculate alignment scores
            const alignmentScores = {
                goals: decision.aligned_with_goals ? 1.0 : 0.0,
                fears: decision.aligned_with_fears ? 1.0 : 0.0,
                wounds: decision.aligned_with_wounds ? 1.0 : 0.0
            };

            // Calculate overall alignment score (average of the three)
            const overallScore = (alignmentScores.goals + alignmentScores.fears + alignmentScores.wounds) / 3;

            // Determine violations
            const violations = [];

            if (!decision.aligned_with_goals) {
                violations.push('Decision does not align with character goals');
            }

            if (!decision.aligned_with_fears) {
                violations.push('Decision does not align with character fears');
            }

            if (!decision.aligned_with_wounds) {
                violations.push('Decision does not align with character wounds');
            }

            // Check alternatives count
            if (decision.alternatives_count < 2 || decision.alternatives_count > 3) {
                violations.push(`Invalid alternatives count: ${decision.alternatives_count} (must be 2-3)`);
            }

            // NPE compliance requires at least 2 out of 3 alignments
            const compliant = overallScore >= 0.67;

            // Update the decision record with validation results
            await this.db.query(
                `UPDATE npe_character_decisions
                SET npe_compliant = $1,
                    violations = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3`,
                [compliant, JSON.stringify(violations), decision_id]
            );

            // Parse alternatives from JSON
            const alternatives = JSON.parse(decision.alternatives || '[]');

            return {
                content: [
                    {
                        type: 'text',
                        text: `NPE Decision Validation Results\n\n` +
                              `Decision ID: ${decision_id}\n` +
                              `Character: ${decision.character_name}\n` +
                              `Book: ${decision.book_title}\n` +
                              `Decision: ${decision.decision_description}\n\n` +
                              `NPE COMPLIANCE: ${compliant ? '✓ COMPLIANT' : '✗ NON-COMPLIANT'}\n` +
                              `Overall Score: ${(overallScore * 100).toFixed(0)}%\n\n` +
                              `Alignment Scores:\n` +
                              `  - Goals: ${alignmentScores.goals} ${decision.aligned_with_goals ? '✓' : '✗'}\n` +
                              `  - Fears: ${alignmentScores.fears} ${decision.aligned_with_fears ? '✓' : '✗'}\n` +
                              `  - Wounds: ${alignmentScores.wounds} ${decision.aligned_with_wounds ? '✓' : '✗'}\n\n` +
                              `Character Version: ${decision.character_version}\n` +
                              `Context State: ${decision.context_state || 'Not specified'}\n` +
                              `Alternatives Provided: ${decision.alternatives_count}\n\n` +
                              (violations.length > 0 ?
                                  `Violations:\n${violations.map(v => `  - ${v}`).join('\n')}\n\n` :
                                  `No violations found.\n\n`) +
                              `Alternatives Considered:\n` +
                              alternatives.map((alt, i) => `  ${i + 1}. ${alt}`).join('\n')
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to validate character decision: ${error.message}`);
        }
    }

    async handleGetCharacterDecisionsInScene(args) {
        try {
            const { scene_id } = args;

            // Get all decisions in the scene with character details
            const result = await this.db.query(
                `SELECT
                    d.*,
                    c.name as character_name,
                    b.title as book_title,
                    ch.chapter_number,
                    ch.title as chapter_title
                FROM npe_character_decisions d
                JOIN characters c ON d.character_id = c.id
                JOIN books b ON d.book_id = b.id
                LEFT JOIN chapters ch ON d.chapter_id = ch.id
                WHERE d.scene_id = $1
                ORDER BY d.created_at`,
                [scene_id]
            );

            if (result.rows.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No character decisions found in scene ID: ${scene_id}`
                        }
                    ]
                };
            }

            let decisionsText = `Character Decisions in Scene ${scene_id}:\n`;
            decisionsText += `Found ${result.rows.length} decision(s)\n\n`;

            result.rows.forEach((decision, index) => {
                const alternatives = JSON.parse(decision.alternatives || '[]');

                decisionsText += `${index + 1}. ${decision.character_name} - ${decision.decision_description}\n`;
                decisionsText += `   Decision ID: ${decision.id}\n`;
                decisionsText += `   Book: ${decision.book_title}\n`;
                if (decision.chapter_number) {
                    decisionsText += `   Chapter: ${decision.chapter_number}${decision.chapter_title ? ` - ${decision.chapter_title}` : ''}\n`;
                }
                decisionsText += `   Character Version: ${decision.character_version}\n`;
                decisionsText += `   NPE Alignment: Goals=${decision.aligned_with_goals ? '✓' : '✗'}, ` +
                                `Fears=${decision.aligned_with_fears ? '✓' : '✗'}, ` +
                                `Wounds=${decision.aligned_with_wounds ? '✓' : '✗'}\n`;
                decisionsText += `   Alternatives (${decision.alternatives_count}):\n`;
                alternatives.forEach((alt, i) => {
                    decisionsText += `     ${i + 1}. ${alt}\n`;
                });
                if (decision.immediate_consequence) {
                    decisionsText += `   Consequence: ${decision.immediate_consequence}\n`;
                }
                if (decision.npe_compliant !== null) {
                    decisionsText += `   NPE Compliant: ${decision.npe_compliant ? '✓ Yes' : '✗ No'}\n`;
                }
                decisionsText += `\n`;
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: decisionsText
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to get character decisions in scene: ${error.message}`);
        }
    }

    // =============================================
    // UTILITY METHODS
    // =============================================

    async getDecisionById(decision_id) {
        try {
            const query = `
                SELECT d.*, c.name as character_name, b.title as book_title
                FROM npe_character_decisions d
                JOIN characters c ON d.character_id = c.id
                JOIN books b ON d.book_id = b.id
                WHERE d.id = $1
            `;
            const result = await this.db.query(query, [decision_id]);
            return result.rows[0] || null;
        } catch (error) {
            throw new Error(`Failed to get decision by ID: ${error.message}`);
        }
    }
}
