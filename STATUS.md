# Project Status

Snapshot of **now**. Not a changelog. Update it in the same PR as the change that made it stale, and bump the date only when content changes. Keep it under ~100 lines; move items completed more than a week ago out of *Recently completed* (git history keeps them).

Last updated: 2026-09-13

Current phase: Phase 2, Foundation (definitions in `docs/process/phases.md`). Entered 2026-09-10 when ADRs 0003 to 0012 were accepted and merged.

## Demo readiness

Public URL: https://openloop-neon.vercel.app (Vercel project `openloop`, production from `main`, preview per PR; scoped IAM user `openloop-web`). Scan, Check for new mail, Handle and Approve drive the deployed runtime from there. Locally, `pnpm --filter @openloop/web dev` renders the seeded ledger, and with `OPENLOOP_LEDGER_TABLE` and `OPENLOOP_RUNTIME_ARN` set the same buttons work. Submission deadline Mon Sep 14, 2026, 8:00 PM ET; dates and checklist in `docs/hackathon/SUBMISSION.md`.

## What works

- Repository context system, CI (context check, secret scan, workspace checks including a production build of the web app), accepted architecture in ADRs 0003 to 0012, judge-facing `README.md` and the submission architecture diagram (`docs/architecture/`).
- `packages/shared`: schemas for OpenLoop (with category and area of life), Evidence, ProposedAction, AuditEvent and the four agent outputs; state transitions; `LedgerStore` with `LocalLedgerStore` (memory or JSON file) and a shared contract suite; `IngestionSource` with `FixtureSource`.
- `demo/seed-inbox.json` (15 messages, 3 events, 12 threads) and `demo/seed-ledger.json` (the 11 loops the agent should produce), both validated by tests.
- `web/`: overview with three views on the same loops: List (home; rows grouped by time with the state on each row, hover actions, keyboard triage), Calendar (six-week grid on due dates) and Board (draggable, resizable groups around a hub, by state, category or area of life, layout saved in the browser); headline, live clock and the docked agent panel above them. White/navy themes and Inter are shared across the app. Loop detail shows facts, next action, consequence, evidence quotes and source links, actions with the effects the agent produced, and folded history; approve/decline with pending state, "I already did this", activity feed, and a message page behind every source id let each claim be checked against the original mail or event. A notification centre in the header lists what changed, one notice per loop derived from the audit trail, sharing its unread marker with the change banner; with permission granted it also raises a browser notification, but only while the tab is hidden and only for a loop the Risk Judge flagged as needing a decision now, so eight of the eleven demo loops arrive without a sound. Runs on the local ledger seeded from the demo.
- `packages/ledger-dynamo`: DynamoDB ledger passing the shared contract suite against a real table; tables `openloop-ledger` and `openloop-ledger-test` exist in `us-east-1`.
- `agent/`: AgentCore project with the Strands pipeline (Extractor, Investigator with inbox and ledger tools, Risk Judge, update path for new mail in tracked threads, Action Agent; all structured output on Claude Sonnet 4.6). The Risk Judge's `interruptUser` decision is stored on the loop and logged, and is what the web app gates its browser notification on. `handle` executes allowed actions through a simulated sink; `execute` runs one approved action; high risk never executes without approval (enforced in code, tested); `catch_up` summarizes state changes since the last check from the ledger alone. A real scan of the 12-thread demo inbox produces 11 loops with the expected states in four to five and a half minutes, writing evidence, proposed actions (high-risk ones gated) and audit events through the shared ledger. `runScan` and `executeAction` emit a structured JSON line per pipeline step (thread, role, duration, outcome) to stdout for CloudWatch; shapes and capture queries in `docs/architecture/observability/`. Deployed to AgentCore Runtime (`AgentCore-OpenLoop-default`, `us-east-1`) writing to DynamoDB; invoked end to end from the AWS CLI and from the web app's Scan button.

## In progress

Work is tracked as GitHub issues on the submission milestone (`must-ship` first, then `stretch`); each has an owner. Claim anything unassigned by assigning yourself; see `CONTRIBUTING.md` *Claiming work*.

| Owner | Issues, hardest first within each row |
|---|---|
| Omggdavidd (hard + front end) | nothing open; #19 shipped |
| Ojulari123 (next hardest) | #14 failure paths, #16 scan speed, #29 demo reset script, #15 calibration, #31 command bar (stretch) |
| tdare514 (medium) | #99 interrupt gate |
| ab00bae (medium-easy) | nothing open |
| AyomideAw (easiest) | nothing open |
| Omggdavidd (stretch, after #19) | #20 live Gmail, #21 Google sinks |

One owner per issue and no issue waits on another. Every issue states why it matters for the submission.

## Recently completed

- 2026-09-10 Phase 0 foundation (f1156d9); Phase 1 merged (#1); workspace scaffold and shared package merged (#2); `main` ruleset enabled; MIT license added.
- 2026-09-11 Web dashboard shell (#4), agent pipeline (#8), AgentCore deploy (#9), DynamoDB and Scan button (#10), delta path (#11), actions and approval (#12).
- 2026-09-12 Loop page shows executed effects (#17); message page behind evidence links (#35, tdare514); Catch me up command and button (#13); dashboard design and responsive navigation (#18); dashboard at a glance: readable rows, one summary line, refined open-ring identity, compact progress, white default with persistent themes and consistent detail/source panels (#52); reading themes: highlighter headings, Inter, navy dark mode with reveal toggle (#61); loop page in reading order and a live clock (#67); observability evidence: structured pipeline logs in the runtime and CloudWatch captures of one scan (#30, tdare514 with Omggdavidd); submission README, architecture diagram and the missing `web/.env.example` (#33, ab00bae).
- 2026-09-13 CI builds the web app in `workspace-checks`, so a route that fails to compile cannot reach `main` (#38, tdare514); `executeAction` re-reads the loop before writing a status, so an action in flight can no longer reopen a loop the user resolved while it ran (#66, ab00bae); Remind me tomorrow and Ignore on the loop page, park a responsibility in Watching without claiming it is done (#36, ab00bae); quiet change banner on the overview: one or two sentences of what changed in the last day, built from the audit trail, each named loop linked, dismissible until something newer happens (#39, ab00bae).
- 2026-09-13 Dashboard reimagined as a responsibility whiteboard with saved arrangements and accessible controls; hub headline, docked agent panel and a professional finish (#83); overview direction after product research: List by time as home, Board and Calendar as views (#88).

- 2026-09-13 Web app deployed to Vercel at https://openloop-neon.vercel.app with the least-privilege IAM user `openloop-web` (#19).
- 2026-09-13 Demo script for the five-minute video, written against the app as built and walked twice against the running app (#22, ab00bae, taken over from AyomideAw).

## Blocked

- Nothing external. AWS is ready: personal account, `openloop-dev` IAM user with AdministratorAccess, CLI configured on David's machine in `us-east-1`, Bedrock use-case form accepted, Claude Sonnet 4.6 answers. Google Cloud project not yet created (needed for the live-Gmail stretch, #20). The Vercel project exists.

## Next up

Must-ship in the order the demo needs them: #29, #14. Then quality (#15, #16), then stretch. Owner-only chores (video, submission day, IAM users, Devpost) are in `docs/hackathon/SUBMISSION.md`.

## Known issues

- AgentCore CLI 0.28.1: `agentcore package` is broken upstream (aws/agentcore-cli#2125) and a bare `agentcore deploy` ships a runtime that crashes on start under pnpm; use `pnpm --filter @openloop/agent deploy-runtime` (`agent/README.md`).
- Investigator sometimes marks the rescheduled club meeting Needs You instead of Watching (one of two runs). Prompt calibration, not blocking.
- A full scan takes four to five and a half minutes for 12 threads (237s to 323s across four runs). Acceptable for the backfill animation, but the demo should pre-scan or use a warm ledger.

## Temporary limitations

- Product name is **Open Loops** (decided 2026-09-11 after considering alternatives; not reopening). "Open loop" stays the noun for a tracked item.
- One day remains. Phases 1 and 2 compressed into Sep 10 and 11; day-by-day steps in `docs/plans/2026-09-10-mvp.md`.
- Strands TypeScript Graph joins use AND semantics; the graph is designed as a pipeline with one fan-out (ADR-0007).

## Workstreams

Collaborators: Omggdavidd (admin), Ojulari123, ab00bae, tdare514, AyomideAw. Each has an IAM user `openloop-<login>` in the AWS account; keys are shared by David through a password manager, never in chat or the repo. Tracks and owners are in *In progress*.
