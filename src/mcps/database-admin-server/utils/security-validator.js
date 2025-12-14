// src/mcps/database-admin-server/utils/security-validator.js
// Security and validation utilities for database operations
// Prevents SQL injection through strict whitelisting

/**
 * Table and column whitelist configuration
 * SECURITY: Only tables and columns listed here can be accessed
 * Add new tables/columns here as needed
 */
export const WHITELIST = {
    // Core entities
    authors: ['id', 'name', 'bio', 'created_at', 'updated_at'],
    series: ['id', 'title', 'author_id', 'description', 'start_year', 'status', 'created_at', 'updated_at'],
    books: ['id', 'series_id', 'title', 'author_id', 'description', 'publication_year', 'status', 'book_order', 'created_at', 'updated_at'],
    chapters: ['id', 'book_id', 'chapter_number', 'title', 'content', 'word_count', 'status', 'created_at', 'updated_at'],
    scenes: ['id', 'chapter_id', 'scene_number', 'title', 'content', 'word_count', 'pov_character_id', 'location_id', 'created_at', 'updated_at'],

    // Character management
    characters: ['id', 'series_id', 'name', 'role', 'description', 'appearance', 'personality', 'backstory', 'goals', 'created_at', 'updated_at'],
    character_arcs: ['id', 'character_id', 'book_id', 'arc_type', 'description', 'starting_state', 'ending_state', 'created_at', 'updated_at'],
    character_relationships: ['id', 'character_id', 'related_character_id', 'relationship_type', 'description', 'status', 'created_at', 'updated_at'],
    character_timeline_events: ['id', 'character_id', 'event_date', 'event_type', 'description', 'chapter_id', 'created_at', 'updated_at'],
    character_knowledge: ['id', 'character_id', 'knowledge_type', 'description', 'acquired_chapter_id', 'created_at', 'updated_at'],

    // World building
    locations: ['id', 'series_id', 'name', 'type', 'description', 'parent_location_id', 'created_at', 'updated_at'],
    world_elements: ['id', 'series_id', 'element_type', 'name', 'description', 'created_at', 'updated_at'],
    organizations: ['id', 'series_id', 'name', 'type', 'description', 'created_at', 'updated_at'],

    // Plot and story elements
    plot_threads: ['id', 'series_id', 'book_id', 'thread_type', 'title', 'description', 'status', 'resolution', 'created_at', 'updated_at'],
    tropes: ['id', 'trope_name', 'category', 'description', 'created_at', 'updated_at'],

    // Metadata and lookup tables
    genres: ['id', 'genre_name', 'description', 'parent_genre_id'],
    lookup_values: ['id', 'lookup_type', 'value', 'display_order', 'is_active'],

    // Junction tables
    series_genres: ['series_id', 'genre_id'],
    book_genres: ['book_id', 'genre_id'],
    book_tropes: ['book_id', 'trope_id', 'prominence'],
    character_scenes: ['character_id', 'scene_id', 'role'],

    // Session and export tables
    writing_sessions: ['id', 'book_id', 'chapter_id', 'session_date', 'words_written', 'notes', 'created_at'],
    exports: ['id', 'book_id', 'export_format', 'file_path', 'status', 'created_at', 'updated_at'],

    // Security and audit tables
    audit_logs: ['id', 'timestamp', 'operation', 'table_name', 'record_id', 'user_id', 'client_info', 'changes', 'success', 'error_message', 'execution_time_ms', 'query_hash'],

    // NPE (Narrative Physics Engine) tables
    npe_causality_chains: ['id', 'series_id', 'book_id', 'chain_name', 'chain_description', 'initiating_decision_id', 'initiating_character_id', 'start_chapter_id', 'start_scene_id', 'final_outcome_id', 'end_chapter_id', 'end_scene_id', 'chain_type', 'strength', 'active_chapters', 'is_complete', 'has_character_agency', 'npe_compliant', 'validation_notes', 'created_at', 'updated_at'],
    npe_causal_links: ['id', 'chain_id', 'cause_event_id', 'cause_type', 'cause_description', 'cause_chapter_id', 'cause_scene_id', 'effect_event_id', 'effect_type', 'effect_description', 'effect_chapter_id', 'effect_scene_id', 'link_type', 'strength', 'delay_chapters', 'character_agency', 'mediating_factors', 'created_at'],
    npe_character_decisions: ['id', 'character_id', 'book_id', 'chapter_id', 'scene_id', 'decision_description', 'decision_timestamp', 'aligned_with_goals', 'aligned_with_fears', 'aligned_with_wounds', 'aligned_with_biases', 'aligned_with_relationships', 'alignment_notes', 'alternatives_count', 'alternatives', 'why_this_choice', 'character_version', 'context_state', 'active_behavioral_palette', 'operating_on_incomplete_info', 'known_information', 'unknown_information', 'misinterpretations', 'immediate_consequence', 'consequence_event_id', 'npe_compliant', 'violations', 'created_at', 'updated_at'],
    npe_scene_validation: ['id', 'scene_id', 'book_id', 'chapter_id', 'has_character_intention', 'intention_description', 'has_obstacle', 'obstacle_description', 'has_pivot', 'pivot_type', 'pivot_description', 'has_consequence', 'consequence_description', 'consequence_alters_next_scene', 'should_be_summarized', 'scene_length_category', 'word_count', 'time_treatment', 'time_treatment_justified', 'time_treatment_reason', 'energy_modulation', 'has_dialogue', 'dialogue_has_subtext', 'avoids_echolalia', 'characters_talk_at_cross_purposes', 'dialogue_is_strategy', 'dialogue_violations', 'pov_character_id', 'pov_is_subjective', 'pov_has_bias', 'pov_misreads_events', 'pov_selective_sensory_detail', 'reveals_information', 'information_alters_choice', 'information_content', 'npe_compliance_score', 'violations', 'recommendations', 'validated_at'],
    npe_pacing_analysis: ['id', 'book_id', 'chapter_id', 'scene_count', 'avg_scene_length', 'scene_length_variance', 'tension_count', 'release_count', 'tension_release_ratio', 'quiet_count', 'loud_count', 'interior_count', 'exterior_count', 'conflict_count', 'connection_count', 'expanded_time_count', 'compressed_time_count', 'real_time_count', 'monotonous_pacing', 'energy_modulation_present', 'pacing_notes', 'analyzed_at'],
    npe_stakes_pressure: ['id', 'book_id', 'chapter_id', 'scene_id', 'pressure_level', 'reduces_options', 'options_before', 'options_after', 'adds_cost', 'cost_description', 'exposes_flaw', 'flaw_exposed', 'tests_loyalty_or_belief', 'loyalty_belief_tested', 'pushes_toward_painful_truth', 'truth_approached', 'escalation_justified', 'npe_compliant', 'tracked_at'],
    npe_information_economy: ['id', 'book_id', 'scene_id', 'information_content', 'information_type', 'alters_character_choice', 'character_affected_id', 'choice_altered', 'reveal_method', 'optimal_timing', 'too_early', 'too_late', 'npe_compliant', 'violation_notes', 'revealed_at'],
    npe_relationship_tension: ['id', 'relationship_arc_id', 'chapter_id', 'scene_id', 'character_a_id', 'character_b_id', 'a_to_b_tension', 'b_to_a_tension', 'connection_strength', 'friction_strength', 'trigger_event', 'caused_by_character_action', 'character_action_id', 'tension_change_a_to_b', 'tension_change_b_to_a', 'physics_rule_applied', 'tracked_at'],
    npe_compliance_summary: ['id', 'book_id', 'chapter_id', 'plot_mechanics_score', 'character_logic_score', 'pacing_score', 'scene_architecture_score', 'dialogue_physics_score', 'pov_physics_score', 'transitions_score', 'information_economy_score', 'stakes_pressure_score', 'offstage_narrative_score', 'overall_npe_score', 'critical_violations', 'warning_violations', 'minor_violations', 'violations_detail', 'compliant', 'recommendations', 'calculated_at'],

    // Workflow Management tables
    workflow_definitions: ['id', 'name', 'version', 'description', 'graph_json', 'dependencies_json', 'phases_json', 'created_at', 'updated_at', 'created_by', 'is_system', 'tags', 'marketplace_metadata'],
    workflow_versions: ['id', 'workflow_def_id', 'version', 'definition_json', 'created_at', 'created_by', 'changelog', 'parent_version'],
    workflow_version_locks: ['id', 'workflow_def_id', 'version', 'locked_by_instance_id', 'locked_at'],
    workflow_instances: ['id', 'workflow_def_id', 'workflow_version', 'total_phases', 'series_id', 'author_id', 'current_phase', 'phase_status', 'current_book', 'created_at', 'updated_at'],
    workflow_phase_history: ['id', 'instance_id', 'phase_number', 'phase_name', 'started_at', 'completed_at', 'status', 'output', 'error', 'claude_code_session', 'skill_invoked', 'output_json'],
    sub_workflow_executions: ['id', 'parent_instance_id', 'parent_phase_number', 'sub_workflow_def_id', 'sub_workflow_version', 'status', 'started_at', 'completed_at', 'output_json', 'error', 'created_at'],
    workflow_imports: ['id', 'workflow_def_id', 'source_type', 'source_path', 'imported_at', 'imported_by', 'installation_log'],

    // Database management tables
    migrations: ['id', 'filename', 'run_on']
};

/**
 * Tables that support soft delete (have deleted_at column)
 */
export const SOFT_DELETE_TABLES = new Set([
    'books',
    'chapters',
    'scenes',
    'characters',
    'locations',
    'world_elements',
    'organizations',
    'plot_threads'
]);

/**
 * Read-only tables that cannot be modified via these tools
 */
export const READ_ONLY_TABLES = new Set([
    'genres',
    'lookup_values',
    'audit_logs'  // Audit logs can only be written by the audit logger
]);

/**
 * SecurityValidator class
 * Provides methods to validate and sanitize database operations
 */
export class SecurityValidator {
    /**
     * Validate table name against whitelist
     * @param {string} table - Table name to validate
     * @throws {Error} If table is not whitelisted
     */
    static validateTable(table) {
        if (!table || typeof table !== 'string') {
            throw new Error('Table name must be a non-empty string');
        }

        // Prevent SQL injection attempts
        if (!/^[a-z_]+$/.test(table)) {
            throw new Error(`Invalid table name format: ${table}. Only lowercase letters and underscores allowed.`);
        }

        if (!WHITELIST[table]) {
            throw new Error(`Table '${table}' is not whitelisted. Available tables: ${Object.keys(WHITELIST).join(', ')}`);
        }

        return table;
    }

    /**
     * Validate column names against whitelist for a specific table
     * @param {string} table - Table name
     * @param {string|string[]} columns - Column name(s) to validate
     * @throws {Error} If any column is not whitelisted for the table
     */
    static validateColumns(table, columns) {
        this.validateTable(table);

        const columnArray = Array.isArray(columns) ? columns : [columns];
        const whitelistedColumns = WHITELIST[table];

        for (const column of columnArray) {
            if (!column || typeof column !== 'string') {
                throw new Error('Column names must be non-empty strings');
            }

            // Prevent SQL injection attempts
            if (!/^[a-z_]+$/.test(column)) {
                throw new Error(`Invalid column name format: ${column}. Only lowercase letters and underscores allowed.`);
            }

            if (!whitelistedColumns.includes(column)) {
                throw new Error(
                    `Column '${column}' is not whitelisted for table '${table}'. ` +
                    `Available columns: ${whitelistedColumns.join(', ')}`
                );
            }
        }

        return columnArray;
    }

    /**
     * Check if table is read-only
     * @param {string} table - Table name to check
     * @throws {Error} If table is read-only
     */
    static validateNotReadOnly(table, operation = 'modify') {
        if (READ_ONLY_TABLES.has(table)) {
            throw new Error(`Cannot ${operation} table '${table}': table is read-only`);
        }
    }

    /**
     * Check if table supports soft delete
     * @param {string} table - Table name to check
     * @returns {boolean} True if table supports soft delete
     */
    static supportsSoftDelete(table) {
        return SOFT_DELETE_TABLES.has(table);
    }

    /**
     * Validate WHERE clause conditions
     * @param {string} table - Table name
     * @param {object} where - WHERE clause object
     * @returns {object} Validated WHERE clause
     */
    static validateWhereClause(table, where) {
        if (!where || typeof where !== 'object' || Array.isArray(where)) {
            throw new Error('WHERE clause must be a non-empty object');
        }

        // Extract column names from WHERE clause (handles nested operator objects)
        const columns = Object.keys(where).map(key => {
            // Remove operator prefix if present (e.g., $gt, $lt)
            return key.startsWith('$') ? null : key;
        }).filter(Boolean);

        if (columns.length === 0) {
            throw new Error('WHERE clause must contain at least one condition');
        }

        this.validateColumns(table, columns);
        return where;
    }

    /**
     * Validate data object for insert/update operations
     * @param {string} table - Table name
     * @param {object} data - Data object
     * @throws {Error} If data is invalid
     */
    static validateData(table, data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('Data must be a non-empty object');
        }

        const columns = Object.keys(data);
        if (columns.length === 0) {
            throw new Error('Data object must contain at least one field');
        }

        this.validateColumns(table, columns);
        return data;
    }

    /**
     * Sanitize order by clause
     * @param {string} table - Table name
     * @param {array} orderBy - Order by array
     * @returns {array} Validated order by array
     */
    static validateOrderBy(table, orderBy) {
        if (!orderBy) {
            return [];
        }

        if (!Array.isArray(orderBy)) {
            throw new Error('order_by must be an array');
        }

        const validatedOrderBy = [];
        for (const order of orderBy) {
            if (!order.column) {
                throw new Error('Each order_by item must have a column property');
            }

            this.validateColumns(table, [order.column]);

            const direction = (order.direction || 'ASC').toUpperCase();
            if (!['ASC', 'DESC'].includes(direction)) {
                throw new Error(`Invalid sort direction: ${direction}. Must be ASC or DESC.`);
            }

            validatedOrderBy.push({
                column: order.column,
                direction: direction
            });
        }

        return validatedOrderBy;
    }

    /**
     * Validate pagination parameters
     * @param {number} limit - Limit value
     * @param {number} offset - Offset value
     * @returns {object} Validated pagination parameters
     */
    static validatePagination(limit, offset) {
        const result = {};

        if (limit !== undefined && limit !== null) {
            const limitNum = parseInt(limit, 10);
            if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
                throw new Error('Limit must be between 1 and 1000');
            }
            result.limit = limitNum;
        }

        if (offset !== undefined && offset !== null) {
            const offsetNum = parseInt(offset, 10);
            if (isNaN(offsetNum) || offsetNum < 0) {
                throw new Error('Offset must be a non-negative integer');
            }
            result.offset = offsetNum;
        }

        return result;
    }

    /**
     * Get all whitelisted tables
     * @returns {string[]} Array of whitelisted table names
     */
    static getWhitelistedTables() {
        return Object.keys(WHITELIST);
    }

    /**
     * Get whitelisted columns for a table
     * @param {string} table - Table name
     * @returns {string[]} Array of whitelisted column names
     */
    static getWhitelistedColumns(table) {
        this.validateTable(table);
        return WHITELIST[table];
    }
}
