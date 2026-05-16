/**
 * @fictionlab/db
 *
 * Main entry point. Re-exports the database client and migration runner
 * for convenient single-import usage.
 */

export { createPool, getPool, query, transaction, healthCheck } from './db.js';
export { runMigrations } from './migrations.js';
