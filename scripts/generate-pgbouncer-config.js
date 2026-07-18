#!/usr/bin/env node
/**
 * Generates pgbouncer.ini and userlist.txt for the edoburu/pgbouncer image
 * (docker-compose.yml mounts both read-only). Run before `docker compose up`
 * any time POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB change.
 *
 * Mirrors MCP-Electron-App/src/main/pgbouncer-config.ts's generatePgBouncerConfig():
 * same ini shape, same SCRAM-hash-with-plaintext-fallback strategy for userlist.txt.
 */
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const POSTGRES_USER = process.env.POSTGRES_USER || 'writer';
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'your_secure_password2025';
const POSTGRES_DB = process.env.POSTGRES_DB || 'mcp_series';
const POSTGRES_CONTAINER_NAME = 'mcp-postgres';

function fetchScramHash() {
  try {
    const query = `SELECT rolpassword FROM pg_authid WHERE rolname = '${POSTGRES_USER}';`;
    const hash = execSync(
      `docker exec ${POSTGRES_CONTAINER_NAME} psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -t -A -c "${query}"`,
      { stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim();

    if (hash && hash.startsWith('SCRAM-SHA-256')) {
      return hash;
    }
  } catch {
    // postgres container not up yet, or docker/psql unavailable -- fall back below
  }
  console.warn('[generate-pgbouncer-config] Could not fetch SCRAM hash from PostgreSQL, using plaintext password (pgbouncer will hash it itself under auth_type=scram-sha-256)');
  return POSTGRES_PASSWORD;
}

// listen_port stays hardcoded to 6432 (container-internal): docker-compose.yml maps
// "${PGBOUNCER_PORT}:6432" and mcp-servers hardwires pgbouncer:6432 for internal
// networking, so only the host-side publish port is allowed to move.
//
// Pool sizing (max_client_conn/default_pool_size/min_pool_size/reserve_pool_size)
// preserved from the retired bitnami/pgbouncer config -- sized for
// "10 MCP servers x 20 connections" (see docker-compose.yml history).
const iniContent = `[databases]
* = host=postgres port=5432 dbname=${POSTGRES_DB}

[pgbouncer]
listen_addr = *
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
admin_users = ${POSTGRES_USER}
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 100
min_pool_size = 20
reserve_pool_size = 20
server_idle_timeout = 600
server_lifetime = 3600
server_connect_timeout = 15
query_timeout = 0
log_connections = 0
log_disconnections = 0
log_pooler_errors = 1
ignore_startup_parameters = extra_float_digits
client_tls_sslmode = disable
`;

const passwordHash = fetchScramHash();
const userlistContent = `"${POSTGRES_USER}" "${passwordHash}"\n`;

writeFileSync(path.join(projectRoot, 'pgbouncer.ini'), iniContent, 'utf-8');
writeFileSync(path.join(projectRoot, 'userlist.txt'), userlistContent, 'utf-8');

console.log('[generate-pgbouncer-config] Wrote pgbouncer.ini and userlist.txt to', projectRoot);
