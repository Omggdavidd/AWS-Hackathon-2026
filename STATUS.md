# Project Status

Snapshot of **now**. Not a changelog. Update it in the same PR as the change that made it stale, and bump the date only when content changes. Keep it under ~100 lines; move items completed more than a week ago out of *Recently completed* (git history keeps them).

Last updated: 2026-09-10

Current phase: Phase 2, Foundation (definitions in `docs/process/phases.md`). Entered 2026-09-10 when ADRs 0003 to 0012 were accepted and merged.

## Demo readiness

Not runnable. No application code exists yet. Submission deadline Mon Sep 14, 2026, 8:00 PM ET; dates and checklist in `docs/hackathon/SUBMISSION.md`.

## What works

- Repository context system, CI (context check, secret scan, workspace checks), accepted architecture in ADRs 0003 to 0012.
- `packages/shared`: schemas for OpenLoop, Evidence, ProposedAction, AuditEvent and the four agent outputs; state transitions; `LedgerStore` with `LocalLedgerStore` (memory or JSON file) and a shared contract suite; `IngestionSource` with `FixtureSource`.
- `demo/seed-inbox.json`: the §14 student scenario, 13 messages and 3 events, validated by tests.

## In progress

| Workstream | Branch / PR | Notes |
|---|---|---|
| Web dashboard shell (plan step 5) | — | Starting; reads `LocalLedgerStore` seeded from `demo/` |

## Recently completed

- 2026-09-10 Phase 0 foundation (f1156d9); Phase 1 merged (#1); workspace scaffold and shared package merged (#2); `main` ruleset enabled; MIT license added.

## Blocked

- First model call waits on the Bedrock Anthropic use-case form for the AWS account.
- `agent/` scaffold waits on the AgentCore CLI and AWS CLI being installed and the account bootstrapped (plan step 2).

## Next up

1. Add teammates as GitHub collaborators, then raise the ruleset's required approvals from 0 to 1.
2. Request AWS credits before Thu Sep 11, 12:00 PM PT; register everyone on Devpost (`docs/hackathon/SUBMISSION.md`).
3. Account chores: Bedrock Anthropic use-case form, install AWS CLI and `@aws/agentcore`, first deploy of the template (CDK bootstrap), Google Cloud project in Testing, Vercel project. Owners in `docs/plans/2026-09-10-mvp.md` *Unresolved questions*.
4. Plan steps 4 and 5 in parallel: `agent/` from the AgentCore template with the graph skeleton; `web/` dashboard shell reading `LocalLedgerStore` seeded from `demo/`.

## Known issues

None.

## Temporary limitations

- Four days remain. Phases 1 and 2 compress into Sep 10 and 11; day-by-day steps in `docs/plans/2026-09-10-mvp.md`.
- Strands TypeScript Graph joins use AND semantics; the graph is designed as a pipeline with one fan-out (ADR-0007).

## Workstreams

None established yet. `SPEC.md` §16 suggests an agent/AWS, frontend/product and integrations/data split; ownership is not assigned until the team decides.
