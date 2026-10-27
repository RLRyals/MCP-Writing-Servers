// src/mcps/plot-server/handlers/universal-genre-extensions.js
// Universal genre tools using the new schema

import { PlotValidators } from '../utils/plot-validators.js';

export class GenreExtensions {
    constructor(db) {
        this.db = db;
    }
    

    getUniversalGenreTools() {
        return [
            {
                name: 'create_information_reveal',
                description: 'Track any information reveal across all genres (evidence, secrets, backstory, world rules)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        plot_thread_id: {
                            type: 'integer',
                            description: 'Associated plot thread ID'
                        },
                        reveal_type: {
                            type: 'string',
                            enum: ['evidence', 'secret', 'backstory', 'world_rule', 'relationship', 'skill'],
                            description: 'Type of information being revealed'
                        },
                        information_content: {
                            type: 'string',
                            description: 'What information is revealed'
                        },
                        reveal_method: {
                            type: 'string',
                            description: 'How the information is revealed (discovered, confessed, witnessed, deduced)'
                        },
                        significance_level: {
                            type: 'string',
                            enum: ['minor', 'major', 'climactic', 'world_changing'],
                            description: 'Impact level of this reveal'
                        },
                        affects_characters: {
                            type: 'array',
                            items: { type: 'integer' },
                            description: 'Character IDs who learn this information'
                        },
                        revealed_in_scene_id: {
                            type: 'integer',
                            description: 'Outline scene (outline_works id) where revealed (optional; book/chapter derived from it)'
                        },
                        consequences: {
                            type: 'string',
                            description: 'What happens as a result of this reveal (optional)'
                        },
                        foreshadowing_scene_ids: {
                            type: 'array',
                            items: { type: 'integer' },
                            description: 'Outline scene ids where this was hinted at (optional)'
                        }
                    },
                    required: ['plot_thread_id', 'reveal_type', 'information_content', 'reveal_method', 'significance_level']
                }
            },
            {
                name: 'define_world_system',
                description: 'Define any systematic supernatural/advanced element with rules and limitations',
                inputSchema: {
                    type: 'object',
                    properties: {
                        series_id: {
                            type: 'integer',
                            description: 'Series ID'
                        },
                        system_name: {
                            type: 'string',
                            description: 'Name of the system'
                        },
                        system_type: {
                            type: 'string',
                            enum: ['magic', 'psionics', 'technology', 'divine', 'supernatural', 'mutation', 'alchemy'],
                            description: 'Type of system'
                        },
                        power_source: {
                            type: 'string',
                            description: 'What powers this system'
                        },
                        access_method: {
                            type: 'string',
                            description: 'How beings access/use this system'
                        },
                        limitations: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Constraints, costs, and limitations'
                        },
                        system_rules: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Governing rules and principles'
                        },
                        power_scaling: {
                            type: 'object',
                            properties: {
                                lowest_level: { type: 'string' },
                                highest_level: { type: 'string' },
                                progression_method: { type: 'string' }
                            },
                            description: 'How power levels work'
                        }
                    },
                    required: ['series_id', 'system_name', 'system_type', 'power_source', 'access_method']
                }
            },
            {
                name: 'add_reveal_evidence',
                description: 'Add specific evidence to an information reveal (universal evidence tracking)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        reveal_id: {
                            type: 'integer',
                            description: 'Information reveal ID'
                        },
                        evidence_type: {
                            type: 'string',
                            enum: ['physical', 'witness', 'circumstantial', 'digital', 'forensic'],
                            description: 'Type of evidence'
                        },
                        evidence_description: {
                            type: 'string',
                            description: 'Description of the evidence'
                        },
                        discovered_by: {
                            type: 'integer',
                            description: 'Character ID who discovered this (optional)'
                        },
                        discovery_scene_id: {
                            type: 'integer',
                            description: 'Outline scene (outline_works id) where discovered (optional)'
                        },
                        significance: {
                            type: 'string',
                            enum: ['critical', 'important', 'supporting', 'red_herring'],
                            description: 'Significance of this evidence'
                        }
                    },
                    required: ['reveal_id', 'evidence_type', 'evidence_description']
                }
            },
            {
                name: 'add_information_flow',
                description: 'Record who learns an information reveal, and in which outline scene. Set learned_by_reader=true for the reader (a reader reveal is a reveal with a reader information_flow row)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        reveal_id: { type: 'integer', description: 'Information reveal ID' },
                        learned_by_character_id: { type: 'integer', description: 'Character who learns it (omit when the learner is the reader)' },
                        learned_by_reader: { type: 'boolean', description: 'True when the reader learns it (default false)' },
                        learned_in_scene_id: { type: 'integer', description: 'Outline scene (outline_works id) where learned (optional)' },
                        learned_from_character_id: { type: 'integer', description: 'Character who told them (optional)' },
                        knowledge_level: {
                            type: 'string',
                            enum: ['complete', 'partial', 'misunderstood', 'suspected'],
                            description: 'How much they learn (default complete)'
                        },
                        learning_context: { type: 'string', description: 'Circumstances of learning (optional)' }
                    },
                    required: ['reveal_id']
                }
            },
            {
                name: 'track_system_progression',
                description: 'Track character progression within a world system',
                inputSchema: {
                    type: 'object',
                    properties: {
                        character_id: {
                            type: 'integer',
                            description: 'Character ID'
                        },
                        system_id: {
                            type: 'integer',
                            description: 'World system ID'
                        },
                        book_id: {
                            type: 'integer',
                            description: 'Book where progression occurs'
                        },
                        chapter_id: {
                            type: 'integer',
                            description: 'Chapter where progression occurs (optional)'
                        },
                        current_power_level: {
                            type: 'integer',
                            minimum: 1,
                            maximum: 10,
                            description: 'Current power level'
                        },
                        progression_method: {
                            type: 'string',
                            description: 'How they gained this power'
                        },
                        cost_or_sacrifice: {
                            type: 'string',
                            description: 'What they sacrificed to gain this power (optional)'
                        }
                    },
                    required: ['character_id', 'system_id', 'book_id', 'current_power_level']
                }
            }
        ];
    }
    
    // =============================================
    // UNIVERSAL INFORMATION REVEALS (replaces mystery-specific tools)
    // =============================================
    
    async handleCreateInformationReveal(args) {
        try {
            // Validate plot thread exists
            const threadCheck = await this.db.query(
                'SELECT id, title FROM plot_threads WHERE id = $1',
                [args.plot_thread_id]
            );
            
            if (threadCheck.rows.length === 0) {
                throw new Error(`Plot thread with ID ${args.plot_thread_id} not found`);
            }
            
            // Validate characters exist if provided
            if (args.affects_characters && args.affects_characters.length > 0) {
                const charactersCheck = await this.db.query(
                    'SELECT id, name FROM characters WHERE id = ANY($1)',
                    [args.affects_characters]
                );
                
                if (charactersCheck.rows.length !== args.affects_characters.length) {
                    throw new Error('One or more characters not found');
                }
            }
            
            await this.assertScenesExist([args.revealed_in_scene_id, ...(args.foreshadowing_scene_ids || [])]);

            // Create the information reveal
            const insertQuery = `
                INSERT INTO information_reveals (
                    plot_thread_id, reveal_type, information_content, reveal_method,
                    significance_level, affects_characters, revealed_in_scene_id,
                    consequences, foreshadowing_scene_ids
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id, created_at
            `;
            
            const result = await this.db.query(insertQuery, [
                args.plot_thread_id,
                args.reveal_type,
                args.information_content,
                args.reveal_method,
                args.significance_level,
                args.affects_characters || null,
                args.revealed_in_scene_id || null,
                args.consequences || null,
                args.foreshadowing_scene_ids || null
            ]);
            
            const thread = threadCheck.rows[0];
            
            return {
                content: [
                    {
                        type: 'text',
                        text: `Information reveal created!\n\n` +
                              `**Reveal ID:** ${result.rows[0].id}\n` +
                              `**Type:** ${args.reveal_type}\n` +
                              `**Information:** ${args.information_content}\n` +
                              `**Method:** ${args.reveal_method}\n` +
                              `**Significance:** ${args.significance_level}\n` +
                              `**Associated Thread:** "${thread.title}"\n` +
                              `${args.affects_characters?.length ? `**Affects ${args.affects_characters.length} character(s)**\n` : ''}` +
                              `${args.revealed_in_scene_id ? `**Revealed in Scene:** ${args.revealed_in_scene_id}\n` : ''}` +
                              `*This works for any genre: evidence (mystery), secrets (romance), world rules (fantasy), backstory (literary)*`
                    }
                ]
            };
            
        } catch (error) {
            throw new Error(`Failed to create information reveal: ${error.message}`);
        }
    }
    
    // =============================================
    // UNIVERSAL WORLD SYSTEMS (replaces magic-specific tools)
    // =============================================
    
    async handleDefineWorldSystem(args) {
        try {
            // Validate series exists
            const seriesCheck = await this.db.query(
                'SELECT id, title FROM series WHERE id = $1',
                [args.series_id]
            );
            
            if (seriesCheck.rows.length === 0) {
                throw new Error(`Series with ID ${args.series_id} not found`);
            }
            
            // Create the world system
            const insertQuery = `
                INSERT INTO world_systems (
                    series_id, system_name, system_type, power_source,
                    access_method, limitations, system_rules, power_scaling
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id, created_at
            `;
            
            const result = await this.db.query(insertQuery, [
                args.series_id,
                args.system_name,
                args.system_type,
                args.power_source,
                args.access_method,
                args.limitations || null,
                args.system_rules || null,
                JSON.stringify(args.power_scaling) || null
            ]);
            
            const series = seriesCheck.rows[0];
            
            return {
                content: [
                    {
                        type: 'text',
                        text: `World system defined!\n\n` +
                              `**System ID:** ${result.rows[0].id}\n` +
                              `**System Name:** ${args.system_name}\n` +
                              `**Type:** ${args.system_type}\n` +
                              `**Power Source:** ${args.power_source}\n` +
                              `**Access Method:** ${args.access_method}\n` +
                              `**Series:** "${series.title}"\n` +
                              `${args.limitations?.length ? `**Limitations:** ${args.limitations.length} defined\n` : ''}` +
                              `${args.system_rules?.length ? `**Rules:** ${args.system_rules.length} defined\n` : ''}` +
                              `*This works for: magic systems, psychic powers, advanced technology, divine systems, supernatural abilities, mutations*`
                    }
                ]
            };
            
        } catch (error) {
            throw new Error(`Failed to define world system: ${error.message}`);
        }
    }
    
    async handleGetWorldSystems(args) {
        try {
            if (!args.series_id || typeof args.series_id !== 'number' || args.series_id < 1) {
                throw new Error('series_id must be a positive number');
            }

            // Validate series exists
            const seriesCheck = await this.db.query(
                'SELECT id, title FROM series WHERE id = $1',
                [args.series_id]
            );

            if (seriesCheck.rows.length === 0) {
                throw new Error(`Series with ID ${args.series_id} not found`);
            }

            let query = `
                SELECT id, series_id, system_name, system_type, power_source,
                       access_method, limitations, system_rules, power_scaling,
                       system_users, created_at, updated_at
                FROM world_systems
                WHERE series_id = $1
            `;
            const queryParams = [args.series_id];

            if (args.system_type) {
                query += ' AND system_type = $2';
                queryParams.push(args.system_type);
            }

            query += ' ORDER BY system_name';

            const result = await this.db.query(query, queryParams);
            const systems = result.rows;

            if (systems.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No world systems found for series "${seriesCheck.rows[0].title}"${args.system_type ? ` with type "${args.system_type}"` : ''}.`
                        }
                    ]
                };
            }

            let output = `# World Systems for "${seriesCheck.rows[0].title}"\n\n`;
            output += `Found ${systems.length} system(s):\n\n`;

            systems.forEach(system => {
                output += `### ${system.system_name} (ID: ${system.id})\n`;
                output += `- **Type:** ${system.system_type}\n`;
                output += `- **Power Source:** ${system.power_source}\n`;
                output += `- **Access Method:** ${system.access_method}\n`;
                if (system.limitations && system.limitations.length > 0) {
                    output += `- **Limitations:** ${system.limitations.join('; ')}\n`;
                }
                if (system.system_rules && system.system_rules.length > 0) {
                    output += `- **Rules:** ${system.system_rules.join('; ')}\n`;
                }
                if (system.power_scaling) {
                    const scaling = typeof system.power_scaling === 'string'
                        ? JSON.parse(system.power_scaling)
                        : system.power_scaling;
                    if (scaling && (scaling.lowest_level || scaling.highest_level || scaling.progression_method)) {
                        output += `- **Power Scaling:** ${scaling.lowest_level || '?'} to ${scaling.highest_level || '?'}` +
                            `${scaling.progression_method ? ` (via ${scaling.progression_method})` : ''}\n`;
                    }
                }
                output += '\n';
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: output
                    }
                ]
            };

        } catch (error) {
            throw new Error(`Failed to get world systems: ${error.message}`);
        }
    }

    // =============================================
    // EVIDENCE AND RELATIONSHIP TRACKING
    // =============================================

    // Scene refs are outline_works ids; book/chapter are derived, never stored.
    async assertScenesExist(ids) {
        const wanted = [...new Set(ids.filter(id => id !== undefined && id !== null))];
        if (wanted.length === 0) return;
        const found = await this.db.query('SELECT id FROM outline_works WHERE id = ANY($1)', [wanted]);
        const have = new Set(found.rows.map(r => r.id));
        const missing = wanted.filter(id => !have.has(id));
        if (missing.length > 0) {
            throw new Error(`Outline scene(s) not found: ${missing.join(', ')}`);
        }
    }

    async handleAddInformationFlow(args) {
        try {
            const byReader = args.learned_by_reader === true;
            if (!byReader && !args.learned_by_character_id) {
                throw new Error('Provide learned_by_character_id, or set learned_by_reader=true');
            }
            const revealCheck = await this.db.query(
                'SELECT id FROM information_reveals WHERE id = $1', [args.reveal_id]);
            if (revealCheck.rows.length === 0) {
                throw new Error(`Information reveal with ID ${args.reveal_id} not found`);
            }
            await this.assertScenesExist([args.learned_in_scene_id]);

            const result = await this.db.query(`
                INSERT INTO information_flow (
                    reveal_id, learned_by_character_id, learned_by_reader, learned_in_scene_id,
                    learned_from_character_id, knowledge_level, learning_context
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
            `, [
                args.reveal_id,
                byReader ? null : args.learned_by_character_id,
                byReader,
                args.learned_in_scene_id || null,
                args.learned_from_character_id || null,
                args.knowledge_level || 'complete',
                args.learning_context || null
            ]);

            return {
                content: [{
                    type: 'text',
                    text: `Information flow recorded!\n\n` +
                          `**Flow ID:** ${result.rows[0].id}\n` +
                          `**Reveal:** ${args.reveal_id}\n` +
                          `**Learner:** ${byReader ? 'the reader' : `character ${args.learned_by_character_id}`}\n` +
                          `**Knowledge level:** ${args.knowledge_level || 'complete'}\n` +
                          `${args.learned_in_scene_id ? `**Learned in Scene:** ${args.learned_in_scene_id}\n` : ''}`
                }]
            };
        } catch (error) {
            throw new Error(`Failed to add information flow: ${error.message}`);
        }
    }

    async handleAddRevealEvidence(args) {
        try {
            // Validate reveal exists
            const revealCheck = await this.db.query(
                'SELECT id, information_content FROM information_reveals WHERE id = $1',
                [args.reveal_id]
            );
            
            if (revealCheck.rows.length === 0) {
                throw new Error(`Information reveal with ID ${args.reveal_id} not found`);
            }
            
            await this.assertScenesExist([args.discovery_scene_id]);

            // Create the evidence
            const insertQuery = `
                INSERT INTO reveal_evidence (
                    reveal_id, evidence_type, evidence_description,
                    discovered_by, discovery_scene_id, significance
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id, created_at
            `;
            
            const result = await this.db.query(insertQuery, [
                args.reveal_id,
                args.evidence_type,
                args.evidence_description,
                args.discovered_by || null,
                args.discovery_scene_id || null,
                args.significance || 'supporting'
            ]);
            
            return {
                content: [
                    {
                        type: 'text',
                        text: `Evidence added to information reveal!\n\n` +
                              `**Evidence ID:** ${result.rows[0].id}\n` +
                              `**Type:** ${args.evidence_type}\n` +
                              `**Description:** ${args.evidence_description}\n` +
                              `**Significance:** ${args.significance || 'supporting'}\n` +
                              `${args.discovery_scene_id ? `**Discovered in Scene:** ${args.discovery_scene_id}\n` : ''}` 
                    }
                ]
            };
            
        } catch (error) {
            throw new Error(`Failed to add evidence: ${error.message}`);
        }
    }
    
    async handleTrackSystemProgression(args) {
        try {
            // Validate character and system exist
            const checks = await Promise.all([
                this.db.query('SELECT id, name FROM characters WHERE id = $1', [args.character_id]),
                this.db.query('SELECT id, system_name FROM world_systems WHERE id = $1', [args.system_id]),
                this.db.query('SELECT id, title FROM books WHERE id = $1', [args.book_id])
            ]);
            
            if (checks[0].rows.length === 0) {
                throw new Error(`Character with ID ${args.character_id} not found`);
            }
            if (checks[1].rows.length === 0) {
                throw new Error(`World system with ID ${args.system_id} not found`);
            }
            if (checks[2].rows.length === 0) {
                throw new Error(`Book with ID ${args.book_id} not found`);
            }
            
            const character = checks[0].rows[0];
            const system = checks[1].rows[0];
            const book = checks[2].rows[0];
            
            // Create the progression entry
            const insertQuery = `
                INSERT INTO character_system_progression (
                    character_id, system_id, book_id, chapter_id,
                    current_power_level, progression_method, cost_or_sacrifice
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id, created_at
            `;
            
            const result = await this.db.query(insertQuery, [
                args.character_id,
                args.system_id,
                args.book_id,
                args.chapter_id || null,
                args.current_power_level,
                args.progression_method,
                args.cost_or_sacrifice || null
            ]);
            
            return {
                content: [
                    {
                        type: 'text',
                        text: `System progression tracked!\n\n` +
                              `**Progression ID:** ${result.rows[0].id}\n` +
                              `**Character:** ${character.name}\n` +
                              `**System:** ${system.system_name}\n` +
                              `**Book:** "${book.title}"\n` +
                              `**Power Level:** ${args.current_power_level}/10\n` +
                              `**Method:** ${args.progression_method}\n` +
                              `${args.cost_or_sacrifice ? `**Cost/Sacrifice:** ${args.cost_or_sacrifice}\n` : ''}` +
                              `${args.chapter_id ? `**Chapter:** ${args.chapter_id}\n` : ''}`
                    }
                ]
            };
            
        } catch (error) {
            throw new Error(`Failed to track system progression: ${error.message}`);
        }
    }
}