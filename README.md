# Reputation System Prototype

A blockchain-based reputation system for real-estate interactions, built on **Daml/Canton** with an off-chain **Java** scoring engine and a **React** frontend (**RERS** — Real Estate Reputation Simulator): a prototype real estate application where users can act out Property Purchase and Rental Agreement interactions, submit feedback, and track reputation rankings.

Two interaction domains are modeled:

- **Property Purchase** — an Agent and a Buyer collaborate on a sale transaction.
- **Rental Agreement** — a Landlord and a Tenant collaborate on a rental application.

Each participant accrues a reputation score across three weighted components — **Reliability**, **Responsiveness**, **Accuracy** — derived from on-chain event logs and optional peer feedback, plus a tier classification that can back a mock verifiable credential.

## Architecture

| Service | Stack | Role | Port(s) |
|---|---|---|---|
| `canton-sandbox` | Daml / Canton | Ledger — hosts and enforces all smart contracts | 6865 (gRPC), 7575 (JSON API) |
| `reputation-engine` | Java 17 / Spring Boot | Off-chain engine — streams ledger events, computes & persists reputation scores, issues mock verifiable credentials | 8080 |
| `database` | PostgreSQL 17 | Persistent store for scores, tiers, and ledger offset | 5432 |
| `rers` | React / Vite | Browser UI for setup, interactions, rankings, and view ledger/database data | 3000 |

## Repository layout

```
reputation-system/        Daml contracts (canton/daml) + Java reputation engine (src/main/java)
  canton/                 Canton sandbox Dockerfile, startup script, Daml project
  src/main/java/...       Spring Boot app: ledger listener/submitter, event handlers, REST API
rers/                     React + Vite frontend (the "Real Estate Reputation Simulator")
evaluation/               Standalone Python analysis scripts — not part of the running system
  agents/                 Property Purchase round simulation using Gemini-generated interaction data
  landlords/              Weight-sensitivity and score-convergence analysis for the Landlord formula
docker-compose.yml        Orchestrates all four services
```

## Running the system

Requires Docker.

```bash
docker compose up
```

This builds and starts the database and Canton sandbox first; once both are healthy, the reputation engine starts (its `system-start.sh` waits for Canton's JSON API, discovers the auto-allocated `Operator` party, and launches the Spring Boot app as that party); the `rers` frontend starts last.

Once everything is up:

- **rers UI** — http://localhost:3000 (start on the *Setup* page to create the role/observation configuration and seed parties before doing anything else)
- **Reputation API** — http://localhost:8080 (`/rankings`, `/subjects/{party}`, `/tiers`, `/vc/issue/{party}`, `/vc/verify`, `/debug/*`)
- **Canton JSON API** — http://localhost:7575

To stop: `docker compose down` (add `-v` to also drop the Postgres volume and start fresh next time).

## Evaluation scripts

`evaluation/landlords/` contains two Python scripts that analyze the Landlord scoring formula without touching the ledger:

```bash
python evaluation/landlords/weightsRank.py      # weight-sensitivity / rank-crossover analysis
python evaluation/landlords/stabilization.py    # score-convergence analysis
```

Both require `numpy` and `matplotlib`.

`evaluation/agents/agentEvaluation.py` uses Gemini via Vertex AI to generate simulated Property Purchase interaction rounds as Daml scripts (`EvalSeedAgentSetup`, `EvalSeedAgentRound1`, `EvalSeedAgentRound2`, ...) under `reputation-system/canton/daml/Scripts/`. It expects Google Cloud Application Default Credentials with access to a specific GCP project configured in the script, so it isn't runnable out of the box without that access.

Once those round scripts exist, run any one of them directly against the live ledger (the stack must already be up via `docker compose up`), substituting the module and function name of the script you want to run (e.g. `Scripts.EvalSeedAgentRound1:evalSeedAgentRound1`):

```bash
docker exec canton-sandbox daml script \
    --dar /app/daml/.daml/dist/reputation-0.0.1.dar \
    --script-name Scripts.<ScriptName>:<scriptFunction> \
    --ledger-host localhost \
    --ledger-port 6865
```

`evaluation/agents/fetch_rankings.py` automates this end-to-end: it runs `EvalSeedAgentSetup` followed by every `EvalSeedAgentRound*` script in sequence, polls `/rankings` after each round, and plots reputation evolution across rounds. It also requires `numpy` and `matplotlib`.

```bash
python evaluation/agents/fetch_rankings.py
```

