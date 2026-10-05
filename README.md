# Reputation System Prototype

A blockchain-based reputation system for real-estate interactions, built on **Daml/Canton** with an off-chain **Java** scoring engine and the **Real Estate App**, a **React** frontend where users can act out Property Purchase and Rental Agreement interactions, submit feedback, and track reputation rankings.

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
| Real Estate App (`real-estate-app`) | React / Vite | Browser UI for setup, interactions, rankings, and view ledger/database data | 3000 |

## Repository layout

```
reputation-system/        Daml contracts (canton/daml) + Java reputation engine (src/main/java)
  canton/                 Canton sandbox Dockerfile, startup script, Daml project
  src/main/java/...       Spring Boot app: ledger listener/submitter, event handlers, REST API
real-estate-app/          React + Vite frontend (the "Real Estate App")
evaluation/               Validation scripts and saved evaluation results
  evaluation5.1.1/        Configuration and disclosure validation
  evaluation5.1.2/        Landlord interactions and credential validation
  evaluation5.1.3/        Authorization and processing validation
  evaluation5.1.4/        Auditability and traceability validation
  evaluation5.2/          Repeated Agent reputation evaluation
REPUTATION_ALGORITHM.md    Current reputation formulas
docker-compose.yml        Orchestrates all four services
```

## Running the system

Requires Docker.

```bash
docker compose up
```

This builds and starts the database and Canton sandbox first; once both are healthy, the reputation engine starts (its `system-start.sh` waits for Canton's JSON API, discovers the auto-allocated `Operator` party, and launches the Spring Boot app as that party); the Real Estate App (`real-estate-app` service) starts last.

Once everything is up:

- **Real Estate App** — http://localhost:3000 (start on the *Setup* page to create the role/observation configuration and seed parties before doing anything else)
- **Reputation API** — http://localhost:8080 (`/rankings`, `/subjects/{party}`, `/tiers`, `/vc/issue/{party}`, `/vc/verify`, `/debug/*`)
- **Canton JSON API** — http://localhost:7575

To stop: `docker compose down` (add `-v` to also drop the Postgres volume and start fresh next time).

## Evaluation scripts

The `evaluation/evaluation5.1.*` folders contain the functional validation scripts:

| Folder | Purpose | Daml script |
|---|---|---|
| `evaluation5.1.1` | Configuration changes and disclosure | `Scripts.ConfigurationDisclosure:baseline`, `updateRule`, `aggregation`, `initialization`, `display`, or `classification` |
| `evaluation5.1.2` | Good and poor Landlord interactions used for credential validation | `Scripts.EvaluationLandlordInteractions:evaluationLandlordInteractions` or `Scripts.EvaluationLandlordBadInteractions:evaluationLandlordBadInteractions` |
| `evaluation5.1.3` | Authorization, visibility, evidence validity, and replay protection | `Scripts.AuthorizationAndProcessing:authorizationAndProcessing` |
| `evaluation5.1.4` | Traceability from interaction evidence to the updated reputation | `Scripts.AuditabilityTraceability:auditabilityTraceability` |

Copy the required Daml file to `reputation-system/canton/daml/Scripts/` before building the stack. Run it with:

```bash
docker exec canton-sandbox daml script \
    --dar /app/daml/.daml/dist/reputation-0.0.1.dar \
    --script-name <module>:<function> \
    --ledger-host localhost \
    --ledger-port 6865
```

`evaluation/evaluation5.2/` evaluates four Agent profiles across 30 repetitions. Gemini generates 25 Property Purchase rounds per repetition as Daml scripts:

```bash
python3.9 evaluation/evaluation5.2/agentEvaluation.py --model=<gemini-model>
```

Generation requires Google Cloud Application Default Credentials and access to the configured Vertex AI project.

Copy one generated `RepetitionNN` folder to `reputation-system/canton/daml/Scripts/Repetitions/`, rebuild the stack, and save its API results with:

```bash
python3.9 evaluation/evaluation5.2/fetch_rankings.py --repetition 1
```

The command runs the Daml setup and rounds, waits for the Reputation Engine, and saves `repetitions/run_NN.json`. Use the saved results without running the system again:

```bash
python3.9 evaluation/evaluation5.2/fetch_rankings.py --repetition 1 --analyze-only
python3.9 evaluation/evaluation5.2/fetch_rankings.py --analyze-all
```

The analysis reports the final reputation and the stabilization round for the ±1, ±2, ±5, and ±10 bands as mean and sample standard deviation.
