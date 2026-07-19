# Migrate PgBouncer off Bitnami image (paywalled)

## Problem

`docker-compose.yml:59-89` (root of this repo, the "Phase 7 production" compose file,
last touched today for `mws-4it`) still pulls PgBouncer from `bitnami/pgbouncer:latest`:

```yaml
pgbouncer:
  image: bitnami/pgbouncer:latest
  environment:
    POSTGRESQL_HOST: postgres
    POSTGRESQL_PORT: 5432
    POSTGRESQL_USERNAME: ${POSTGRES_USER:-writer}
    POSTGRESQL_PASSWORD: ${POSTGRES_PASSWORD:-your_secure_password2025}
    ...
```

Bitnami moved its Docker Hub images behind a paywall (their "legacy" tags are being
deprecated/pulled) — `bitnami/pgbouncer:latest` will stop resolving or stop receiving
updates. This compose file is live-maintained (edited today) so it is not dead code;
it needs to keep working.

## This is already solved elsewhere in the fleet — don't re-derive

`MCP-Electron-App` hit and fixed this exact problem already. Its
`docker-compose.yml:37-52` uses `edoburu/pgbouncer:latest` instead, driven by
generated config files rather than Bitnami's env-var interface:

```yaml
pgbouncer:
  image: edoburu/pgbouncer:latest
  container_name: fictionlab-pgbouncer
  volumes:
    - ${DOCKER_DIR}/pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini:ro
    - ${DOCKER_DIR}/userlist.txt:/etc/pgbouncer/userlist.txt:ro
```

The config-file generator is `MCP-Electron-App/src/main/pgbouncer-config.ts`
(`generatePgBouncerConfig`): it writes a `pgbouncer.ini` (`auth_type = scram-sha-256`,
`auth_file = /etc/pgbouncer/userlist.txt`, `pool_mode = transaction`,
`listen_port = 6432` fixed container-side) and a `userlist.txt` containing
`"<user>" "<scram-hash-or-password>"`, fetching the real SCRAM hash from Postgres via
`fetchScramHashFromPostgres()` (falls back to plaintext password if the query fails).

This is proven in production right now: `docker ps` shows container
`fictionlab-pgbouncer` running image `edoburu/pgbouncer:latest` today
(2026-07-18), deployed from
`C:\Users\becca\AppData\Roaming\fictionlab\docker\docker-compose.yml` (the file the
Electron app generates from its own `docker-compose.yml` template + the
`pgbouncer-config.ts` generator).

A canonical-config note has been added to the shared cross-project store
(`C:\Users\becca\.claude\shared\configs\pgbouncer-image.md`) — check that file first in
future sessions instead of re-deriving this.

## Plan

1. Swap the `pgbouncer` service in `docker-compose.yml:59-89` from
   `bitnami/pgbouncer:latest` to `edoburu/pgbouncer:latest`, following the
   MCP-Electron-App shape: mount a `pgbouncer.ini` and `userlist.txt` instead of
   passing `POSTGRESQL_*` / `PGBOUNCER_*` env vars (edoburu's image does not read
   Bitnami's env-var schema).
2. This repo has no Electron-app process to run `pgbouncer-config.ts`'s generator at
   launch, so the config files need a repo-local equivalent. Two viable options —
   pick whichever keeps `docker compose up` a single command with no manual step:
   - A small pre-up script (`scripts/generate-pgbouncer-config.sh` or `.js`) that
     writes `pgbouncer.ini`/`userlist.txt` from `${POSTGRES_USER}`/`${POSTGRES_PASSWORD}`
     (mirror `pgbouncer-config.ts`'s ini content — `pool_mode = transaction`,
     `default_pool_size`/`min_pool_size`/`reserve_pool_size` matching the current
     Bitnami values at lines 74-76), documented as a prerequisite step in
     `docs/DEPLOYMENT.md` and `README.md` (both already reference
     `docker-compose.yml`).
   - Or check in static `pgbouncer.ini` + `userlist.txt` (with `${POSTGRES_USER}`
     literal and a SCRAM hash or plaintext password sourced from the same
     `POSTGRES_PASSWORD` env var used by the `postgres` service) if the deployment
     model here tolerates a fixed, non-generated credential file — confirm which
     model this repo's deploy flow actually uses (check `docs/DEPLOYMENT.md`,
     `ACTUAL-FIX.md`) before choosing.
3. Preserve the pool-sizing values already tuned at lines 71-76
   (`max_client_conn: 1000`, `default_pool_size: 100`, `min_pool_size: 20`,
   `reserve_pool_size: 20`) in the new `pgbouncer.ini` — these were sized for
   "10 MCP servers × 20 connections" per the inline comment; don't silently drop
   back to `edoburu`'s lower defaults.
4. Update the `mcp-servers` service's `DATABASE_URL` at line 102 only if the auth
   mechanism changes the connection string shape (e.g. `sslmode=disable` as
   MCP-Electron-App's does) — otherwise leave it pointed at `pgbouncer:6432` as-is.
5. Smoke-test: `docker compose up -d postgres pgbouncer` and confirm
   `pg_isready -h localhost -p 6432` succeeds (existing healthcheck at line 82-86),
   then bring up `mcp-servers` and confirm at least one server's `/health` endpoint
   responds through the pooled connection.

## Acceptance criteria

- [ ] `docker-compose.yml`'s `pgbouncer` service no longer references any
      `bitnami/*` image.
- [ ] `docker compose up` (or documented equivalent) brings up Postgres + PgBouncer +
      at least one MCP server successfully end-to-end with no manual credential-file
      editing beyond what's already required for `.env`.
- [ ] Pool-sizing values (max_client_conn/default_pool_size/min_pool_size/
      reserve_pool_size) are preserved or intentionally re-justified in the new config.
- [ ] `docs/DEPLOYMENT.md` / `README.md` updated if the deploy steps change (new
      config-generation step, new required file, etc).
