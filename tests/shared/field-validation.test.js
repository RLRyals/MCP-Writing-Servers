// Unit tests for src/shared/field-validation.js (bead mws-1ut).
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    findLengthViolations, validateStringLengths, FieldValidationError, INVALID_PARAMS_CODE
} from '../../src/shared/field-validation.js';

describe('validateStringLengths', () => {
    it('accepts values exactly at the limit', () => {
        assert.doesNotThrow(() => validateStringLengths({ rarity: 'x'.repeat(100) }, { rarity: 100 }));
    });

    it('rejects over the limit, naming field, limit and received length', () => {
        assert.throws(
            () => validateStringLengths({ rarity: 'x'.repeat(212) }, { rarity: 50 }),
            err => err instanceof FieldValidationError
                && err.code === INVALID_PARAMS_CODE
                && /rarity: 212 characters, limit 50/.test(err.message)
        );
        assert.throws(() => validateStringLengths({ rarity: 'x'.repeat(101) }, { rarity: 100 }), /rarity: 101 characters, limit 100/);
    });

    it('reports every offending field at once', () => {
        let err;
        try {
            validateStringLengths({ name: 'a'.repeat(300), rarity: 'b'.repeat(120) }, { name: 255, rarity: 100 });
        } catch (e) { err = e; }
        assert.match(err.message, /name: 300 characters, limit 255/);
        assert.match(err.message, /rarity: 120 characters, limit 100/);
        assert.strictEqual(err.violations.length, 2);
    });

    it('ignores absent, null and non-string values', () => {
        const args = { rarity: null, name: 5, limitations: ['x'.repeat(999)] };
        assert.deepStrictEqual(findLengthViolations(args, { rarity: 1, name: 1, limitations: 1, missing: 1 }), []);
    });
});
