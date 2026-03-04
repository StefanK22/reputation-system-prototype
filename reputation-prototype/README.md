# Reputation Prototype

Simple, runnable prototype of the reputation system with the architecture:
- `External App` (not implemented)
- `Ledger` (mocked in-memory)
- `Reputation Engine` (consumes contracts, computes reputation)
- `Database` (in-memory read model)
- `Web API` (HTTP endpoints for querying reputation and rules)
- `External App Simulator` (React UI)

## Contracts consumed
- `CompletedInteraction`
- `Feedback`
- `ReputationConfiguration`

Single source of truth for contract structure:
- `src/shared/contracts/registry.js`

When payload structure changes, update the registry and both:
- backend normalization/validation
- React deployment forms
will adapt automatically.

## Direct rating update model
This prototype uses **actual ratings** (0-100) instead of deltas.

For each component update:
- `step = 1 / sqrt(interactionCount + k)`
- `newValue = currentValue + step * (rating - currentValue)`

## How to run
```bash
cd /Users/stefan.d.k/Desktop/tese-v2/reputation-prototype
npm run start
```

Server defaults to `http://localhost:8080`.

If your environment blocks opening ports, run headless:
```bash
npm run demo
```

## Useful endpoints
- `GET /health`
- `GET /external-app` (frontend simulator for contract deployment)
- `GET /schema/contracts` (shared schema used by UI and backend)
- `GET /config`
- `GET /config/all`
- `GET /rankings?limit=10`
- `GET /reputation/:party`
- `POST /engine/process`
- `POST /mock/contracts/:templateId`
- `POST /vc/request`

Example:
```bash
curl -X POST http://localhost:8080/mock/contracts/Feedback \
  -H 'content-type: application/json' \
  -d '{"platform":"Operator","interactionId":"sell_003","from":"BUYER_BOB","to":"AGENT_ALICE","componentRatings":{"Reliability":88,"Efficiency":82},"submittedAt":"2026-02-27T12:00:00Z","phase":"FINAL"}'
```

## External app simulator
Open [http://localhost:8080/external-app](http://localhost:8080/external-app) to:
- deploy `ReputationConfiguration` contracts
- deploy `CompletedInteraction` contracts
- deploy `Feedback` contracts
- inspect ledger events, active configuration, rankings, and request mock VCs

The simulator is React-based and uses browser ESM imports (`esm.sh`) for `react` and `react-dom`.
