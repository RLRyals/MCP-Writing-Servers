// src/mcps/npe-analysis-server/schemas/npe-analysis-tools-schema.js
// Tool schemas for NPE (Narrative Physics Engine) pacing and compliance analysis

// =============================================
// NPE ANALYSIS TOOL SCHEMAS
// =============================================
export const npeAnalysisToolsSchema = [
    // =====================================
    // PACING ANALYSIS TOOLS
    // =====================================
    {
        name: 'analyze_chapter_pacing',
        description: 'Analyze pacing metrics for a chapter including scene distribution, energy modulation, and variance',
        inputSchema: {
            type: 'object',
            properties: {
                chapter_id: {
                    type: 'integer',
                    description: 'Chapter ID to analyze'
                }
            },
            required: ['chapter_id']
        }
    },
    {
        name: 'analyze_book_pacing',
        description: 'Analyze pacing across an entire book with aggregated metrics and recommendations',
        inputSchema: {
            type: 'object',
            properties: {
                book_id: {
                    type: 'integer',
                    description: 'Book ID to analyze'
                }
            },
            required: ['book_id']
        }
    },

    // =====================================
    // STAKES & PRESSURE TOOLS
    // =====================================
    {
        name: 'track_stakes_escalation',
        description: 'Track stakes escalation in a scene according to NPE Rule #9',
        inputSchema: {
            type: 'object',
            properties: {
                scene_id: {
                    type: 'integer',
                    description: 'Scene ID'
                },
                pressure_level: {
                    type: 'integer',
                    description: 'Pressure level (0-100)',
                    minimum: 0,
                    maximum: 100
                },
                reduces_options: {
                    type: 'boolean',
                    description: 'Does this scene reduce character options?'
                },
                options_before: {
                    type: 'integer',
                    description: 'Number of options before this scene'
                },
                options_after: {
                    type: 'integer',
                    description: 'Number of options after this scene'
                },
                adds_cost: {
                    type: 'boolean',
                    description: 'Does this scene add cost/consequences?'
                },
                cost_description: {
                    type: 'string',
                    description: 'Description of the cost/consequence'
                },
                exposes_flaw: {
                    type: 'boolean',
                    description: 'Does this scene expose a character flaw?'
                },
                flaw_exposed: {
                    type: 'string',
                    description: 'Description of the flaw exposed'
                },
                tests_loyalty: {
                    type: 'boolean',
                    description: 'Does this scene test loyalty or belief?'
                },
                loyalty_belief_tested: {
                    type: 'string',
                    description: 'Description of the loyalty/belief tested'
                },
                pushes_toward_truth: {
                    type: 'boolean',
                    description: 'Does this push character toward a painful truth?'
                },
                truth_approached: {
                    type: 'string',
                    description: 'Description of the truth being approached'
                }
            },
            required: ['scene_id', 'pressure_level']
        }
    },
    {
        name: 'get_pressure_trajectory',
        description: 'Get pressure levels over time for a book to visualize escalation',
        inputSchema: {
            type: 'object',
            properties: {
                book_id: {
                    type: 'integer',
                    description: 'Book ID'
                }
            },
            required: ['book_id']
        }
    },

    // =====================================
    // INFORMATION ECONOMY TOOLS
    // =====================================
    {
        name: 'log_information_reveal',
        description: 'Log an information reveal according to NPE Rule #8 (only reveal when it alters a choice)',
        inputSchema: {
            type: 'object',
            properties: {
                scene_id: {
                    type: 'integer',
                    description: 'Scene ID where information is revealed'
                },
                information_content: {
                    type: 'string',
                    description: 'The information being revealed'
                },
                information_type: {
                    type: 'string',
                    enum: ['plot_crucial', 'character_backstory', 'world_building', 'relationship_dynamic'],
                    description: 'Type of information'
                },
                alters_character_choice: {
                    type: 'boolean',
                    description: 'Does this information alter a character\'s choice? (NPE Rule #8 requirement)'
                },
                character_affected_id: {
                    type: 'integer',
                    description: 'Character ID whose choice is affected'
                },
                choice_altered: {
                    type: 'string',
                    description: 'Description of how the choice is altered'
                },
                reveal_method: {
                    type: 'string',
                    enum: ['dialogue', 'action', 'observation', 'internal_realization', 'flashback', 'external_event'],
                    description: 'How the information is revealed'
                },
                optimal_timing: {
                    type: 'boolean',
                    description: 'Is this the optimal time to reveal this information?'
                }
            },
            required: ['scene_id', 'information_content', 'alters_character_choice', 'reveal_method']
        }
    },
    {
        name: 'validate_information_economy',
        description: 'Validate that all information reveals in a book follow NPE Rule #8',
        inputSchema: {
            type: 'object',
            properties: {
                book_id: {
                    type: 'integer',
                    description: 'Book ID to validate'
                }
            },
            required: ['book_id']
        }
    },

    // =====================================
    // RELATIONSHIP TENSION TOOLS
    // =====================================
    {
        name: 'track_relationship_tension',
        description: 'Track bidirectional tension between two characters in a scene',
        inputSchema: {
            type: 'object',
            properties: {
                character_a_id: {
                    type: 'integer',
                    description: 'First character ID'
                },
                character_b_id: {
                    type: 'integer',
                    description: 'Second character ID'
                },
                scene_id: {
                    type: 'integer',
                    description: 'Scene ID'
                },
                a_to_b_tension: {
                    type: 'integer',
                    description: 'Tension from character A to B (-100 to 100)',
                    minimum: -100,
                    maximum: 100
                },
                b_to_a_tension: {
                    type: 'integer',
                    description: 'Tension from character B to A (-100 to 100)',
                    minimum: -100,
                    maximum: 100
                },
                connection_strength: {
                    type: 'integer',
                    description: 'Connection strength (0-100)',
                    minimum: 0,
                    maximum: 100
                },
                friction_strength: {
                    type: 'integer',
                    description: 'Friction strength (0-100)',
                    minimum: 0,
                    maximum: 100
                },
                trigger_event: {
                    type: 'string',
                    description: 'Event that triggered this tension change'
                },
                caused_by_character_action: {
                    type: 'boolean',
                    description: 'Was this caused by a character action (vs external event)?'
                }
            },
            required: ['character_a_id', 'character_b_id', 'scene_id', 'a_to_b_tension', 'b_to_a_tension']
        }
    },
    {
        name: 'get_relationship_tension_graph',
        description: 'Get tension trajectory between two characters across a book',
        inputSchema: {
            type: 'object',
            properties: {
                character_a_id: {
                    type: 'integer',
                    description: 'First character ID'
                },
                character_b_id: {
                    type: 'integer',
                    description: 'Second character ID'
                },
                book_id: {
                    type: 'integer',
                    description: 'Book ID'
                }
            },
            required: ['character_a_id', 'character_b_id', 'book_id']
        }
    },

    // =====================================
    // COMPLIANCE SCORING TOOLS
    // =====================================
    {
        name: 'calculate_npe_compliance',
        description: 'Calculate overall NPE compliance score for a book or chapter',
        inputSchema: {
            type: 'object',
            properties: {
                book_id: {
                    type: 'integer',
                    description: 'Book ID'
                },
                chapter_id: {
                    type: 'integer',
                    description: 'Chapter ID (optional - if not provided, calculates for entire book)'
                }
            },
            required: ['book_id']
        }
    },
    {
        name: 'get_npe_violations',
        description: 'Get all NPE rule violations for a book with severity filtering',
        inputSchema: {
            type: 'object',
            properties: {
                book_id: {
                    type: 'integer',
                    description: 'Book ID'
                },
                severity: {
                    type: 'string',
                    enum: ['critical', 'warning', 'minor', 'all'],
                    description: 'Severity filter (default: all)',
                    default: 'all'
                }
            },
            required: ['book_id']
        }
    }
];

// =============================================
// LOOKUP SYSTEM TOOL SCHEMAS
// =============================================
export const lookupSystemToolsSchema = [];
