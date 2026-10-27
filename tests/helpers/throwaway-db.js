// Throwaway-Postgres helper for migration data-safety tests.
//
// Opt-in: set MWS_TEST_PG_URL to a superuser connection string for a DISPOSABLE
// Postgres (never a real FictionLab DB), e.g.
//   docker run -d --rm -p 127.0.0.1:55432:5432 -e POSTGRES_PASSWORD=x postgres:16-alpine
//   MWS_TEST_PG_URL=postgres://postgres:x@127.0.0.1:55432/postgres node --test tests/migrations
// Each call creates a fresh random database, loads init.sql, applies every
// migrations/*.sql whose numeric prefix is < beforeNumber, and hands back a
// client. dispose() drops the database. Without MWS_TEST_PG_URL the tests skip.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const migrationsDir = path.join(root, 'migrations');
export const pgUrl = process.env.MWS_TEST_PG_URL || null;

function withDb(url, db) {
    const u = new URL(url);
    u.pathname = '/' + db;
    return u.toString();
}

export function migrationSql(filename) {
    return fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
}

export async function createThrowawayDb(beforeNumber) {
    if (!pgUrl) throw new Error('MWS_TEST_PG_URL not set');
    const name = `mws_mig_${process.pid}_${Date.now()}`;
    const admin = new pg.Client({ connectionString: pgUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    await admin.end();

    const client = new pg.Client({ connectionString: withDb(pgUrl, name) });
    await client.connect();
    await client.query(fs.readFileSync(path.join(root, 'init.sql'), 'utf8'));
    const files = fs.readdirSync(migrationsDir).filter(f => /^\d+_.*\.sql$/.test(f)).sort();
    for (const f of files) {
        if (parseInt(f, 10) >= beforeNumber) break;
        await client.query(migrationSql(f));
    }
    return {
        client,
        async dispose() {
            await client.end();
            const a = new pg.Client({ connectionString: pgUrl });
            await a.connect();
            await a.query(`DROP DATABASE IF EXISTS ${name}`);
            await a.end();
        }
    };
}
