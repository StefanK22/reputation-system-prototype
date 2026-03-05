# Reputation Prototype

Containerized prototype of a reputation system for real-estate interactions.

The system is split into independent services (web app, reputation engine, mock Canton node, and PostgreSQL) with shared code in `src/shared` to avoid duplication.

## System Architecture

### Services
- `web-app` (`:8080`): public API + React simulator UI (`/external-app`)
- `reputation-engine` (`:9091`): consumes ledger events and updates reputation read model
- `canton-node` (`:7575`): mock Canton API node exposing Canton-like routes
- `database` (`:5432`): PostgreSQL read model and engine checkpoint store

### Runtime communication
- `web-app -> canton-node` via Canton-like API (`/v2/commands/...`, `/v2/events`, `/v2/state/...`)
- `web-app -> reputation-engine` via internal engine API (`/process`, `/checkpoint`)
- `web-app -> database` direct read model queries for config/reputation/rankings
- `reputation-engine -> canton-node` reads events
- `reputation-engine -> database` writes reputation state and checkpoint

### End-to-end flow
1. A contract payload is submitted to `web-app` (`POST /mock/contracts/:templateId`).
2. `web-app` publishes it to `canton-node` using the Canton command API shape.
3. `reputation-engine` polls new events from `canton-node`.
4. `reputation-engine` normalizes payloads, computes updates, and persists results in PostgreSQL.
5. `web-app` serves read APIs (`/config`, `/rankings`, `/reputation/:party`) from PostgreSQL.

## Repository Structure

```text
reputation-prototype/
  docker-compose.yml
  Dockerfile
  src/
    modules/
      web-app/
      reputation-engine/
      canton-node/
    shared/
      clients/
      contracts/
      domain/
      runtime/
      store/
```

## Module Responsibilities

### `src/modules/web-app`
- `index.js`: process entrypoint for web service
- `service.js`: wiring for store, ledger client, engine client, and HTTP server
- `server.js`: public HTTP API routes and static serving for simulator
- `engineApiClient.js`: internal client for reputation-engine endpoints
- `public/*`: React simulator assets and UI logic

### `src/modules/reputation-engine`
- `index.js`: process entrypoint for engine service
- `service.js`: polling loop, engine HTTP routes (`/health`, `/checkpoint`, `/process`)
- `asyncReputationEngine.js`: event consumption, normalization, scoring updates, checkpoint updates

### `src/modules/canton-node`
- `index.js`: process entrypoint for mock canton service
- `service.js`: in-memory event ledger + Canton-like API endpoints
- `seedContracts.js`: initial contract set for demo bootstrap

### `src/shared`
- `clients/`: HTTP/Canton API clients used by modules
- `contracts/`: contract registry, schema normalization, and payload validation
- `domain/`: shared domain helpers (`conditions`, `objectPath`)
- `runtime/`: process lifecycle + HTTP response/body helpers
- `store/`: PostgreSQL read-model adapter and checkpoint persistence

## API Surface

### `web-app` (`http://localhost:8080`)
- `GET /health`
- `GET /` (serves simulator app)
- `GET /external-app`
- `GET /schema/contracts`
- `GET /config`
- `GET /config/all`
- `GET /rankings?limit=10`
- `GET /reputation/:party`
- `GET /events?from=0`
- `POST /engine/process`
- `POST /mock/contracts/:templateId?autoProcess=true|false`
- `POST /vc/request`

### `reputation-engine` (`http://localhost:9091`)
- `GET /health`
- `GET /checkpoint`
- `POST /process`

### `canton-node` (`http://localhost:7575`)
- `GET /health`
- `GET /v2/state/ledger-end`
- `GET /v2/events?from=0`
- `POST /v2/parties`
- `POST /v2/users`
- `POST /v2/state/active-contracts`
- `POST /v2/commands/submit-and-wait-for-transaction`

## Contracts and Shared Schema

Contract templates:
- `ReputationConfiguration`
- `CompletedInteraction`
- `Feedback`

Single source of truth:
- `src/shared/contracts/registry.js`

This registry drives:
- UI form generation (`/external-app`)
- backend payload validation
- backend normalization of contract payloads

## Reputation Computation Model

This system uses direct ratings (`0..100`) per component.

For each incoming rating update on a subject component:
- `step = 1 / (interactionCount + 2)`
- `newValue = currentValue + step * (rating - currentValue)`
- then clamped to config bounds (`reputationFloor`, `reputationCeiling`) and rounded to 2 decimals

Overall score:
- weighted average by role-specific component weights when available
- fallback to equal component weights when role weights are missing/zero

## Database Model

Initialized by `docker/postgres/init.sql`.

Tables:
- `reputation_configurations`: versioned configurations (`payload` JSONB)
- `reputation_subjects`: current subject reputation snapshot (`payload` JSONB)
- `engine_state`: single-row checkpoint (`last_processed_offset`)

Host connection string (from your machine):
- `postgresql://reputation:reputation_password@localhost:5432/reputation`

Docker-internal connection string (between containers):
- `postgresql://reputation:reputation_password@database:5432/reputation`

## Run with Docker (recommended)

```bash
cd /Users/stefan.d.k/Desktop/tese-v1/reputation-prototype
docker compose up --build
```

Service URLs:
- web app: `http://localhost:8080`
- mock canton node: `http://localhost:7575`
- reputation engine: `http://localhost:9091`
- postgres: `localhost:5432`

Stop and remove volumes:
```bash
docker compose down -v
```

## Run Locally (without Docker networking)

If you run services with `npm run ...` directly on macOS/Linux, do **not** use Docker hostnames like `database`, `canton-node`, or `reputation-engine`.

1. Start DB (Docker or local) and expose `localhost:5432`
2. Start mock Canton:
```bash
PORT=7575 npm run start:canton-mock
```
3. Start engine:
```bash
PORT=9091 \
DATABASE_URL=postgresql://reputation:reputation_password@localhost:5432/reputation \
CANTON_API_URL=http://localhost:7575 \
CANTON_PARTY=OPERATOR \
CANTON_USER_ID=operator-user \
npm run start:engine
```
4. Start web app:
```bash
PORT=8080 \
DATABASE_URL=postgresql://reputation:reputation_password@localhost:5432/reputation \
CANTON_API_URL=http://localhost:7575 \
ENGINE_API_URL=http://localhost:9091 \
CANTON_PARTY=OPERATOR \
CANTON_USER_ID=operator-user \
npm run start:web
```

## Environment Variables

### `web-app`
- `PORT` (default `8080`)
- `DATABASE_URL` (default Docker value with host `database`)
- `CANTON_API_URL` (default `http://canton-node:7575`)
- `ENGINE_API_URL` (default `http://reputation-engine:9091`)
- `CANTON_PARTY` (default `OPERATOR`)
- `CANTON_USER_ID` (default `operator-user`)

### `reputation-engine`
- `PORT` (default `9091`)
- `POLL_INTERVAL_MS` (default `3000`)
- `DATABASE_URL` (default Docker value with host `database`)
- `CANTON_API_URL` (default `http://canton-node:7575`)
- `CANTON_PARTY` (default `OPERATOR`)
- `CANTON_USER_ID` (default `operator-user`)

### `canton-node`
- `PORT` (default `7575`)
- `SEED_CONTRACTS` (`1` by default; set `0` to disable bootstrap seed)

## Querying PostgreSQL

Connection string from host:
- `postgresql://reputation:reputation_password@localhost:5432/reputation`

Using VS Code:
- Install extension `PostgreSQL` (Microsoft).
- Create a connection with host `localhost`, port `5432`, database `reputation`, user `reputation`, password `reputation_password`.
- Run SQL from the extension query editor.

Using `psql`:
```bash
psql "postgresql://reputation:reputation_password@localhost:5432/reputation"
```

Useful queries:
```sql
SELECT config_id, version, activation_time
FROM reputation_configurations
ORDER BY activation_time DESC, version DESC;

SELECT party, role_id, overall_score, updated_at
FROM reputation_subjects
ORDER BY overall_score DESC, party ASC;

SELECT * FROM engine_state;
```

## Troubleshooting

### `getaddrinfo ENOTFOUND database`
Cause: running service directly on host while using Docker-internal hostname `database`.
Fix: use `DATABASE_URL=...@localhost:5432/...` when running locally, or run all services with `docker compose up`.

### `FATAL: role "reputation" does not exist`
Cause: database was created previously with different credentials or stale volume.
Fix:
```bash
docker compose down -v
docker compose up -d database
```
Then reconnect with:
- user: `reputation`
- password: `reputation_password`
- db: `reputation`

### `Cannot find package 'pg'`
Cause: Node dependencies are not installed locally.
Fix:
```bash
npm install
```

## Example Contract Publish

```bash
curl -X POST "http://localhost:8080/mock/contracts/Feedback?autoProcess=true" \
  -H 'content-type: application/json' \
  -d '{
    "platform": "Operator",
    "interactionId": "sell_003",
    "from": "BUYER_BOB",
    "to": "AGENT_ALICE",
    "componentRatings": {
      "Reliability": 88,
      "Efficiency": 82
    },
    "submittedAt": "2026-02-27T12:00:00Z",
    "phase": "FINAL"
  }'
```

## Design Intent

- One folder per module/container under `src/modules/*`
- Shared reusable logic under `src/shared/*`
- Keep module-specific behavior inside its module folder
- Minimize duplication by centralizing contracts, store adapter, runtime helpers, and API clients
