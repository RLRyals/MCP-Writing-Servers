/**
 * @fictionlab/db - Migration Runner
 *
 * Reads numbered SQL files from a `migrations/` directory and applies any
 * that haven't been recorded in the `schema_migrations` table yet.
 *
 * This is designed so each package (core or plugin) can register its own
 * migration directory. All migrations are applied in filename order.
 *
 * Usage (from a plugin or the host app):
 *   import { runMigrations } from '@fictionlab/db/migrations'
 *   await runMigrations(pool, { dirs: [new URL('./migrations', import.meta.url).pathname] })
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Path to this package's own migrations folder */
const CORE_MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

/**
 * Ensure the schema_migrations tracking table exists.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
async function ensureMigrationsTable(db) {
    await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          SERIAL PRIMARY KEY,
      filename    TEXT NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * Get the list of already-applied migration filenames.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @returns {Promise<Set<string>>}
 */
async function getAppliedMigrations(db) {
    const result = await db.query('SELECT filename FROM schema_migrations ORDER BY filename');
    return new Set(result.rows.map(r => r.filename));
}

/**
 * Collect all .sql files from the given directories, sorted by filename.
 * Filenames must begin with a number prefix (e.g. 001_, 032_) to ensure ordering.
 *
 * @param {string[]} dirs
 * @returns {{ filename: string, filepath: string }[]}
 */
function collectSqlFiles(dirs) {
    const files = [];

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;

        const entries = fs.readdirSync(dir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        for (const filename of entries) {
            files.push({ filename, filepath: path.join(dir, filename) });
        }
    }

    // Sort globally by filename so numeric prefixes work across packages
    files.sort((a, b) => a.filename.localeCompare(b.filename));

    return files;
}

/**
 * Run all pending migrations.
 *
 * @param {import('pg').Pool} pool - pg Pool instance
 * @param {object} [options]
 * @param {string[]} [options.dirs] - Additional migration directories to include (e.g. from plugins)
 * @param {boolean} [options.verbose] - Log each migration as it runs
 * @returns {Promise<{ applied: string[], skipped: string[], errors: string[] }>}
 */
export async function runMigrations(pool, options = {}) {
    const { dirs = [], verbose = true } = options;

    const allDirs = [CORE_MIGRATIONS_DIR, ...dirs];
    const applied = [];
    const skipped = [];
    const errors = [];

    const client = await pool.connect();
    try {
        await ensureMigrationsTable(client);
        const alreadyApplied = await getAppliedMigrations(client);

        const sqlFiles = collectSqlFiles(allDirs);

        for (const { filename, filepath } of sqlFiles) {
            if (alreadyApplied.has(filename)) {
                skipped.push(filename);
                continue;
            }

            if (verbose) console.log(`[fictionlab/db] Applying migration: ${filename}`);

            const sql = fs.readFileSync(filepath, 'utf8');

            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query(
                    'INSERT INTO schema_migrations (filename) VALUES ($1)',
                    [filename]
                );
                await client.query('COMMIT');
                applied.push(filename);
                if (verbose) console.log(`[fictionlab/db] ✓ Applied: ${filename}`);
            } catch (err) {
                await client.query('ROLLBACK');
                const msg = `Migration failed: ${filename} — ${err.message}`;
                console.error(`[fictionlab/db] ✗ ${msg}`);
                errors.push(msg);
                // Stop on first error to avoid cascading failures
                break;
            }
        }
    } finally {
        client.release();
    }

    if (verbose) {
        console.log(
            `[fictionlab/db] Migrations complete: ${applied.length} applied, ${skipped.length} already up to date` +
            (errors.length ? `, ${errors.length} failed` : '')
        );
    }

    if (errors.length > 0) {
        throw new Error(`Migration failed:\n${errors.join('\n')}`);
    }

    return { applied, skipped, errors };
}
