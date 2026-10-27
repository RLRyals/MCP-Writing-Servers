// Guard (Rebecca's ruling 2026-10-27): schema changes never lose data already in
// the table. Every migration numbered >= 062 must not drop/truncate/retype/rename
// existing columns or tables, and must not DELETE rows without an explicit
// `-- data-safe:` justification on the same or preceding line. Deprecate and keep
// (COMMENT ON COLUMN ... DEPRECATED), copy forward, drop only in a later migration
// once the data is confirmed migrated or empty.
//
// This is a static scan of the SQL text; the data-survival tests next to it
// execute the SQL against a throwaway Postgres when MWS_TEST_PG_URL is set.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');
const FIRST_GUARDED = 62;

const FORBIDDEN = [
    [/\bDROP\s+COLUMN\b/i, 'DROP COLUMN'],
    [/\bDROP\s+TABLE\b/i, 'DROP TABLE'],
    [/\bTRUNCATE\b/i, 'TRUNCATE'],
    [/\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i, 'ALTER COLUMN TYPE'],
    [/\bRENAME\s+(COLUMN|TO)\b/i, 'RENAME'],
];

function stripComments(sql) {
    return sql.split('\n').map(l => l.replace(/--.*$/, ''));
}

describe('migration data-safety guard (>= 062)', () => {
    const files = fs.readdirSync(dir)
        .filter(f => /^\d+_.*\.sql$/.test(f) && parseInt(f, 10) >= FIRST_GUARDED)
        .sort();

    it('finds migrations to scan', () => assert.ok(files.length > 0));

    for (const f of files) {
        it(`${f} does not destroy existing data`, () => {
            const raw = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
            const code = stripComments(raw.join('\n'));
            const problems = [];
            code.forEach((line, i) => {
                for (const [re, label] of FORBIDDEN) {
                    if (re.test(line)) problems.push(`line ${i + 1}: ${label}: ${raw[i].trim()}`);
                }
                if (/\bDELETE\s+FROM\b/i.test(line)) {
                    const marked = /--\s*data-safe:/i.test(raw[i]) || (i > 0 && /--\s*data-safe:/i.test(raw[i - 1]));
                    if (!marked) problems.push(`line ${i + 1}: unguarded DELETE (add a "-- data-safe: <why>" comment): ${raw[i].trim()}`);
                }
            });
            assert.deepStrictEqual(problems, []);
        });
    }
});
