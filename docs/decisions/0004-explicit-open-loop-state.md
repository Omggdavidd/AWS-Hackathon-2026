---
status: accepted
date: 2026-09-10
decision-makers: team
---

# The application owns an explicit open-loop ledger; models only interpret evidence

## Context and Problem Statement

The product's unit of value is a responsibility that stays alive until evidence closes it (`docs/hackathon/SPEC.md` §4, §11). The UI, tests and audit trail need deterministic records to query. If state lives only in model memory or chat history, nothing is reproducible and nothing can be trusted on screen.

## Considered Options

* Explicit typed records (OpenLoop, Evidence, ProposedAction) in an application-owned store, behind a storage adapter interface
* Rely on the agent framework's session or memory features as the system of record
* Store only model-generated summaries per thread

## Decision Outcome

Chosen option: "Explicit typed ledger behind a storage adapter", because the model interprets evidence but the application must own the lifecycle, the state transitions and their reasons. The three record types and the status vocabulary (`NEEDS_YOU`, `WAITING`, `WATCHING`, `RESOLVED`, `UNCERTAIN`) follow §11. Every state change carries a timestamped reason; every loop keeps source IDs; full email bodies are not stored when IDs plus minimal excerpts suffice.

The store is accessed only through one adapter interface with two implementations: a local adapter (file or in-memory) for development, tests and the deterministic demo, and an AWS adapter for the deployed system. Ingestion backfills a bounded window once, then processes deltas only (§11, §19). The concrete AWS store is chosen in ADR-0008.

### Consequences

* Good, because the frontend is never blocked on AWS or OAuth; the seeded path always works.
* Good, because the ledger is auditable and testable without a model in the loop.
* Bad, because the schema must be designed now and migrated later if the product changes; kept small on purpose.
* Bad, because agent memory features (for example AgentCore Memory) become optional extras for user preferences, not the ledger.

## More Information

Field lists for the three records: `docs/hackathon/SPEC.md` §11. Lifecycle diagram: `docs/hackathon/state-lifecycle.png`.
