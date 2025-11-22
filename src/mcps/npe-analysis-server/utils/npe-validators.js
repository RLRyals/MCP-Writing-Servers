// src/mcps/npe-analysis-server/utils/npe-validators.js
// Validation utilities for NPE analysis operations

export class NPEValidators {
    static validatePacingAnalysis(args) {
        const errors = [];

        if (!args.chapter_id || typeof args.chapter_id !== 'number' || args.chapter_id < 1) {
            errors.push('chapter_id must be a positive integer');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    static validateBookPacingAnalysis(args) {
        const errors = [];

        if (!args.book_id || typeof args.book_id !== 'number' || args.book_id < 1) {
            errors.push('book_id must be a positive integer');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    static validateStakesTracking(args) {
        const errors = [];

        if (!args.scene_id || typeof args.scene_id !== 'number' || args.scene_id < 1) {
            errors.push('scene_id must be a positive integer');
        }

        if (args.pressure_level === undefined || args.pressure_level === null) {
            errors.push('pressure_level is required');
        } else if (typeof args.pressure_level !== 'number' || args.pressure_level < 0 || args.pressure_level > 100) {
            errors.push('pressure_level must be between 0 and 100');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    static validateInformationReveal(args) {
        const errors = [];

        if (!args.scene_id || typeof args.scene_id !== 'number' || args.scene_id < 1) {
            errors.push('scene_id must be a positive integer');
        }

        if (!args.information_content || typeof args.information_content !== 'string') {
            errors.push('information_content must be a non-empty string');
        }

        if (typeof args.alters_character_choice !== 'boolean') {
            errors.push('alters_character_choice must be a boolean');
        }

        if (!args.reveal_method || typeof args.reveal_method !== 'string') {
            errors.push('reveal_method must be a non-empty string');
        }

        // NPE Rule #8: Information should only be revealed when it alters a choice
        if (args.alters_character_choice && !args.character_affected_id) {
            errors.push('character_affected_id is required when alters_character_choice is true');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    static validateRelationshipTension(args) {
        const errors = [];

        if (!args.character_a_id || typeof args.character_a_id !== 'number' || args.character_a_id < 1) {
            errors.push('character_a_id must be a positive integer');
        }

        if (!args.character_b_id || typeof args.character_b_id !== 'number' || args.character_b_id < 1) {
            errors.push('character_b_id must be a positive integer');
        }

        if (args.character_a_id === args.character_b_id) {
            errors.push('character_a_id and character_b_id must be different');
        }

        if (!args.scene_id || typeof args.scene_id !== 'number' || args.scene_id < 1) {
            errors.push('scene_id must be a positive integer');
        }

        if (args.a_to_b_tension === undefined || args.a_to_b_tension === null) {
            errors.push('a_to_b_tension is required');
        } else if (typeof args.a_to_b_tension !== 'number' || args.a_to_b_tension < -100 || args.a_to_b_tension > 100) {
            errors.push('a_to_b_tension must be between -100 and 100');
        }

        if (args.b_to_a_tension === undefined || args.b_to_a_tension === null) {
            errors.push('b_to_a_tension is required');
        } else if (typeof args.b_to_a_tension !== 'number' || args.b_to_a_tension < -100 || args.b_to_a_tension > 100) {
            errors.push('b_to_a_tension must be between -100 and 100');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    static validateComplianceCalculation(args) {
        const errors = [];

        if (!args.book_id || typeof args.book_id !== 'number' || args.book_id < 1) {
            errors.push('book_id must be a positive integer');
        }

        if (args.chapter_id && (typeof args.chapter_id !== 'number' || args.chapter_id < 1)) {
            errors.push('chapter_id must be a positive integer if provided');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}
