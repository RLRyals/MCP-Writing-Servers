// src/mcps/npe-causality-server/handlers/causality-handlers.js
// NPE Causality Chain Management Handlers
// Implements the Narrative Physics Engine causality tracking specification

import { causalityToolsSchema } from '../schemas/causality-tools-schema.js';
import { randomUUID } from 'crypto';

export class CausalityHandlers {
    constructor(db) {
        this.db = db;
    }

    // =============================================
    // TOOL DEFINITIONS
    // =============================================
    getCausalityTools() {
        return causalityToolsSchema;
    }

    // =============================================
    // CAUSALITY CHAIN HANDLERS
    // =============================================

    async handleCreateCausalityChain(args) {
        try {
            const {
                series_id,
                book_id,
                chain_name,
                chain_description,
                initiating_decision_id,
                initiating_character_id,
                start_chapter_id,
                start_scene_id,
                chain_type
            } = args;

            // Generate UUID for the chain
            const chainId = randomUUID();

            // Validate book exists and belongs to series
            const bookCheck = await this.db.query(
                'SELECT id, title FROM books WHERE id = $1 AND series_id = $2',
                [book_id, series_id]
            );

            if (bookCheck.rows.length === 0) {
                throw new Error(`Book ID ${book_id} not found in series ${series_id}`);
            }

            // Validate character exists
            const characterCheck = await this.db.query(
                'SELECT id, name FROM characters WHERE id = $1',
                [initiating_character_id]
            );

            if (characterCheck.rows.length === 0) {
                throw new Error(`Character ID ${initiating_character_id} not found`);
            }

            // Insert the causality chain
            const query = `
                INSERT INTO npe_causality_chains (
                    id, series_id, book_id, chain_name, chain_description,
                    initiating_decision_id, initiating_character_id,
                    start_chapter_id, start_scene_id, chain_type,
                    is_complete, has_character_agency
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, true)
                RETURNING *
            `;

            const result = await this.db.query(query, [
                chainId,
                series_id,
                book_id,
                chain_name,
                chain_description || null,
                initiating_decision_id || null,
                initiating_character_id,
                start_chapter_id || null,
                start_scene_id || null,
                chain_type
            ]);

            const chain = result.rows[0];
            const book = bookCheck.rows[0];
            const character = characterCheck.rows[0];

            return {
                content: [
                    {
                        type: 'text',
                        text: `Created NPE causality chain successfully!\n\n` +
                              `Chain ID: ${chain.id}\n` +
                              `Name: ${chain.chain_name}\n` +
                              `Book: ${book.title}\n` +
                              `Initiating Character: ${character.name}\n` +
                              `Chain Type: ${chain.chain_type}\n` +
                              `Description: ${chain.chain_description || 'None'}\n\n` +
                              `Use this Chain ID to add causal links with add_causal_link.`
                    }
                ]
            };
        } catch (error) {
            if (error.code === '23503') {
                throw new Error('Foreign key violation: Invalid series_id, book_id, character_id, chapter_id, or scene_id');
            }
            throw new Error(`Failed to create causality chain: ${error.message}`);
        }
    }

    async handleAddCausalLink(args) {
        try {
            const {
                chain_id,
                cause_description,
                cause_type,
                cause_chapter_id,
                cause_scene_id,
                effect_description,
                effect_type,
                effect_chapter_id,
                effect_scene_id,
                link_type,
                character_agency = true,
                delay_chapters = 0,
                mediating_factors
            } = args;

            // Validate chain exists
            const chainCheck = await this.db.query(
                'SELECT id, chain_name, book_id FROM npe_causality_chains WHERE id = $1',
                [chain_id]
            );

            if (chainCheck.rows.length === 0) {
                throw new Error(`Causality chain ${chain_id} not found`);
            }

            // Generate UUIDs for cause and effect events
            const linkId = randomUUID();
            const causeEventId = randomUUID();
            const effectEventId = randomUUID();

            // Insert the causal link
            const query = `
                INSERT INTO npe_causal_links (
                    id, chain_id,
                    cause_event_id, cause_type, cause_description, cause_chapter_id, cause_scene_id,
                    effect_event_id, effect_type, effect_description, effect_chapter_id, effect_scene_id,
                    link_type, character_agency, delay_chapters, mediating_factors
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                RETURNING *
            `;

            const result = await this.db.query(query, [
                linkId,
                chain_id,
                causeEventId,
                cause_type,
                cause_description,
                cause_chapter_id || null,
                cause_scene_id || null,
                effectEventId,
                effect_type,
                effect_description,
                effect_chapter_id || null,
                effect_scene_id || null,
                link_type,
                character_agency,
                delay_chapters,
                mediating_factors || null
            ]);

            const link = result.rows[0];
            const chain = chainCheck.rows[0];

            // Update chain if agency is violated
            if (!character_agency) {
                await this.db.query(
                    'UPDATE npe_causality_chains SET has_character_agency = false WHERE id = $1',
                    [chain_id]
                );
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Added causal link successfully!\n\n` +
                              `Link ID: ${link.id}\n` +
                              `Chain: ${chain.chain_name}\n` +
                              `Link Type: ${link.link_type}\n\n` +
                              `CAUSE (${link.cause_type}):\n${link.cause_description}\n\n` +
                              `EFFECT (${link.effect_type}):\n${link.effect_description}\n\n` +
                              `Delay: ${link.delay_chapters} chapter(s)\n` +
                              `Character Agency: ${link.character_agency ? 'Maintained ✓' : 'Violated ✗'}\n\n` +
                              (link.character_agency ? '' : '⚠️  Warning: This link violates character agency (NPE Rule #2)')
                    }
                ]
            };
        } catch (error) {
            if (error.code === '23503') {
                throw new Error('Foreign key violation: Invalid chain_id, chapter_id, or scene_id');
            }
            throw new Error(`Failed to add causal link: ${error.message}`);
        }
    }

    async handleValidateCausalityChain(args) {
        try {
            const { chain_id } = args;

            // Get chain info
            const chainQuery = `
                SELECT c.*, ch.name as character_name, b.title as book_title
                FROM npe_causality_chains c
                LEFT JOIN characters ch ON c.initiating_character_id = ch.id
                LEFT JOIN books b ON c.book_id = b.id
                WHERE c.id = $1
            `;
            const chainResult = await this.db.query(chainQuery, [chain_id]);

            if (chainResult.rows.length === 0) {
                throw new Error(`Causality chain ${chain_id} not found`);
            }

            const chain = chainResult.rows[0];

            // Get all links in the chain
            const linksQuery = `
                SELECT *
                FROM npe_causal_links
                WHERE chain_id = $1
                ORDER BY created_at
            `;
            const linksResult = await this.db.query(linksQuery, [chain_id]);
            const links = linksResult.rows;

            // Validation logic
            const violations = [];
            const missing_links = [];
            let compliant = true;

            // Check 1: Chain has at least one link
            if (links.length === 0) {
                violations.push('Chain has no causal links');
                compliant = false;
            }

            // Check 2: Verify character agency throughout chain
            const agencyViolations = links.filter(link => !link.character_agency);
            if (agencyViolations.length > 0) {
                violations.push(`${agencyViolations.length} link(s) violate character agency (NPE Rule #2)`);
                compliant = false;
            }

            // Check 3: Check for effect→cause continuity
            // Build a map of effects to verify each effect has a subsequent cause (except the last one)
            if (links.length > 1) {
                const effectIds = new Set(links.map(l => l.effect_event_id));
                const causeIds = new Set(links.map(l => l.cause_event_id));

                // For linear/branching chains, check continuity
                if (chain.chain_type === 'linear' || chain.chain_type === 'branching') {
                    for (let i = 0; i < links.length - 1; i++) {
                        const currentEffect = links[i].effect_event_id;
                        // Check if this effect appears as a cause in any subsequent link
                        const hasSubsequentCause = links.some((link, idx) =>
                            idx > i && link.cause_event_id === currentEffect
                        );

                        if (!hasSubsequentCause && i < links.length - 1) {
                            missing_links.push({
                                after_link: links[i].id,
                                effect_description: links[i].effect_description,
                                issue: 'Effect does not connect to any subsequent cause'
                            });
                        }
                    }
                }
            }

            // Check 4: Verify chain completeness
            const isComplete = chain.final_outcome_id !== null && chain.end_chapter_id !== null;

            // Update chain with validation results
            const updateQuery = `
                UPDATE npe_causality_chains
                SET
                    npe_compliant = $1,
                    validation_notes = $2,
                    is_complete = $3,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $4
                RETURNING *
            `;

            const validationNotes = JSON.stringify({
                violations,
                missing_links,
                validated_at: new Date().toISOString(),
                link_count: links.length
            });

            await this.db.query(updateQuery, [
                compliant && missing_links.length === 0,
                validationNotes,
                isComplete,
                chain_id
            ]);

            // Format response
            let responseText = `NPE Causality Chain Validation\n\n` +
                              `Chain: ${chain.chain_name}\n` +
                              `Book: ${chain.book_title}\n` +
                              `Type: ${chain.chain_type}\n` +
                              `Initiating Character: ${chain.character_name}\n` +
                              `Total Links: ${links.length}\n\n`;

            if (compliant && missing_links.length === 0) {
                responseText += `✓ COMPLIANT - Chain maintains NPE principles\n\n`;
                responseText += `• All links maintain character agency\n`;
                responseText += `• No broken causality detected\n`;
                responseText += `• Chain completeness: ${isComplete ? 'Complete' : 'In progress'}\n`;
            } else {
                responseText += `✗ VIOLATIONS FOUND\n\n`;

                if (violations.length > 0) {
                    responseText += `Violations:\n`;
                    violations.forEach((v, i) => {
                        responseText += `${i + 1}. ${v}\n`;
                    });
                    responseText += `\n`;
                }

                if (missing_links.length > 0) {
                    responseText += `Missing Links:\n`;
                    missing_links.forEach((ml, i) => {
                        responseText += `${i + 1}. After "${ml.effect_description}": ${ml.issue}\n`;
                    });
                    responseText += `\n`;
                }
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: responseText
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to validate causality chain: ${error.message}`);
        }
    }

    async handleGetCausalityChainsForBook(args) {
        try {
            const { book_id, chain_type, include_links = false } = args;

            // Build query
            let query = `
                SELECT c.*, ch.name as character_name, b.title as book_title, s.title as series_title
                FROM npe_causality_chains c
                LEFT JOIN characters ch ON c.initiating_character_id = ch.id
                LEFT JOIN books b ON c.book_id = b.id
                LEFT JOIN series s ON c.series_id = s.id
                WHERE c.book_id = $1
            `;

            const params = [book_id];

            if (chain_type) {
                query += ` AND c.chain_type = $2`;
                params.push(chain_type);
            }

            query += ` ORDER BY c.created_at`;

            const result = await this.db.query(query, params);
            const chains = result.rows;

            if (chains.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No causality chains found for book ID ${book_id}${chain_type ? ` of type '${chain_type}'` : ''}`
                        }
                    ]
                };
            }

            let responseText = `Found ${chains.length} causality chain(s) for "${chains[0].book_title}"\n\n`;

            for (const chain of chains) {
                responseText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                responseText += `Chain: ${chain.chain_name}\n`;
                responseText += `ID: ${chain.id}\n`;
                responseText += `Type: ${chain.chain_type}\n`;
                responseText += `Initiating Character: ${chain.character_name}\n`;
                responseText += `Character Agency: ${chain.has_character_agency ? '✓ Maintained' : '✗ Violated'}\n`;
                responseText += `NPE Compliant: ${chain.npe_compliant === null ? 'Not validated' : (chain.npe_compliant ? 'Yes ✓' : 'No ✗')}\n`;
                responseText += `Complete: ${chain.is_complete ? 'Yes' : 'In progress'}\n`;

                if (chain.chain_description) {
                    responseText += `Description: ${chain.chain_description}\n`;
                }

                // Get link count
                const linkCount = await this.db.query(
                    'SELECT COUNT(*) as count FROM npe_causal_links WHERE chain_id = $1',
                    [chain.id]
                );
                responseText += `Links: ${linkCount.rows[0].count}\n`;

                // Include links if requested
                if (include_links) {
                    const linksResult = await this.db.query(
                        `SELECT * FROM npe_causal_links WHERE chain_id = $1 ORDER BY created_at`,
                        [chain.id]
                    );
                    const links = linksResult.rows;

                    if (links.length > 0) {
                        responseText += `\nCausal Links:\n`;
                        links.forEach((link, idx) => {
                            responseText += `  ${idx + 1}. [${link.link_type}] ${link.cause_type} → ${link.effect_type}\n`;
                            responseText += `     Cause: ${link.cause_description}\n`;
                            responseText += `     Effect: ${link.effect_description}\n`;
                            if (link.delay_chapters > 0) {
                                responseText += `     Delay: ${link.delay_chapters} chapter(s)\n`;
                            }
                            if (!link.character_agency) {
                                responseText += `     ⚠️  Agency violation\n`;
                            }
                            responseText += `\n`;
                        });
                    }
                }

                responseText += `\n`;
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: responseText
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to get causality chains: ${error.message}`);
        }
    }
}
