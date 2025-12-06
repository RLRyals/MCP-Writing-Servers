-- =============================================
-- Migration 023: NPE (Narrative Physics Engine) Tables
-- =============================================
-- This migration adds tables for tracking narrative causality,
-- character decisions, scene validation, and POV bias tracking
-- according to NPE (Narrative Physics Engine) principles.
--
-- UPDATED: This migration now establishes the FULL NPE schema
-- (consolidating previous split between 023 and 024) to avoid
-- destructive table drops.
--
-- Run this migration on existing databases with:
-- psql -U your_user -d your_database -f migrations/023_npe_tables.sql

DO $$
BEGIN
    -- Check if migration was already applied
    IF EXISTS (SELECT 1 FROM migrations WHERE filename = '023_npe_tables.sql') THEN
        RAISE NOTICE 'Migration 023_npe_tables.sql already applied, skipping.';
        RETURN;
    END IF;

-- =============================================
-- STEP 1: Create comprehensive NPE schema
-- =============================================

-- Table 1: Causality Chain Tracking
CREATE TABLE IF NOT EXISTS npe_causality_chains (
    id TEXT PRIMARY KEY,
    series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chain_name TEXT NOT NULL,
    chain_description TEXT,

    -- Starting point
    initiating_decision_id TEXT,
    initiating_character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
    start_chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
    start_scene_id INTEGER REFERENCES chapter_scenes(id) ON DELETE CASCADE,

    -- Ending point
    final_outcome_id TEXT,
    end_chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
    end_scene_id INTEGER REFERENCES chapter_scenes(id) ON DELETE CASCADE,

    -- Chain properties
    chain_type TEXT CHECK(chain_type IN ('linear', 'branching', 'convergent')),
    strength INTEGER CHECK(strength BETWEEN 0 AND 100),
    active_chapters TEXT,  -- JSON array of chapter IDs

    -- Validation
    is_complete BOOLEAN DEFAULT FALSE,
    has_character_agency BOOLEAN DEFAULT TRUE,
    npe_compliant BOOLEAN,
    validation_notes TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table 2: Causal Links
CREATE TABLE IF NOT EXISTS npe_causal_links (
    id TEXT PRIMARY KEY,
    chain_id TEXT NOT NULL REFERENCES npe_causality_chains(id) ON DELETE CASCADE,

    -- Cause
    cause_event_id TEXT NOT NULL,
    cause_type TEXT CHECK(cause_type IN ('character_decision', 'character_action', 'consequence')),
    cause_description TEXT NOT NULL,
    cause_chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    cause_scene_id INTEGER REFERENCES chapter_scenes(id) ON DELETE SET NULL,

    -- Effect
    effect_event_id TEXT NOT NULL,
    effect_type TEXT CHECK(effect_type IN ('consequence', 'doorway_of_no_return', 'escalation')),
    effect_description TEXT NOT NULL,
    effect_chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    effect_scene_id INTEGER REFERENCES chapter_scenes(id) ON DELETE SET NULL,

    -- Link properties
    link_type TEXT CHECK(link_type IN ('direct', 'indirect', 'delayed')),
    strength INTEGER CHECK(strength BETWEEN 0 AND 100),
    delay_chapters INTEGER DEFAULT 0,

    -- NPE validation
    character_agency BOOLEAN DEFAULT TRUE,
    mediating_factors TEXT,  -- JSON array of intervening events

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table 3: Character Decision Tracking
CREATE TABLE IF NOT EXISTS npe_character_decisions (
    id TEXT PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
    scene_id INTEGER REFERENCES chapter_scenes(id) ON DELETE CASCADE,

    -- Decision details
    decision_description TEXT NOT NULL,
    decision_timestamp TEXT,

    -- NPE Alignment Checks
    aligned_with_goals BOOLEAN,
    aligned_with_fears BOOLEAN,
    aligned_with_wounds BOOLEAN,
    aligned_with_biases BOOLEAN,
    aligned_with_relationships BOOLEAN,
    alignment_notes TEXT,  -- JSON object with details

    -- NPE Alternatives
    alternatives_count INTEGER CHECK(alternatives_count BETWEEN 2 AND 3),
    alternatives TEXT,  -- JSON array of plausible alternatives
    why_this_choice TEXT,

    -- Character State at Decision
    character_version TEXT CHECK(character_version IN ('V1', 'V2', 'V3', 'V4')),
    context_state TEXT CHECK(context_state IN ('baseline', 'mild_stress', 'extreme_stress')),
    active_behavioral_palette TEXT,  -- JSON object

    -- Information State
    operating_on_incomplete_info BOOLEAN DEFAULT TRUE,
    known_information TEXT,  -- JSON array
    unknown_information TEXT,  -- JSON array
    misinterpretations TEXT,  -- JSON array

    -- Consequence
    immediate_consequence TEXT,
    consequence_event_id TEXT,

    -- NPE Compliance
    npe_compliant BOOLEAN,
    violations TEXT,  -- JSON array

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table 4: Scene NPE Compliance Validation
CREATE TABLE IF NOT EXISTS npe_scene_validation (
    id TEXT PRIMARY KEY,
    scene_id INTEGER NOT NULL UNIQUE REFERENCES chapter_scenes(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,

    -- Scene Architecture (NPE Rule #4)
    has_character_intention BOOLEAN DEFAULT FALSE,
    intention_description TEXT,
    has_obstacle BOOLEAN DEFAULT FALSE,
    obstacle_description TEXT,
    has_pivot BOOLEAN DEFAULT FALSE,
    pivot_type TEXT CHECK(pivot_type IN ('power', 'information', 'emotional_truth')),
    pivot_description TEXT,
    has_consequence BOOLEAN DEFAULT FALSE,
    consequence_description TEXT,
    consequence_alters_next_scene BOOLEAN,
    should_be_summarized BOOLEAN DEFAULT FALSE,

    -- Pacing & Temporal Mechanics (NPE Rule #3)
    scene_length_category TEXT CHECK(scene_length_category IN ('micro', 'medium', 'centerpiece')),
    word_count INTEGER,
    time_treatment TEXT CHECK(time_treatment IN ('expanded', 'compressed', 'real_time')),
    time_treatment_justified BOOLEAN,
    time_treatment_reason TEXT,
    energy_modulation TEXT CHECK(energy_modulation IN (
        'tension_vs_release', 'quiet_vs_loud', 'interior_vs_exterior', 'conflict_vs_connection'
    )),

    -- Dialogue Physics (NPE Rule #5)
    has_dialogue BOOLEAN,
    dialogue_has_subtext BOOLEAN,
    avoids_echolalia BOOLEAN,
    characters_talk_at_cross_purposes BOOLEAN,
    dialogue_is_strategy BOOLEAN,
    dialogue_violations TEXT,  -- JSON array

    -- POV Physics (NPE Rule #6)
    pov_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
    pov_is_subjective BOOLEAN,
    pov_has_bias BOOLEAN,
    pov_misreads_events BOOLEAN,
    pov_selective_sensory_detail TEXT,  -- JSON object

    -- Information Economy (NPE Rule #8)
    reveals_information BOOLEAN,
    information_alters_choice BOOLEAN,
    information_content TEXT,  -- JSON array

    -- Overall NPE Compliance
    npe_compliance_score DECIMAL(3,2) CHECK(npe_compliance_score BETWEEN 0 AND 1),
    violations TEXT,  -- JSON array
    recommendations TEXT,  -- JSON array

    validated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table 5: Pacing Analysis
CREATE TABLE IF NOT EXISTS npe_pacing_analysis (
    id TEXT PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,

    -- Pacing Metrics
    scene_count INTEGER,
    avg_scene_length DECIMAL(10,2),
    scene_length_variance DECIMAL(10,2),

    -- Energy Distribution
    tension_count INTEGER,
    release_count INTEGER,
    tension_release_ratio DECIMAL(3,2),
    quiet_count INTEGER,
    loud_count INTEGER,
    interior_count INTEGER,
    exterior_count INTEGER,
    conflict_count INTEGER,
    connection_count INTEGER,

    -- Time Treatment
    expanded_time_count INTEGER,
    compressed_time_count INTEGER,
    real_time_count INTEGER,

    -- NPE Compliance
    monotonous_pacing BOOLEAN,
    energy_modulation_present BOOLEAN,
    pacing_notes TEXT,

    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table 6: Stakes & Pressure Tracking
CREATE TABLE IF NOT EXISTS npe_stakes_pressure (
    id TEXT PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    scene_id INTEGER REFERENCES chapter_scenes(id) ON DELETE CASCADE,

    -- Pressure Level (0-100)
    pressure_level INTEGER CHECK(pressure_level BETWEEN 0 AND 100),

    -- Stakes Escalation (NPE Rule #9)
    reduces_options BOOLEAN,
    options_before INTEGER,
    options_after INTEGER,
    adds_cost BOOLEAN,
    cost_description TEXT,
    exposes_flaw BOOLEAN,
    flaw_exposed TEXT,
    tests_loyalty_or_belief BOOLEAN,
    loyalty_belief_tested TEXT,
    pushes_toward_painful_truth BOOLEAN,
    truth_approached TEXT,

    -- Overall
    escalation_justified BOOLEAN,
    npe_compliant BOOLEAN,

    tracked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table 7: Information Economy Tracking
CREATE TABLE IF NOT EXISTS npe_information_economy (
    id TEXT PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    scene_id INTEGER NOT NULL REFERENCES chapter_scenes(id) ON DELETE CASCADE,

    -- Information Revealed
    information_content TEXT NOT NULL,
    information_type TEXT CHECK(information_type IN (
        'plot_crucial', 'character_backstory', 'world_building', 'relationship_dynamic'
    )),

    -- NPE Rule #8: Only reveal when it alters a choice
    alters_character_choice BOOLEAN,
    character_affected_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
    choice_altered TEXT,

    -- Reveal Method
    reveal_method TEXT CHECK(reveal_method IN (
        'dialogue', 'action', 'observation', 'internal_realization', 'flashback', 'external_event'
    )),

    -- Timing
    optimal_timing BOOLEAN,
    too_early BOOLEAN,
    too_late BOOLEAN,

    -- NPE Compliance
    npe_compliant BOOLEAN,
    violation_notes TEXT,

    revealed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table 8: Relationship Tension Tracking
CREATE TABLE IF NOT EXISTS npe_relationship_tension (
    id TEXT PRIMARY KEY,
    relationship_arc_id INTEGER REFERENCES relationship_arcs(id) ON DELETE CASCADE,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    scene_id INTEGER REFERENCES chapter_scenes(id) ON DELETE CASCADE,

    character_a_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    character_b_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,

    -- Bidirectional Tension
    a_to_b_tension INTEGER CHECK(a_to_b_tension BETWEEN -100 AND 100),
    b_to_a_tension INTEGER CHECK(b_to_a_tension BETWEEN -100 AND 100),

    -- Connection vs Friction
    connection_strength INTEGER CHECK(connection_strength BETWEEN 0 AND 100),
    friction_strength INTEGER CHECK(friction_strength BETWEEN 0 AND 100),

    -- Tension Change Causality
    trigger_event TEXT,
    caused_by_character_action BOOLEAN,
    character_action_id TEXT,

    -- Tension Physics
    tension_change_a_to_b INTEGER,
    tension_change_b_to_a INTEGER,
    physics_rule_applied TEXT,

    tracked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table 9: NPE Compliance Summary
CREATE TABLE IF NOT EXISTS npe_compliance_summary (
    id TEXT PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,

    -- Rule Category Scores (0.0 - 1.0)
    plot_mechanics_score DECIMAL(3,2),
    character_logic_score DECIMAL(3,2),
    pacing_score DECIMAL(3,2),
    scene_architecture_score DECIMAL(3,2),
    dialogue_physics_score DECIMAL(3,2),
    pov_physics_score DECIMAL(3,2),
    transitions_score DECIMAL(3,2),
    information_economy_score DECIMAL(3,2),
    stakes_pressure_score DECIMAL(3,2),
    offstage_narrative_score DECIMAL(3,2),

    -- Overall
    overall_npe_score DECIMAL(3,2),

    -- Violations
    critical_violations INTEGER DEFAULT 0,
    warning_violations INTEGER DEFAULT 0,
    minor_violations INTEGER DEFAULT 0,
    violations_detail TEXT,  -- JSON array

    -- Summary
    compliant BOOLEAN,
    recommendations TEXT,  -- JSON array

    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- STEP 2: Create triggers for timestamp updates
-- =============================================

DROP TRIGGER IF EXISTS update_npe_causality_chains_timestamp ON npe_causality_chains;
CREATE TRIGGER update_npe_causality_chains_timestamp
    BEFORE UPDATE ON npe_causality_chains
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_npe_character_decisions_timestamp ON npe_character_decisions;
CREATE TRIGGER update_npe_character_decisions_timestamp
    BEFORE UPDATE ON npe_character_decisions
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- =============================================
-- STEP 3: Create indexes for performance
-- =============================================

-- Causality chains indexes
CREATE INDEX IF NOT EXISTS idx_npe_causality_chains_series_id ON npe_causality_chains(series_id);
CREATE INDEX IF NOT EXISTS idx_npe_causality_chains_book_id ON npe_causality_chains(book_id);
CREATE INDEX IF NOT EXISTS idx_npe_causality_chains_character_id ON npe_causality_chains(initiating_character_id);
CREATE INDEX IF NOT EXISTS idx_npe_causality_chains_type ON npe_causality_chains(chain_type);

-- Causal links indexes
CREATE INDEX IF NOT EXISTS idx_npe_causal_links_chain_id ON npe_causal_links(chain_id);
CREATE INDEX IF NOT EXISTS idx_npe_causal_links_cause_scene ON npe_causal_links(cause_scene_id);
CREATE INDEX IF NOT EXISTS idx_npe_causal_links_effect_scene ON npe_causal_links(effect_scene_id);

-- Character decisions indexes
CREATE INDEX IF NOT EXISTS idx_npe_character_decisions_character_id ON npe_character_decisions(character_id);
CREATE INDEX IF NOT EXISTS idx_npe_character_decisions_book_id ON npe_character_decisions(book_id);
CREATE INDEX IF NOT EXISTS idx_npe_character_decisions_scene_id ON npe_character_decisions(scene_id);
CREATE INDEX IF NOT EXISTS idx_npe_character_decisions_version ON npe_character_decisions(character_version);

-- Scene validation indexes
CREATE INDEX IF NOT EXISTS idx_npe_scene_validation_scene_id ON npe_scene_validation(scene_id);
CREATE INDEX IF NOT EXISTS idx_npe_scene_validation_book_id ON npe_scene_validation(book_id);
CREATE INDEX IF NOT EXISTS idx_npe_scene_validation_chapter_id ON npe_scene_validation(chapter_id);
CREATE INDEX IF NOT EXISTS idx_npe_scene_validation_compliance ON npe_scene_validation(npe_compliance_score);

-- Pacing analysis indexes
CREATE INDEX IF NOT EXISTS idx_npe_pacing_analysis_book_id ON npe_pacing_analysis(book_id);
CREATE INDEX IF NOT EXISTS idx_npe_pacing_analysis_chapter_id ON npe_pacing_analysis(chapter_id);

-- Stakes pressure indexes
CREATE INDEX IF NOT EXISTS idx_npe_stakes_pressure_book_id ON npe_stakes_pressure(book_id);
CREATE INDEX IF NOT EXISTS idx_npe_stakes_pressure_chapter_id ON npe_stakes_pressure(chapter_id);
CREATE INDEX IF NOT EXISTS idx_npe_stakes_pressure_scene_id ON npe_stakes_pressure(scene_id);

-- Information economy indexes
CREATE INDEX IF NOT EXISTS idx_npe_information_economy_book_id ON npe_information_economy(book_id);
CREATE INDEX IF NOT EXISTS idx_npe_information_economy_scene_id ON npe_information_economy(scene_id);
CREATE INDEX IF NOT EXISTS idx_npe_information_economy_character ON npe_information_economy(character_affected_id);

-- Relationship tension indexes
CREATE INDEX IF NOT EXISTS idx_npe_relationship_tension_arc_id ON npe_relationship_tension(relationship_arc_id);
CREATE INDEX IF NOT EXISTS idx_npe_relationship_tension_chapter_id ON npe_relationship_tension(chapter_id);
CREATE INDEX IF NOT EXISTS idx_npe_relationship_tension_char_a ON npe_relationship_tension(character_a_id);
CREATE INDEX IF NOT EXISTS idx_npe_relationship_tension_char_b ON npe_relationship_tension(character_b_id);

-- Compliance summary indexes
CREATE INDEX IF NOT EXISTS idx_npe_compliance_summary_book_id ON npe_compliance_summary(book_id);
CREATE INDEX IF NOT EXISTS idx_npe_compliance_summary_chapter_id ON npe_compliance_summary(chapter_id);
CREATE INDEX IF NOT EXISTS idx_npe_compliance_summary_score ON npe_compliance_summary(overall_npe_score);

-- Record this migration
INSERT INTO migrations (filename) VALUES ('023_npe_tables.sql')
ON CONFLICT DO NOTHING;

RAISE NOTICE 'Migration 023_npe_tables.sql completed successfully.';
END $$;
