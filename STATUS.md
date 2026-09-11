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
- `packages/ledger-dynamo`: DynamoDB ledger passing the shared contract suite against a real table; tables `openloop-ledger` and `openloop-ledger-test` exist in `us-east-1`.
- `agent/`: AgentCore project with the Strands pipeline (Extractor, Investigator with inbox and ledger tools, Risk Judge, update path for new mail in tracked threads, Action Agent; all structured output on Claude Sonnet 4.6). `handle` executes allowed actions through a simulated sink; `execute` runs one approved action; high risk never executes without approval (enforced in code, tested). A real scan of the demo inbox produces 9 loops with the expected states in about 4 minutes, writing evidence, proposed actions (high-risk ones gated) and audit events through the shared ledger. Deployed to AgentCore Runtime (`AgentCore-OpenLoop-default`, `us-east-1`) writing to DynamoDB; invoked end to end from the AWS CLI and from the web app's Scan button.

## In progress

Work is tracked as GitHub issues on the submission milestone (`must-ship` first, then `stretch`). Claim one by assigning yourself; see `CONTRIBUTING.md` *Claiming work*.

| Issue | Workstream | Who |
|---|---|---|
| — | Nothing claimed yet | — |

## Recently completed

- 2026-09-10 Phase 0 foundation (f1156d9); Phase 1 merged (#1); workspace scaffold and shared package merged (#2); `main` ruleset enabled; MIT license added.
- 2026-09-11 Web dashboard shell merged (#4). AWS account, IAM user, CLI and Bedrock access verified.

## Blocked

- Nothing external. AWS is ready: personal account, `openloop-dev` IAM user with AdministratorAccess, CLI configured on David's machine in `us-east-1`, Bedrock use-case form accepted, Claude Sonnet 4.6 answers. Google Cloud and Vercel projects not yet created (needed for plan steps 16 and the live-Gmail stretch).

## Next up

Must-ship, in the order the demo needs them: #17 loop page shows effects, #13 catch me up, #14 failure paths, #18 dashboard polish, #19 Vercel deploy, #22 README and diagram, #23 demo script and video, #24 submission day. Owner-only: #25 team setup. Quality: #15 calibration, #16 scan speed. Stretch after must-ship: #20 live Gmail, #21 Google sinks.

## Known issues

- AgentCore CLI 0.28.1: `agentcore package` is broken upstream (aws/agentcore-cli#2125) and a bare `agentcore deploy` ships a runtime that crashes on start under pnpm; use `pnpm --filter @openloop/agent deploy-runtime` (`agent/README.md`).
- Investigator sometimes marks the rescheduled club meeting Needs You instead of Watching (one of two runs). Prompt calibration, not blocking.
- A full scan takes about 4 minutes for 10 threads; acceptable for the backfill animation, but the demo should pre-scan or use a warm ledger.

## Temporary limitations

- Product name is **Open Loops** (decided 2026-09-11 after considering alternatives; not reopening). "Open loop" stays the noun for a tracked item.
- Four days remain. Phases 1 and 2 compress into Sep 10 and 11; day-by-day steps in `docs/plans/2026-09-10-mvp.md`.
- Strands TypeScript Graph joins use AND semantics; the graph is designed as a pipeline with one fan-out (ADR-0007).

## Workstreams

Three natural tracks, unassigned until people claim issues: agent (`area:agent`), web (`area:web`), docs and demo (`area:docs`). Infra (`area:infra`) is David's account work.
