// src/shared/field-validation.js
// Pre-INSERT/UPDATE length checks for string arguments, so an over-long value
// (e.g. a planning model writing a sentence into a short VARCHAR column) comes
// back as a clear tool error naming the field, the limit and the received
// length -- never as a bare Postgres "value too long" 500 (bead mws-1ut).

export const INVALID_PARAMS_CODE = -32602; // JSON-RPC 2.0 "Invalid params"

export class FieldValidationError extends Error {
    constructor(violations) {
        super(`Invalid arguments: ${violations
            .map(v => `${v.field}: ${v.length} characters, limit ${v.limit}`)
            .join('; ')}`);
        this.name = 'FieldValidationError';
        this.code = INVALID_PARAMS_CODE;
        this.violations = violations;
    }
}

/**
 * Collect string arguments that exceed their column length.
 * @param args    tool arguments
 * @param limits  { fieldName: maxCharacters }
 * @returns       [{ field, limit, length }]
 */
export function findLengthViolations(args, limits) {
    const violations = [];
    for (const [field, limit] of Object.entries(limits)) {
        const value = args?.[field];
        if (typeof value === 'string' && value.length > limit) {
            violations.push({ field, limit, length: value.length });
        }
    }
    return violations;
}

/** Throw FieldValidationError (all violations at once) when any string is too long. */
export function validateStringLengths(args, limits) {
    const violations = findLengthViolations(args, limits);
    if (violations.length > 0) throw new FieldValidationError(violations);
}

// Column limits (characters). Keep in sync with init.sql / migrations/066.
export const WORLD_ELEMENT_LIMITS = { name: 255, element_type: 100, rarity: 100 };
export const LOCATION_LIMITS = { name: 255, location_type: 100, climate: 100, terrain: 100 };
export const ORGANIZATION_LIMITS = { name: 255, organization_type: 100, status: 100 };
