# Project Status

Snapshot of **now**. Not a changelog. Update it in the same PR as the change that made it stale, and bump the date only when content changes. Keep it under ~100 lines; move items completed more than a week ago out of *Recently completed* (git history keeps them).

Last updated: 2026-09-12

Current phase: Phase 2, Foundation (definitions in `docs/process/phases.md`). Entered 2026-09-10 when ADRs 0003 to 0012 were accepted and merged.

## Demo readiness

Runnable locally: `pnpm --filter @openloop/web dev` renders the seeded ledger, and with `OPENLOOP_LEDGER_TABLE` and `OPENLOOP_RUNTIME_ARN` set the Scan button drives the deployed runtime. Not yet reachable by a judge: the web app has no public URL (#19). Submission deadline Mon Sep 14, 2026, 8:00 PM ET; dates and checklist in `docs/hackathon/SUBMISSION.md`.

## What works

- Repository context system, CI (context check, secret scan, workspace checks), accepted architecture in ADRs 0003 to 0012, judge-facing `README.md` and the submission architecture diagram (`docs/architecture/`).
- `packages/shared`: schemas for OpenLoop, Evidence, ProposedAction, AuditEvent and the four agent outputs; state transitions; `LedgerStore` with `LocalLedgerStore` (memory or JSON file) and a shared contract suite; `IngestionSource` with `FixtureSource`.
- `demo/seed-inbox.json` (15 messages, 3 events, 12 threads) and `demo/seed-ledger.json` (the 11 loops the agent should produce), both validated by tests.
- `web/`: dashboard with a linked summary, readable title/source rows and aligned deadlines, compact closed-share ring, agent toolbar with first-scan progress, collapsed resolved, recent activity per responsibility and phone bottom tabs. White by default with a persistent light/dark toggle across pages. Loop detail shows why it exists, evidence, confidence, consequence, actions with the effects the agent produced, and timeline; approve/decline with pending state, "I already did this", activity feed, and a message page behind every source id let each claim be checked against the original mail or event. Runs on the local ledger seeded from the demo.
- `packages/ledger-dynamo`: DynamoDB ledger passing the shared contract suite against a real table; tables `openloop-ledger` and `openloop-ledger-test` exist in `us-east-1`.
- `agent/`: AgentCore project with the Strands pipeline (Extractor, Investigator with inbox and ledger tools, Risk Judge, update path for new mail in tracked threads, Action Agent; all structured output on Claude Sonnet 4.6). `handle` executes allowed actions through a simulated sink; `execute` runs one approved action; high risk never executes without approval (enforced in code, tested); `catch_up` summarizes state changes since the last check from the ledger alone. A real scan of the 12-thread demo inbox produces 11 loops with the expected states in four to five and a half minutes, writing evidence, proposed actions (high-risk ones gated) and audit events through the shared ledger. Deployed to AgentCore Runtime (`AgentCore-OpenLoop-default`, `us-east-1`) writing to DynamoDB; invoked end to end from the AWS CLI and from the web app's Scan button.

## In progress

Work is tracked as GitHub issues on the submission milestone (`must-ship` first, then `stretch`); each has an owner. Claim anything unassigned by assigning yourself; see `CONTRIBUTING.md` *Claiming work*.

| Owner | Issues, hardest first within each row |
|---|---|
| Omggdavidd (hard + front end) | #19 Vercel deploy |
| Ojulari123 (next hardest) | #14 failure paths, #16 scan speed, #29 demo reset script, #15 calibration |
| tdare514 (medium) | #30 observability evidence, #35 show-source page, #40 two more demo threads |
| ab00bae (medium-easy) | #36 remind/ignore buttons, #39 notification banner |
| AyomideAw (easiest) | #37 done cancels actions, #38 CI builds web, #22 demo script |
| Unassigned, stretch only after must-ship | #20 live Gmail, #21 Google sinks, #31 command bar |

One owner per issue and no issue waits on another. Shared files: the loop page (#17 and #35, rebase before ready) and demo fixtures (#14 uses its own file, #40 edits the base inbox). Every issue states why it matters for the submission.

## Recently completed

- 2026-09-10 Phase 0 foundation (f1156d9); Phase 1 merged (#1); workspace scaffold and shared package merged (#2); `main` ruleset enabled; MIT license added.
- 2026-09-11 Web dashboard shell (#4), agent pipeline (#8), AgentCore deploy (#9), DynamoDB and Scan button (#10), delta path (#11), actions and approval (#12).
- 2026-09-12 Loop page shows executed effects (#17); message page behind evidence links (#35, tdare514); Catch me up command and button (#13); dashboard design and responsive navigation (#18); dashboard at a glance: readable rows, one summary line, refined open-ring identity, compact progress, white default with persistent themes and consistent detail/source panels (#52); submission README, architecture diagram and the missing `web/.env.example` (#33, ab00bae).

## Blocked

- Nothing external. AWS is ready: personal account, `openloop-dev` IAM user with AdministratorAccess, CLI configured on David's machine in `us-east-1`, Bedrock use-case form accepted, Claude Sonnet 4.6 answers. Google Cloud and Vercel projects not yet created (needed for plan steps 16 and the live-Gmail stretch).

## Next up

Must-ship in the order the demo needs them: #29, #14, #19, #22, #30. Then quality (#15, #16), then stretch. Owner-only chores (video, submission day, IAM users, Devpost) are in `docs/hackathon/SUBMISSION.md`.

## Known issues

- AgentCore CLI 0.28.1: `agentcore package` is broken upstream (aws/agentcore-cli#2125) and a bare `agentcore deploy` ships a runtime that crashes on start under pnpm; use `pnpm --filter @openloop/agent deploy-runtime` (`agent/README.md`).
- Investigator sometimes marks the rescheduled club meeting Needs You instead of Watching (one of two runs). Prompt calibration, not blocking.
- A full scan takes four to five and a half minutes for 12 threads (237s to 323s across four runs). Acceptable for the backfill animation, but the demo should pre-scan or use a warm ledger.

## Temporary limitations

- Product name is **Open Loops** (decided 2026-09-11 after considering alternatives; not reopening). "Open loop" stays the noun for a tracked item.
- Four days remain. Phases 1 and 2 compress into Sep 10 and 11; day-by-day steps in `docs/plans/2026-09-10-mvp.md`.
- Strands TypeScript Graph joins use AND semantics; the graph is designed as a pipeline with one fan-out (ADR-0007).

## Workstreams

Collaborators: Omggdavidd (admin), Ojulari123, ab00bae, tdare514, AyomideAw. Each has an IAM user `openloop-<login>` in the AWS account; keys are shared by David through a password manager, never in chat or the repo. Tracks and owners are in *In progress*.
