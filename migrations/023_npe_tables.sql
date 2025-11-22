-- =============================================
-- Migration 023: NPE (Narrative Physics Engine) Tables
-- =============================================
-- This migration adds tables for tracking narrative causality,
-- character decisions, scene validation, and POV bias tracking
-- according to NPE (Narrative Physics Engine) principles.
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

-- Causality Chain Tracking
CREATE TABLE IF NOT EXISTS npe_causality_chains (
    id TEXT PRIMARY KEY,
    book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
    chain_name TEXT,
    initiating_decision TEXT,  -- Character decision that started this
    character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
    chapter_id_start INTEGER,
    chapter_id_end INTEGER,
    chain_type TEXT,  -- linear, branching, convergent
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS npe_causal_links (
    id TEXT PRIMARY KEY,
    chain_id TEXT REFERENCES npe_causality_chains(id) ON DELETE CASCADE,
    cause_event_id TEXT,
    effect_event_id TEXT,
    link_type TEXT,  -- direct, indirect
    character_action TEXT,  -- What character DID
    consequence TEXT,       -- What HAPPENED
    alternatives_considered TEXT,  -- JSON array of plausible alternatives
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Character Decision Tracking
CREATE TABLE IF NOT EXISTS npe_character_decisions (
    id TEXT PRIMARY KEY,
    character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
    chapter_id INTEGER,
    scene_id INTEGER REFERENCES chapter_scenes(id) ON DELETE CASCADE,
    decision_description TEXT,

    -- NPE Alignment Checks
    aligned_with_goals BOOLEAN,
    aligned_with_fears BOOLEAN,
    aligned_with_wounds BOOLEAN,
    aligned_with_biases BOOLEAN,
    aligned_with_relationships BOOLEAN,

    -- NPE Alternatives
    alternatives_count INTEGER,  -- Must be 2-3
    alternatives TEXT,  -- JSON array

    -- Character State at Decision
    character_version TEXT,  -- V1, V2, V3, V4
    context_state TEXT,      -- baseline, mild_stress, extreme_stress

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scene NPE Compliance
CREATE TABLE IF NOT EXISTS npe_scene_validation (
    id TEXT PRIMARY KEY,
    scene_id INTEGER REFERENCES chapter_scenes(id) ON DELETE CASCADE,

    -- Scene Architecture (NPE Rule #4)
    has_character_intention BOOLEAN,
    has_obstacle BOOLEAN,
    has_pivot BOOLEAN,
    has_consequence BOOLEAN,

    -- Pacing (NPE Rule #3)
    time_expansion_justified BOOLEAN,
    scene_length_category TEXT,  -- micro, medium, centerpiece
    energy_modulation TEXT,       -- tension/release, quiet/loud, etc.

    -- Dialogue Physics (NPE Rule #5)
    has_subtext BOOLEAN,
    avoids_echolalia BOOLEAN,

    -- Information Economy (NPE Rule #8)
    reveals_alter_choice BOOLEAN,

    -- Overall NPE Score
    npe_compliance_score DECIMAL,
    violations TEXT,  -- JSON array of violations

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- POV Bias Tracking
CREATE TABLE IF NOT EXISTS npe_pov_state (
    id TEXT PRIMARY KEY,
    scene_id INTEGER REFERENCES chapter_scenes(id) ON DELETE CASCADE,
    pov_character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,

    -- POV Physics (NPE Rule #6)
    has_subjective_bias BOOLEAN,
    misreads_events BOOLEAN,
    selective_sensory_detail TEXT,  -- What they notice vs ignore
    operating_system_revealed BOOLEAN,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create triggers for automatic timestamp updates
DROP TRIGGER IF EXISTS update_npe_causality_chains_timestamp ON npe_causality_chains;
CREATE TRIGGER update_npe_causality_chains_timestamp
    BEFORE UPDATE ON npe_causality_chains
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_npe_causal_links_timestamp ON npe_causal_links;
CREATE TRIGGER update_npe_causal_links_timestamp
    BEFORE UPDATE ON npe_causal_links
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_npe_character_decisions_timestamp ON npe_character_decisions;
CREATE TRIGGER update_npe_character_decisions_timestamp
    BEFORE UPDATE ON npe_character_decisions
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_npe_scene_validation_timestamp ON npe_scene_validation;
CREATE TRIGGER update_npe_scene_validation_timestamp
    BEFORE UPDATE ON npe_scene_validation
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_npe_pov_state_timestamp ON npe_pov_state;
CREATE TRIGGER update_npe_pov_state_timestamp
    BEFORE UPDATE ON npe_pov_state
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_npe_causality_chains_book_id ON npe_causality_chains(book_id);
CREATE INDEX IF NOT EXISTS idx_npe_causality_chains_character_id ON npe_causality_chains(character_id);
CREATE INDEX IF NOT EXISTS idx_npe_causal_links_chain_id ON npe_causal_links(chain_id);
CREATE INDEX IF NOT EXISTS idx_npe_character_decisions_character_id ON npe_character_decisions(character_id);
CREATE INDEX IF NOT EXISTS idx_npe_character_decisions_scene_id ON npe_character_decisions(scene_id);
CREATE INDEX IF NOT EXISTS idx_npe_scene_validation_scene_id ON npe_scene_validation(scene_id);
CREATE INDEX IF NOT EXISTS idx_npe_pov_state_scene_id ON npe_pov_state(scene_id);
CREATE INDEX IF NOT EXISTS idx_npe_pov_state_pov_character_id ON npe_pov_state(pov_character_id);

-- Record this migration
INSERT INTO migrations (filename) VALUES ('023_npe_tables.sql')
ON CONFLICT DO NOTHING;

RAISE NOTICE 'Migration 023_npe_tables.sql completed successfully.';
END $$;
