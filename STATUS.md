# Project Status

Snapshot of **now**. Not a changelog. Update it in the same PR as the change that made it stale, and bump the date only when content changes. Keep it under ~100 lines; move items completed more than a week ago out of *Recently completed* (git history keeps them).

Last updated: 2026-09-11

Current phase: Phase 2, Foundation (definitions in `docs/process/phases.md`). Entered 2026-09-10 when ADRs 0003 to 0012 were accepted and merged.

## Demo readiness

Not runnable. No application code exists yet. Submission deadline Mon Sep 14, 2026, 8:00 PM ET; dates and checklist in `docs/hackathon/SUBMISSION.md`.

## What works

- Repository context system, CI (context check, secret scan, workspace checks), accepted architecture in ADRs 0003 to 0012.
- `packages/shared`: schemas for OpenLoop, Evidence, ProposedAction, AuditEvent and the four agent outputs; state transitions; `LedgerStore` with `LocalLedgerStore` (memory or JSON file) and a shared contract suite; `IngestionSource` with `FixtureSource`.
- `demo/seed-inbox.json` (13 messages, 3 events) and `demo/seed-ledger.json` (the 9 loops the agent should produce), both validated by tests.
- `web/`: dashboard with the four states, loop detail (why it exists, evidence, confidence, consequence, proposed actions, timeline), approve/decline and "I already did this" server actions, activity feed. Runs on the local ledger seeded from the demo.
- `agent/`: AgentCore project with the Strands pipeline (Extractor, Investigator with inbox and ledger tools, Risk Judge; all structured output on Claude Sonnet 4.6). A real scan of the demo inbox produces 9 loops with the expected states in about 4 minutes, writing evidence, proposed actions (high-risk ones gated) and audit events through the shared ledger. Runtime contract (`/ping`, `/invocations`) verified locally.

## In progress

| Workstream | Branch / PR | Notes |
|---|---|---|
| Web dashboard shell (plan step 5) | — | Starting; reads `LocalLedgerStore` seeded from `demo/` |

## Recently completed

- 2026-09-10 Phase 0 foundation (f1156d9); Phase 1 merged (#1); workspace scaffold and shared package merged (#2); `main` ruleset enabled; MIT license added.
- 2026-09-11 Web dashboard shell merged (#4). AWS account, IAM user, CLI and Bedrock access verified.

## Blocked

- Nothing external. AWS is ready: personal account, `openloop-dev` IAM user with AdministratorAccess, CLI configured on David's machine in `us-east-1`, Bedrock use-case form accepted, Claude Sonnet 4.6 answers. Google Cloud and Vercel projects not yet created (needed for plan steps 16 and the live-Gmail stretch).

## Next up

1. Add teammates as GitHub collaborators, then raise the ruleset's required approvals from 0 to 1.
2. Register everyone on Devpost (`docs/hackathon/SUBMISSION.md`). AWS credits are exhausted; the AWS account is self-funded with a $25 budget alarm.
3. Plan step 9: first `agentcore deploy` (CDK bootstrap), DynamoDB adapter, web invokes the runtime instead of reading the seed.
4. Plan step 7: delta path, new evidence updating an existing loop with a transition and reason; wire the web's scan button to the agent.
5. Plan steps 10 and 11: Action Agent execution for low-risk actions, approval flow end to end.
6. Vercel project (David) so the web app has a live URL; Google Cloud project only when the live-Gmail stretch starts.

## Known issues

- Investigator marks the rescheduled club meeting Needs You instead of Watching (`agent/README.md`). Prompt calibration, not blocking.
- A full scan takes about 4 minutes for 10 threads; acceptable for the backfill animation, but the demo should pre-scan or use a warm ledger.

## Temporary limitations

- Product name is **Open Loops** (decided 2026-09-11 after considering alternatives; not reopening). "Open loop" stays the noun for a tracked item.
- Four days remain. Phases 1 and 2 compress into Sep 10 and 11; day-by-day steps in `docs/plans/2026-09-10-mvp.md`.
- Strands TypeScript Graph joins use AND semantics; the graph is designed as a pipeline with one fan-out (ADR-0007).

## Workstreams

None established yet. `SPEC.md` §16 suggests an agent/AWS, frontend/product and integrations/data split; ownership is not assigned until the team decides.
