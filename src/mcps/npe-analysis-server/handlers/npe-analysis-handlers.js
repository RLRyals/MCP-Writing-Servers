// src/mcps/npe-analysis-server/handlers/npe-analysis-handlers.js
// NPE (Narrative Physics Engine) pacing and compliance analysis handlers

import { randomUUID } from 'crypto';
import { NPEValidators } from '../utils/npe-validators.js';

export class NPEAnalysisHandlers {
    constructor(db) {
        this.db = db;
    }

    // =====================================
    // PACING ANALYSIS
    // =====================================

    async handleAnalyzeChapterPacing(args) {
        try {
            const validation = NPEValidators.validatePacingAnalysis(args);
            if (!validation.valid) {
                throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
            }

            // Get chapter info
            const chapterQuery = await this.db.query(`
                SELECT c.id, c.title, c.book_id, b.title as book_title
                FROM chapters c
                JOIN books b ON c.book_id = b.id
                WHERE c.id = $1
            `, [args.chapter_id]);

            if (chapterQuery.rows.length === 0) {
                throw new Error(`Chapter with ID ${args.chapter_id} not found`);
            }

            const chapter = chapterQuery.rows[0];

            // Get all scenes in the chapter with their validation data
            const scenesQuery = await this.db.query(`
                SELECT
                    cs.id, cs.scene_number, cs.word_count,
                    sv.energy_modulation, sv.time_treatment, sv.scene_length_category
                FROM chapter_scenes cs
                LEFT JOIN npe_scene_validation sv ON cs.id = sv.scene_id
                WHERE cs.chapter_id = $1
                ORDER BY cs.scene_number
            `, [args.chapter_id]);

            const scenes = scenesQuery.rows;
            const sceneCount = scenes.length;

            if (sceneCount === 0) {
                throw new Error(`No scenes found for chapter ${args.chapter_id}`);
            }

            // Calculate pacing metrics
            const wordCounts = scenes.filter(s => s.word_count).map(s => s.word_count);
            const avgSceneLength = wordCounts.length > 0
                ? wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length
                : 0;

            // Calculate variance
            let variance = 0;
            if (wordCounts.length > 1) {
                const squaredDiffs = wordCounts.map(wc => Math.pow(wc - avgSceneLength, 2));
                variance = squaredDiffs.reduce((a, b) => a + b, 0) / wordCounts.length;
            }

            // Count energy modulation types
            const energyDistribution = {
                tension_count: 0,
                release_count: 0,
                quiet_count: 0,
                loud_count: 0,
                interior_count: 0,
                exterior_count: 0,
                conflict_count: 0,
                connection_count: 0
            };

            scenes.forEach(scene => {
                if (!scene.energy_modulation) return;

                if (scene.energy_modulation.includes('tension')) energyDistribution.tension_count++;
                if (scene.energy_modulation.includes('release')) energyDistribution.release_count++;
                if (scene.energy_modulation.includes('quiet')) energyDistribution.quiet_count++;
                if (scene.energy_modulation.includes('loud')) energyDistribution.loud_count++;
                if (scene.energy_modulation.includes('interior')) energyDistribution.interior_count++;
                if (scene.energy_modulation.includes('exterior')) energyDistribution.exterior_count++;
                if (scene.energy_modulation.includes('conflict')) energyDistribution.conflict_count++;
                if (scene.energy_modulation.includes('connection')) energyDistribution.connection_count++;
            });

            // Check for monotonous pacing (low variance, repetitive energy)
            const monotonous = variance < 1000 || (
                energyDistribution.tension_count === sceneCount ||
                energyDistribution.release_count === sceneCount
            );

            const energyModulationPresent = Object.values(energyDistribution).some(v => v > 0);

            // Generate recommendations
            const recommendations = [];
            if (monotonous) {
                recommendations.push('Pacing appears monotonous - consider varying scene lengths');
            }
            if (!energyModulationPresent) {
                recommendations.push('Energy modulation not tracked - consider adding tension/release patterns');
            }
            if (energyDistribution.tension_count > energyDistribution.release_count * 3) {
                recommendations.push('High tension ratio - consider adding release scenes for reader respite');
            }
            if (sceneCount > 10 && variance < 5000) {
                recommendations.push('Low scene length variance in long chapter - add more variety');
            }

            // Store analysis
            const analysisId = randomUUID();
            await this.db.query(`
                INSERT INTO npe_pacing_analysis (
                    id, book_id, chapter_id, scene_count, avg_scene_length, scene_length_variance,
                    tension_count, release_count, quiet_count, loud_count,
                    interior_count, exterior_count, conflict_count, connection_count,
                    monotonous_pacing, energy_modulation_present, pacing_notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            `, [
                analysisId, chapter.book_id, args.chapter_id, sceneCount, avgSceneLength, variance,
                energyDistribution.tension_count, energyDistribution.release_count,
                energyDistribution.quiet_count, energyDistribution.loud_count,
                energyDistribution.interior_count, energyDistribution.exterior_count,
                energyDistribution.conflict_count, energyDistribution.connection_count,
                monotonous, energyModulationPresent, JSON.stringify(recommendations)
            ]);

            // Format output
            let output = `# Chapter Pacing Analysis\n\n`;
            output += `**Book:** ${chapter.book_title}\n`;
            output += `**Chapter:** ${chapter.title}\n\n`;
            output += `## Scene Metrics\n`;
            output += `- **Scene Count:** ${sceneCount}\n`;
            output += `- **Average Scene Length:** ${avgSceneLength.toFixed(0)} words\n`;
            output += `- **Variance:** ${variance.toFixed(0)}\n`;
            output += `- **Monotonous:** ${monotonous ? 'Yes' : 'No'}\n\n`;

            output += `## Energy Distribution\n`;
            output += `- **Tension:** ${energyDistribution.tension_count} scenes\n`;
            output += `- **Release:** ${energyDistribution.release_count} scenes\n`;
            output += `- **Quiet:** ${energyDistribution.quiet_count} scenes\n`;
            output += `- **Loud:** ${energyDistribution.loud_count} scenes\n`;
            output += `- **Interior:** ${energyDistribution.interior_count} scenes\n`;
            output += `- **Exterior:** ${energyDistribution.exterior_count} scenes\n`;
            output += `- **Conflict:** ${energyDistribution.conflict_count} scenes\n`;
            output += `- **Connection:** ${energyDistribution.connection_count} scenes\n\n`;

            if (recommendations.length > 0) {
                output += `## Recommendations\n`;
                recommendations.forEach(rec => {
                    output += `- ${rec}\n`;
                });
                output += `\n`;
            }

            output += `**Analysis ID:** ${analysisId}\n`;

            return {
                content: [{
                    type: 'text',
                    text: output
                }]
            };

        } catch (error) {
            throw new Error(`Failed to analyze chapter pacing: ${error.message}`);
        }
    }

    async handleAnalyzeBookPacing(args) {
        try {
            const validation = NPEValidators.validateBookPacingAnalysis(args);
            if (!validation.valid) {
                throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
            }

            // Get book info
            const bookQuery = await this.db.query(`
                SELECT b.id, b.title, s.title as series_title
                FROM books b
                JOIN series s ON b.series_id = s.id
                WHERE b.id = $1
            `, [args.book_id]);

            if (bookQuery.rows.length === 0) {
                throw new Error(`Book with ID ${args.book_id} not found`);
            }

            const book = bookQuery.rows[0];

            // Get all chapters and their pacing analyses
            const chaptersQuery = await this.db.query(`
                SELECT
                    c.id, c.title, c.chapter_number,
                    pa.scene_count, pa.avg_scene_length, pa.scene_length_variance,
                    pa.monotonous_pacing, pa.energy_modulation_present
                FROM chapters c
                LEFT JOIN npe_pacing_analysis pa ON c.id = pa.chapter_id
                WHERE c.book_id = $1
                ORDER BY c.chapter_number
            `, [args.book_id]);

            const chapters = chaptersQuery.rows;
            const chapterCount = chapters.length;

            if (chapterCount === 0) {
                throw new Error(`No chapters found for book ${args.book_id}`);
            }

            // Aggregate metrics
            const totalScenes = chapters.reduce((sum, c) => sum + (c.scene_count || 0), 0);
            const avgScenesPerChapter = totalScenes / chapterCount;
            const monotonousChapterCount = chapters.filter(c => c.monotonous_pacing).length;
            const chaptersWithoutEnergyModulation = chapters.filter(c => !c.energy_modulation_present).length;

            // Calculate book-level metrics
            const sceneCountVariance = this.calculateVariance(chapters.map(c => c.scene_count || 0));

            // Generate recommendations
            const recommendations = [];
            if (monotonousChapterCount > chapterCount * 0.5) {
                recommendations.push('Over half the chapters have monotonous pacing - vary scene lengths more');
            }
            if (chaptersWithoutEnergyModulation > chapterCount * 0.3) {
                recommendations.push('Many chapters lack energy modulation tracking - consider analyzing scene energy patterns');
            }
            if (sceneCountVariance < 2) {
                recommendations.push('Similar scene counts across chapters - consider varying chapter density');
            }
            if (totalScenes < chapterCount * 3) {
                recommendations.push('Low average scenes per chapter - consider if pacing is too compressed');
            }

            // Store book-level analysis
            const analysisId = randomUUID();
            await this.db.query(`
                INSERT INTO npe_pacing_analysis (
                    id, book_id, scene_count, avg_scene_length, scene_length_variance,
                    monotonous_pacing, pacing_notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                analysisId, args.book_id, totalScenes, avgScenesPerChapter, sceneCountVariance,
                monotonousChapterCount > chapterCount * 0.5,
                JSON.stringify(recommendations)
            ]);

            // Format output
            let output = `# Book Pacing Analysis\n\n`;
            output += `**Book:** ${book.title} (${book.series_title})\n\n`;
            output += `## Overall Metrics\n`;
            output += `- **Total Chapters:** ${chapterCount}\n`;
            output += `- **Total Scenes:** ${totalScenes}\n`;
            output += `- **Average Scenes per Chapter:** ${avgScenesPerChapter.toFixed(1)}\n`;
            output += `- **Chapters with Monotonous Pacing:** ${monotonousChapterCount}\n`;
            output += `- **Chapters without Energy Modulation:** ${chaptersWithoutEnergyModulation}\n\n`;

            if (recommendations.length > 0) {
                output += `## Recommendations\n`;
                recommendations.forEach(rec => {
                    output += `- ${rec}\n`;
                });
                output += `\n`;
            }

            output += `## Chapter Breakdown\n`;
            chapters.forEach(chapter => {
                output += `- **Ch ${chapter.chapter_number}: ${chapter.title}** - ${chapter.scene_count || 'N/A'} scenes`;
                if (chapter.monotonous_pacing) {
                    output += ` (monotonous)`;
                }
                output += `\n`;
            });

            output += `\n**Analysis ID:** ${analysisId}\n`;

            return {
                content: [{
                    type: 'text',
                    text: output
                }]
            };

        } catch (error) {
            throw new Error(`Failed to analyze book pacing: ${error.message}`);
        }
    }

    // =====================================
    // STAKES & PRESSURE
    // =====================================

    async handleTrackStakesEscalation(args) {
        try {
            const validation = NPEValidators.validateStakesTracking(args);
            if (!validation.valid) {
                throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
            }

            // Get scene info
            const sceneQuery = await this.db.query(`
                SELECT
                    cs.id, cs.scene_number, cs.chapter_id,
                    c.title as chapter_title, c.book_id,
                    b.title as book_title
                FROM chapter_scenes cs
                JOIN chapters c ON cs.chapter_id = c.id
                JOIN books b ON c.book_id = b.id
                WHERE cs.id = $1
            `, [args.scene_id]);

            if (sceneQuery.rows.length === 0) {
                throw new Error(`Scene with ID ${args.scene_id} not found`);
            }

            const scene = sceneQuery.rows[0];

            // Check NPE compliance
            const npeCompliant =
                args.reduces_options ||
                args.adds_cost ||
                args.exposes_flaw ||
                args.tests_loyalty ||
                args.pushes_toward_truth;

            const escalationJustified = npeCompliant && args.pressure_level >= 30;

            // Create stakes tracking record
            const stakesId = randomUUID();
            await this.db.query(`
                INSERT INTO npe_stakes_pressure (
                    id, book_id, chapter_id, scene_id, pressure_level,
                    reduces_options, options_before, options_after,
                    adds_cost, cost_description,
                    exposes_flaw, flaw_exposed,
                    tests_loyalty_or_belief, loyalty_belief_tested,
                    pushes_toward_painful_truth, truth_approached,
                    escalation_justified, npe_compliant
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            `, [
                stakesId, scene.book_id, scene.chapter_id, args.scene_id, args.pressure_level,
                args.reduces_options || false, args.options_before || null, args.options_after || null,
                args.adds_cost || false, args.cost_description || null,
                args.exposes_flaw || false, args.flaw_exposed || null,
                args.tests_loyalty || false, args.loyalty_belief_tested || null,
                args.pushes_toward_truth || false, args.truth_approached || null,
                escalationJustified, npeCompliant
            ]);

            // Format output
            let output = `# Stakes Escalation Tracked\n\n`;
            output += `**Book:** ${scene.book_title}\n`;
            output += `**Chapter:** ${scene.chapter_title}\n`;
            output += `**Scene:** #${scene.scene_number}\n\n`;
            output += `## Pressure Level: ${args.pressure_level}/100\n\n`;

            output += `## NPE Rule #9 Compliance\n`;
            if (args.reduces_options) {
                output += `- Reduces Options: ${args.options_before || '?'} → ${args.options_after || '?'}\n`;
            }
            if (args.adds_cost) {
                output += `- Adds Cost: ${args.cost_description}\n`;
            }
            if (args.exposes_flaw) {
                output += `- Exposes Flaw: ${args.flaw_exposed}\n`;
            }
            if (args.tests_loyalty) {
                output += `- Tests Loyalty/Belief: ${args.loyalty_belief_tested}\n`;
            }
            if (args.pushes_toward_truth) {
                output += `- Pushes Toward Truth: ${args.truth_approached}\n`;
            }

            output += `\n**NPE Compliant:** ${npeCompliant ? 'Yes' : 'No'}\n`;
            output += `**Escalation Justified:** ${escalationJustified ? 'Yes' : 'No'}\n`;
            output += `**Stakes ID:** ${stakesId}\n`;

            return {
                content: [{
                    type: 'text',
                    text: output
                }]
            };

        } catch (error) {
            throw new Error(`Failed to track stakes escalation: ${error.message}`);
        }
    }

    async handleGetPressureTrajectory(args) {
        try {
            if (!args.book_id || typeof args.book_id !== 'number' || args.book_id < 1) {
                throw new Error('book_id must be a positive integer');
            }

            // Get book info
            const bookQuery = await this.db.query(`
                SELECT b.id, b.title, s.title as series_title
                FROM books b
                JOIN series s ON b.series_id = s.id
                WHERE b.id = $1
            `, [args.book_id]);

            if (bookQuery.rows.length === 0) {
                throw new Error(`Book with ID ${args.book_id} not found`);
            }

            const book = bookQuery.rows[0];

            // Get all pressure points ordered by chapter and scene
            const pressureQuery = await this.db.query(`
                SELECT
                    c.chapter_number, c.title as chapter_title,
                    cs.scene_number, sp.pressure_level,
                    sp.reduces_options, sp.adds_cost, sp.exposes_flaw,
                    sp.tests_loyalty_or_belief, sp.pushes_toward_painful_truth,
                    sp.npe_compliant
                FROM npe_stakes_pressure sp
                JOIN chapters c ON sp.chapter_id = c.id
                JOIN chapter_scenes cs ON sp.scene_id = cs.id
                WHERE sp.book_id = $1
                ORDER BY c.chapter_number, cs.scene_number
            `, [args.book_id]);

            const pressurePoints = pressureQuery.rows;

            if (pressurePoints.length === 0) {
                throw new Error(`No pressure tracking data found for book ${args.book_id}`);
            }

            // Format output
            let output = `# Pressure Trajectory\n\n`;
            output += `**Book:** ${book.title} (${book.series_title})\n\n`;
            output += `## Pressure Points (${pressurePoints.length} tracked)\n\n`;

            let currentChapter = null;
            pressurePoints.forEach(point => {
                if (point.chapter_number !== currentChapter) {
                    currentChapter = point.chapter_number;
                    output += `\n### Chapter ${point.chapter_number}: ${point.chapter_title}\n`;
                }

                output += `- Scene ${point.scene_number}: **${point.pressure_level}/100**`;

                const escalations = [];
                if (point.reduces_options) escalations.push('reduces options');
                if (point.adds_cost) escalations.push('adds cost');
                if (point.exposes_flaw) escalations.push('exposes flaw');
                if (point.tests_loyalty_or_belief) escalations.push('tests loyalty');
                if (point.pushes_toward_painful_truth) escalations.push('painful truth');

                if (escalations.length > 0) {
                    output += ` (${escalations.join(', ')})`;
                }

                if (!point.npe_compliant) {
                    output += ` ⚠️ Non-compliant`;
                }

                output += `\n`;
            });

            // Calculate trajectory stats
            const avgPressure = pressurePoints.reduce((sum, p) => sum + p.pressure_level, 0) / pressurePoints.length;
            const maxPressure = Math.max(...pressurePoints.map(p => p.pressure_level));
            const minPressure = Math.min(...pressurePoints.map(p => p.pressure_level));
            const compliantCount = pressurePoints.filter(p => p.npe_compliant).length;

            output += `\n## Trajectory Statistics\n`;
            output += `- **Average Pressure:** ${avgPressure.toFixed(1)}/100\n`;
            output += `- **Max Pressure:** ${maxPressure}/100\n`;
            output += `- **Min Pressure:** ${minPressure}/100\n`;
            output += `- **NPE Compliant Scenes:** ${compliantCount}/${pressurePoints.length}\n`;

            return {
                content: [{
                    type: 'text',
                    text: output
                }]
            };

        } catch (error) {
            throw new Error(`Failed to get pressure trajectory: ${error.message}`);
        }
    }

    // =====================================
    // INFORMATION ECONOMY
    // =====================================

    async handleLogInformationReveal(args) {
        try {
            const validation = NPEValidators.validateInformationReveal(args);
            if (!validation.valid) {
                throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
            }

            // Get scene info
            const sceneQuery = await this.db.query(`
                SELECT
                    cs.id, cs.scene_number, cs.chapter_id,
                    c.title as chapter_title, c.book_id,
                    b.title as book_title
                FROM chapter_scenes cs
                JOIN chapters c ON cs.chapter_id = c.id
                JOIN books b ON c.book_id = b.id
                WHERE cs.id = $1
            `, [args.scene_id]);

            if (sceneQuery.rows.length === 0) {
                throw new Error(`Scene with ID ${args.scene_id} not found`);
            }

            const scene = sceneQuery.rows[0];

            // NPE Rule #8 check
            const npeCompliant = args.alters_character_choice;
            const violationNotes = !npeCompliant
                ? 'NPE Rule #8 Violation: Information revealed without altering a character choice'
                : null;

            // Create information economy record
            const infoId = randomUUID();
            await this.db.query(`
                INSERT INTO npe_information_economy (
                    id, book_id, scene_id, information_content, information_type,
                    alters_character_choice, character_affected_id, choice_altered,
                    reveal_method, optimal_timing, too_early, too_late,
                    npe_compliant, violation_notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `, [
                infoId, scene.book_id, args.scene_id, args.information_content, args.information_type || null,
                args.alters_character_choice, args.character_affected_id || null, args.choice_altered || null,
                args.reveal_method, args.optimal_timing || true, false, false,
                npeCompliant, violationNotes
            ]);

            // Get character name if provided
            let characterName = null;
            if (args.character_affected_id) {
                const charQuery = await this.db.query(
                    'SELECT name FROM characters WHERE id = $1',
                    [args.character_affected_id]
                );
                if (charQuery.rows.length > 0) {
                    characterName = charQuery.rows[0].name;
                }
            }

            // Format output
            let output = `# Information Reveal Logged\n\n`;
            output += `**Book:** ${scene.book_title}\n`;
            output += `**Chapter:** ${scene.chapter_title}\n`;
            output += `**Scene:** #${scene.scene_number}\n\n`;
            output += `## Information Revealed\n`;
            output += `${args.information_content}\n\n`;
            output += `**Reveal Method:** ${args.reveal_method}\n`;
            if (args.information_type) {
                output += `**Type:** ${args.information_type}\n`;
            }

            output += `\n## NPE Rule #8 Compliance\n`;
            output += `**Alters Character Choice:** ${args.alters_character_choice ? 'Yes' : 'No'}\n`;
            if (characterName) {
                output += `**Character Affected:** ${characterName}\n`;
            }
            if (args.choice_altered) {
                output += `**Choice Altered:** ${args.choice_altered}\n`;
            }

            output += `\n**NPE Compliant:** ${npeCompliant ? 'Yes' : 'No'}\n`;
            if (violationNotes) {
                output += `**Warning:** ${violationNotes}\n`;
            }
            output += `**Info ID:** ${infoId}\n`;

            return {
                content: [{
                    type: 'text',
                    text: output
                }]
            };

        } catch (error) {
            throw new Error(`Failed to log information reveal: ${error.message}`);
        }
    }

    async handleValidateInformationEconomy(args) {
        try {
            if (!args.book_id || typeof args.book_id !== 'number' || args.book_id < 1) {
                throw new Error('book_id must be a positive integer');
            }

            // Get book info
            const bookQuery = await this.db.query(`
                SELECT b.id, b.title, s.title as series_title
                FROM books b
                JOIN series s ON b.series_id = s.id
                WHERE b.id = $1
            `, [args.book_id]);

            if (bookQuery.rows.length === 0) {
                throw new Error(`Book with ID ${args.book_id} not found`);
            }

            const book = bookQuery.rows[0];

            // Get all information reveals for this book
            const revealsQuery = await this.db.query(`
                SELECT
                    ie.id, ie.information_content, ie.alters_character_choice,
                    ie.npe_compliant, ie.violation_notes, ie.too_early, ie.too_late,
                    c.chapter_number, c.title as chapter_title,
                    cs.scene_number
                FROM npe_information_economy ie
                JOIN chapter_scenes cs ON ie.scene_id = cs.id
                JOIN chapters c ON cs.chapter_id = c.id
                WHERE ie.book_id = $1
                ORDER BY c.chapter_number, cs.scene_number
            `, [args.book_id]);

            const reveals = revealsQuery.rows;

            if (reveals.length === 0) {
                return {
                    content: [{
                        type: 'text',
                        text: `# Information Economy Validation\n\n` +
                              `**Book:** ${book.title} (${book.series_title})\n\n` +
                              `No information reveals tracked for this book yet.`
                    }]
                };
            }

            // Categorize violations
            const violations = reveals.filter(r => !r.npe_compliant);
            const prematureReveals = reveals.filter(r => r.too_early);
            const missingImpact = reveals.filter(r => !r.alters_character_choice);

            // Format output
            let output = `# Information Economy Validation\n\n`;
            output += `**Book:** ${book.title} (${book.series_title})\n\n`;
            output += `## Summary\n`;
            output += `- **Total Reveals:** ${reveals.length}\n`;
            output += `- **NPE Compliant:** ${reveals.length - violations.length}\n`;
            output += `- **Violations:** ${violations.length}\n`;
            output += `- **Premature Reveals:** ${prematureReveals.length}\n`;
            output += `- **Missing Impact:** ${missingImpact.length}\n\n`;

            if (violations.length > 0) {
                output += `## NPE Rule #8 Violations\n`;
                violations.forEach(v => {
                    output += `- **Ch ${v.chapter_number}, Scene ${v.scene_number}:** ${v.information_content.substring(0, 60)}...\n`;
                    output += `  - ${v.violation_notes}\n`;
                });
                output += `\n`;
            }

            if (prematureReveals.length > 0) {
                output += `## Premature Reveals\n`;
                prematureReveals.forEach(r => {
                    output += `- **Ch ${r.chapter_number}, Scene ${r.scene_number}:** Information revealed too early\n`;
                });
                output += `\n`;
            }

            if (missingImpact.length > 0) {
                output += `## Reveals Without Character Impact\n`;
                missingImpact.forEach(r => {
                    output += `- **Ch ${r.chapter_number}, Scene ${r.scene_number}:** ${r.information_content.substring(0, 60)}...\n`;
                });
                output += `\n`;
            }

            if (violations.length === 0 && prematureReveals.length === 0 && missingImpact.length === 0) {
                output += `## Result\n`;
                output += `All information reveals follow NPE Rule #8. Each reveal alters a character's choice.\n`;
            }

            return {
                content: [{
                    type: 'text',
                    text: output
                }]
            };

        } catch (error) {
            throw new Error(`Failed to validate information economy: ${error.message}`);
        }
    }

    // =====================================
    // RELATIONSHIP TENSION
    // =====================================

    async handleTrackRelationshipTension(args) {
        try {
            const validation = NPEValidators.validateRelationshipTension(args);
            if (!validation.valid) {
                throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
            }

            // Get scene and character info
            const sceneQuery = await this.db.query(`
                SELECT
                    cs.id, cs.scene_number, cs.chapter_id,
                    c.title as chapter_title, c.book_id,
                    b.title as book_title
                FROM chapter_scenes cs
                JOIN chapters c ON cs.chapter_id = c.id
                JOIN books b ON c.book_id = b.id
                WHERE cs.id = $1
            `, [args.scene_id]);

            if (sceneQuery.rows.length === 0) {
                throw new Error(`Scene with ID ${args.scene_id} not found`);
            }

            const scene = sceneQuery.rows[0];

            // Get character names
            const charQuery = await this.db.query(`
                SELECT id, name FROM characters WHERE id = ANY($1)
            `, [[args.character_a_id, args.character_b_id]]);

            const charMap = {};
            charQuery.rows.forEach(char => {
                charMap[char.id] = char.name;
            });

            if (!charMap[args.character_a_id] || !charMap[args.character_b_id]) {
                throw new Error('One or both characters not found');
            }

            // Calculate tension changes (would need previous values in real implementation)
            const tensionChangeAtoB = args.a_to_b_tension; // Simplified
            const tensionChangeBtoA = args.b_to_a_tension; // Simplified

            // Create relationship tension record
            const tensionId = randomUUID();
            await this.db.query(`
                INSERT INTO npe_relationship_tension (
                    id, chapter_id, scene_id, character_a_id, character_b_id,
                    a_to_b_tension, b_to_a_tension,
                    connection_strength, friction_strength,
                    trigger_event, caused_by_character_action,
                    tension_change_a_to_b, tension_change_b_to_a
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `, [
                tensionId, scene.chapter_id, args.scene_id,
                args.character_a_id, args.character_b_id,
                args.a_to_b_tension, args.b_to_a_tension,
                args.connection_strength || null, args.friction_strength || null,
                args.trigger_event || null, args.caused_by_character_action || null,
                tensionChangeAtoB, tensionChangeBtoA
            ]);

            // Format output
            let output = `# Relationship Tension Tracked\n\n`;
            output += `**Book:** ${scene.book_title}\n`;
            output += `**Chapter:** ${scene.chapter_title}\n`;
            output += `**Scene:** #${scene.scene_number}\n\n`;
            output += `## Characters\n`;
            output += `**${charMap[args.character_a_id]}** ↔ **${charMap[args.character_b_id]}**\n\n`;
            output += `## Tension Levels\n`;
            output += `- **${charMap[args.character_a_id]} → ${charMap[args.character_b_id]}:** ${args.a_to_b_tension}/100\n`;
            output += `- **${charMap[args.character_b_id]} → ${charMap[args.character_a_id]}:** ${args.b_to_a_tension}/100\n\n`;

            if (args.connection_strength !== undefined) {
                output += `**Connection Strength:** ${args.connection_strength}/100\n`;
            }
            if (args.friction_strength !== undefined) {
                output += `**Friction Strength:** ${args.friction_strength}/100\n`;
            }
            if (args.trigger_event) {
                output += `**Trigger Event:** ${args.trigger_event}\n`;
            }

            output += `\n**Tension ID:** ${tensionId}\n`;

            return {
                content: [{
                    type: 'text',
                    text: output
                }]
            };

        } catch (error) {
            throw new Error(`Failed to track relationship tension: ${error.message}`);
        }
    }

    async handleGetRelationshipTensionGraph(args) {
        try {
            if (!args.character_a_id || typeof args.character_a_id !== 'number' || args.character_a_id < 1) {
                throw new Error('character_a_id must be a positive integer');
            }
            if (!args.character_b_id || typeof args.character_b_id !== 'number' || args.character_b_id < 1) {
                throw new Error('character_b_id must be a positive integer');
            }
            if (!args.book_id || typeof args.book_id !== 'number' || args.book_id < 1) {
                throw new Error('book_id must be a positive integer');
            }

            // Get book and character info
            const bookQuery = await this.db.query(`
                SELECT b.id, b.title, s.title as series_title
                FROM books b
                JOIN series s ON b.series_id = s.id
                WHERE b.id = $1
            `, [args.book_id]);

            if (bookQuery.rows.length === 0) {
                throw new Error(`Book with ID ${args.book_id} not found`);
            }

            const book = bookQuery.rows[0];

            const charQuery = await this.db.query(`
                SELECT id, name FROM characters WHERE id = ANY($1)
            `, [[args.character_a_id, args.character_b_id]]);

            const charMap = {};
            charQuery.rows.forEach(char => {
                charMap[char.id] = char.name;
            });

            // Get tension trajectory (bidirectional)
            const tensionQuery = await this.db.query(`
                SELECT
                    rt.a_to_b_tension, rt.b_to_a_tension,
                    rt.connection_strength, rt.friction_strength,
                    rt.trigger_event,
                    c.chapter_number, c.title as chapter_title,
                    cs.scene_number
                FROM npe_relationship_tension rt
                JOIN chapters c ON rt.chapter_id = c.id
                JOIN chapter_scenes cs ON rt.scene_id = cs.id
                WHERE c.book_id = $1
                  AND ((rt.character_a_id = $2 AND rt.character_b_id = $3)
                       OR (rt.character_a_id = $3 AND rt.character_b_id = $2))
                ORDER BY c.chapter_number, cs.scene_number
            `, [args.book_id, args.character_a_id, args.character_b_id]);

            const tensions = tensionQuery.rows;

            if (tensions.length === 0) {
                throw new Error(
                    `No tension data found for ${charMap[args.character_a_id]} and ${charMap[args.character_b_id]} in book ${args.book_id}`
                );
            }

            // Format output
            let output = `# Relationship Tension Graph\n\n`;
            output += `**Book:** ${book.title} (${book.series_title})\n`;
            output += `**Characters:** ${charMap[args.character_a_id]} ↔ ${charMap[args.character_b_id]}\n\n`;
            output += `## Tension Trajectory (${tensions.length} points)\n\n`;

            let currentChapter = null;
            tensions.forEach(point => {
                if (point.chapter_number !== currentChapter) {
                    currentChapter = point.chapter_number;
                    output += `\n### Chapter ${point.chapter_number}: ${point.chapter_title}\n`;
                }

                output += `- Scene ${point.scene_number}: `;
                output += `${charMap[args.character_a_id]}→${charMap[args.character_b_id]}: ${point.a_to_b_tension}, `;
                output += `${charMap[args.character_b_id]}→${charMap[args.character_a_id]}: ${point.b_to_a_tension}`;

                if (point.trigger_event) {
                    output += ` (${point.trigger_event})`;
                }

                output += `\n`;
            });

            // Calculate stats
            const avgAtoB = tensions.reduce((sum, t) => sum + t.a_to_b_tension, 0) / tensions.length;
            const avgBtoA = tensions.reduce((sum, t) => sum + t.b_to_a_tension, 0) / tensions.length;

            output += `\n## Statistics\n`;
            output += `- **Average ${charMap[args.character_a_id]}→${charMap[args.character_b_id]}:** ${avgAtoB.toFixed(1)}\n`;
            output += `- **Average ${charMap[args.character_b_id]}→${charMap[args.character_a_id]}:** ${avgBtoA.toFixed(1)}\n`;

            return {
                content: [{
                    type: 'text',
                    text: output
                }]
            };

        } catch (error) {
            throw new Error(`Failed to get relationship tension graph: ${error.message}`);
        }
    }

    // =====================================
    // COMPLIANCE SCORING
    // =====================================

    async handleCalculateNPECompliance(args) {
        try {
            const validation = NPEValidators.validateComplianceCalculation(args);
            if (!validation.valid) {
                throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
            }

            // Get book info
            const bookQuery = await this.db.query(`
                SELECT b.id, b.title, s.title as series_title
                FROM books b
                JOIN series s ON b.series_id = s.id
                WHERE b.id = $1
            `, [args.book_id]);

            if (bookQuery.rows.length === 0) {
                throw new Error(`Book with ID ${args.book_id} not found`);
            }

            const book = bookQuery.rows[0];

            // Build query based on scope
            let scopeCondition = 'WHERE sv.book_id = $1';
            let queryParams = [args.book_id];

            if (args.chapter_id) {
                scopeCondition += ' AND sv.chapter_id = $2';
                queryParams.push(args.chapter_id);
            }

            // Get scene validation data
            const scenesQuery = await this.db.query(`
                SELECT
                    sv.npe_compliance_score,
                    sv.has_character_intention, sv.has_obstacle, sv.has_pivot, sv.has_consequence,
                    sv.dialogue_has_subtext, sv.avoids_echolalia,
                    sv.pov_is_subjective, sv.pov_has_bias,
                    sv.reveals_information, sv.information_alters_choice
                FROM npe_scene_validation sv
                ${scopeCondition}
            `, queryParams);

            const scenes = scenesQuery.rows;
            const sceneCount = scenes.length;

            if (sceneCount === 0) {
                throw new Error('No scene validation data found for this scope');
            }

            // Calculate category scores
            const sceneArchitectureScore = this.calculateCategoryScore(scenes, [
                'has_character_intention', 'has_obstacle', 'has_pivot', 'has_consequence'
            ]);

            const dialoguePhysicsScore = this.calculateCategoryScore(scenes, [
                'dialogue_has_subtext', 'avoids_echolalia'
            ]);

            const povPhysicsScore = this.calculateCategoryScore(scenes, [
                'pov_is_subjective', 'pov_has_bias'
            ]);

            const informationEconomyScore = this.calculateCategoryScore(scenes, [
                'information_alters_choice'
            ]);

            // Calculate overall score
            const overallScore = (
                sceneArchitectureScore +
                dialoguePhysicsScore +
                povPhysicsScore +
                informationEconomyScore
            ) / 4;

            // Count violations (simplified - would need more data in real implementation)
            const violations = [];
            scenes.forEach((scene, idx) => {
                if (!scene.has_character_intention) {
                    violations.push({ severity: 'warning', rule: 'Scene Architecture', message: `Scene ${idx + 1} lacks character intention` });
                }
                if (!scene.information_alters_choice && scene.reveals_information) {
                    violations.push({ severity: 'critical', rule: 'Information Economy', message: `Scene ${idx + 1} reveals info without altering choice` });
                }
            });

            const criticalCount = violations.filter(v => v.severity === 'critical').length;
            const warningCount = violations.filter(v => v.severity === 'warning').length;
            const minorCount = violations.filter(v => v.severity === 'minor').length;

            const compliant = overallScore >= 0.7 && criticalCount === 0;

            // Generate recommendations
            const recommendations = [];
            if (sceneArchitectureScore < 0.7) {
                recommendations.push('Improve scene architecture: ensure all scenes have intention, obstacle, pivot, and consequence');
            }
            if (dialoguePhysicsScore < 0.7) {
                recommendations.push('Enhance dialogue physics: add subtext and avoid echolalia');
            }
            if (informationEconomyScore < 0.5) {
                recommendations.push('Fix information economy: only reveal information that alters character choices');
            }

            // Store compliance summary
            const summaryId = randomUUID();
            await this.db.query(`
                INSERT INTO npe_compliance_summary (
                    id, book_id, chapter_id,
                    scene_architecture_score, dialogue_physics_score, pov_physics_score,
                    information_economy_score, overall_npe_score,
                    critical_violations, warning_violations, minor_violations,
                    violations_detail, compliant, recommendations
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `, [
                summaryId, args.book_id, args.chapter_id || null,
                sceneArchitectureScore, dialoguePhysicsScore, povPhysicsScore,
                informationEconomyScore, overallScore,
                criticalCount, warningCount, minorCount,
                JSON.stringify(violations), compliant, JSON.stringify(recommendations)
            ]);

            // Format output
            let output = `# NPE Compliance Report\n\n`;
            output += `**Book:** ${book.title} (${book.series_title})\n`;
            if (args.chapter_id) {
                output += `**Scope:** Chapter ${args.chapter_id}\n`;
            } else {
                output += `**Scope:** Entire Book\n`;
            }
            output += `\n## Overall Score: ${(overallScore * 100).toFixed(1)}%\n`;
            output += `**Compliant:** ${compliant ? 'Yes ✓' : 'No ✗'}\n\n`;

            output += `## Category Scores\n`;
            output += `- **Scene Architecture:** ${(sceneArchitectureScore * 100).toFixed(1)}%\n`;
            output += `- **Dialogue Physics:** ${(dialoguePhysicsScore * 100).toFixed(1)}%\n`;
            output += `- **POV Physics:** ${(povPhysicsScore * 100).toFixed(1)}%\n`;
            output += `- **Information Economy:** ${(informationEconomyScore * 100).toFixed(1)}%\n\n`;

            output += `## Violations\n`;
            output += `- **Critical:** ${criticalCount}\n`;
            output += `- **Warning:** ${warningCount}\n`;
            output += `- **Minor:** ${minorCount}\n\n`;

            if (recommendations.length > 0) {
                output += `## Recommendations\n`;
                recommendations.forEach(rec => {
                    output += `- ${rec}\n`;
                });
                output += `\n`;
            }

            output += `**Summary ID:** ${summaryId}\n`;

            return {
                content: [{
                    type: 'text',
                    text: output
                }]
            };

        } catch (error) {
            throw new Error(`Failed to calculate NPE compliance: ${error.message}`);
        }
    }

    async handleGetNPEViolations(args) {
        try {
            if (!args.book_id || typeof args.book_id !== 'number' || args.book_id < 1) {
                throw new Error('book_id must be a positive integer');
            }

            const severity = args.severity || 'all';

            // Get book info
            const bookQuery = await this.db.query(`
                SELECT b.id, b.title, s.title as series_title
                FROM books b
                JOIN series s ON b.series_id = s.id
                WHERE b.id = $1
            `, [args.book_id]);

            if (bookQuery.rows.length === 0) {
                throw new Error(`Book with ID ${args.book_id} not found`);
            }

            const book = bookQuery.rows[0];

            // Get compliance summary
            const summaryQuery = await this.db.query(`
                SELECT
                    violations_detail, critical_violations, warning_violations, minor_violations
                FROM npe_compliance_summary
                WHERE book_id = $1
                ORDER BY calculated_at DESC
                LIMIT 1
            `, [args.book_id]);

            if (summaryQuery.rows.length === 0) {
                throw new Error('No compliance data found. Run calculate_npe_compliance first.');
            }

            const summary = summaryQuery.rows[0];
            const allViolations = JSON.parse(summary.violations_detail || '[]');

            // Filter by severity
            let violations = allViolations;
            if (severity !== 'all') {
                violations = allViolations.filter(v => v.severity === severity);
            }

            // Format output
            let output = `# NPE Violations Report\n\n`;
            output += `**Book:** ${book.title} (${book.series_title})\n`;
            output += `**Severity Filter:** ${severity}\n\n`;
            output += `## Summary\n`;
            output += `- **Critical:** ${summary.critical_violations}\n`;
            output += `- **Warning:** ${summary.warning_violations}\n`;
            output += `- **Minor:** ${summary.minor_violations}\n`;
            output += `- **Total:** ${allViolations.length}\n\n`;

            if (violations.length === 0) {
                output += `No violations found with severity: ${severity}\n`;
            } else {
                output += `## Violations (${violations.length})\n\n`;

                const bySeverity = {
                    critical: violations.filter(v => v.severity === 'critical'),
                    warning: violations.filter(v => v.severity === 'warning'),
                    minor: violations.filter(v => v.severity === 'minor')
                };

                if (bySeverity.critical.length > 0) {
                    output += `### Critical Violations\n`;
                    bySeverity.critical.forEach(v => {
                        output += `- **${v.rule}:** ${v.message}\n`;
                    });
                    output += `\n`;
                }

                if (bySeverity.warning.length > 0) {
                    output += `### Warning Violations\n`;
                    bySeverity.warning.forEach(v => {
                        output += `- **${v.rule}:** ${v.message}\n`;
                    });
                    output += `\n`;
                }

                if (bySeverity.minor.length > 0) {
                    output += `### Minor Violations\n`;
                    bySeverity.minor.forEach(v => {
                        output += `- **${v.rule}:** ${v.message}\n`;
                    });
                    output += `\n`;
                }
            }

            return {
                content: [{
                    type: 'text',
                    text: output
                }]
            };

        } catch (error) {
            throw new Error(`Failed to get NPE violations: ${error.message}`);
        }
    }

    // =====================================
    // UTILITY METHODS
    // =====================================

    calculateVariance(values) {
        if (values.length === 0) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    }

    calculateCategoryScore(scenes, fields) {
        if (scenes.length === 0) return 0;

        let totalScore = 0;
        let totalFields = 0;

        scenes.forEach(scene => {
            fields.forEach(field => {
                totalFields++;
                if (scene[field]) totalScore++;
            });
        });

        return totalFields > 0 ? totalScore / totalFields : 0;
    }
}
