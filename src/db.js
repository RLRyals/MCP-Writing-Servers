/**
 * @fictionlab/db - Database Client
 *
 * Thin wrapper around pg.Pool providing query, transaction, and
 * health-check helpers. Consumed by MCP servers and plugins.
 *
 * Usage:
 *   import { createPool, getPool } from '@fictionlab/db/db'
 *   const pool = createPool({ connectionString: process.env.DATABASE_URL })
 */

import pg from 'pg';

const { Pool } = pg;

/** Singleton pool instance */
let _pool = null;

// SSL is opt-in via DB_SSL/PGSSLMODE, not inferred from NODE_ENV: pgbouncer
// (edoburu/pgbouncer, see mws-58d) ships with client_tls_sslmode=disable and no
// certs, so forcing SSL whenever NODE_ENV=production breaks every pooled
// connection (mws-qz0). Set DB_SSL=true/require once TLS is actually provisioned.
function resolveSslConfig() {
  const mode = (process.env.DB_SSL || process.env.PGSSLMODE || '').toLowerCase();
  if (['true', '1', 'require', 'verify-ca', 'verify-full'].includes(mode)) {
    return { rejectUnauthorized: false };
  }
  return false;
}

/**
 * Create (or replace) the shared database pool.
 * Call once at application startup.
 *
 * @param {object} config - pg.Pool config options
 * @param {string} [config.connectionString] - DATABASE_URL style connection string
 * @returns {pg.Pool}
 */
export function createPool(config = {}) {
  const poolConfig = {
    connectionString: config.connectionString || process.env.DATABASE_URL,
    host: config.host || process.env.DB_HOST || 'localhost',
    port: config.port || parseInt(process.env.DB_PORT || '5432'),
    database: config.database || process.env.DB_NAME || 'fictionlab',
    user: config.user || process.env.DB_USER || 'postgres',
    password: config.password || process.env.DB_PASSWORD,
    max: config.max || 20,
    idleTimeoutMillis: config.idleTimeoutMillis || 30000,
    connectionTimeoutMillis: config.connectionTimeoutMillis || 5000,
    ssl: config.ssl ?? resolveSslConfig(),
  };

  // If connectionString is set, it takes precedence — remove individual fields
  if (poolConfig.connectionString) {
    delete poolConfig.host;
    delete poolConfig.port;
    delete poolConfig.database;
    delete poolConfig.user;
    delete poolConfig.password;
  }

  _pool = new Pool(poolConfig);

  _pool.on('error', (err) => {
    console.error('[fictionlab/db] Unexpected pool error:', err.message);
  });

  return _pool;
}

/**
 * Get the shared pool. Throws if createPool() has not been called.
 * @returns {pg.Pool}
 */
export function getPool() {
  if (!_pool) {
    throw new Error(
      '[fictionlab/db] Database pool not initialized. Call createPool() first.'
    );
  }
  return _pool;
}

/**
 * Execute a SQL query using the shared pool.
 *
 * @param {string} sql
 * @param {any[]} [params]
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(sql, params = []) {
  return getPool().query(sql, params);
}

/**
 * Run multiple queries inside a single transaction.
 * Rolls back automatically on error.
 *
 * @param {(client: pg.PoolClient) => Promise<any>} fn - Async function receiving a connected client
 * @returns {Promise<any>} - Return value of fn
 */
export async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Check database connectivity.
 * @returns {Promise<boolean>}
 */
export async function healthCheck() {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
