# Project Status

Snapshot of **now**. Not a changelog. Update it in the same PR as the change that made it stale, and bump the date only when content changes. Keep it under ~100 lines; move items completed more than a week ago out of *Recently completed* (git history keeps them).

Last updated: 2026-09-14

Current phase: Phase 2, Foundation (definitions in `docs/process/phases.md`). Entered 2026-09-10 when ADRs 0003 to 0012 were accepted and merged.

## Demo readiness

Public URL: https://openloop-neon.vercel.app (Vercel project `openloop`, production from `main`, preview per PR; scoped IAM user `openloop-web`). Before recording, put the live table back in its post-scan state with `pnpm reset-demo --table openloop-ledger --yes` (#29); as of 2026-09-13 night it is in that state: 11 loops with areas and interrupt flags from a scan on the runtime redeployed with #121's three-thread pipeline. Scan, Check for new mail, Handle and Approve drive the deployed runtime from there. Locally, `pnpm --filter @openloop/web dev` renders the seeded ledger, and with `OPENLOOP_LEDGER_TABLE` and `OPENLOOP_RUNTIME_ARN` set the same buttons work. Submission deadline Mon Sep 14, 2026, 8:00 PM ET; dates and checklist in `docs/hackathon/SUBMISSION.md`.

## What works

- Repository context system, CI (context check, secret scan, workspace checks including a production build of the web app), accepted architecture in ADRs 0003 to 0012, judge-facing `README.md` and the submission architecture diagram (`docs/architecture/`).
- `packages/shared`: schemas for OpenLoop (with category and area of life), Evidence, ProposedAction, AuditEvent and the four agent outputs; state transitions; `LedgerStore` with `LocalLedgerStore` (memory or JSON file) and a shared contract suite; `IngestionSource` with `FixtureSource` and `GoogleSource`, which reads live Gmail and Calendar over REST with no new dependency but has nothing to give it an access token yet (#20).
- `demo/seed-inbox.json` (15 messages, 3 events, 12 threads) and `demo/seed-ledger.json` (the 11 loops the agent should produce), both validated by tests.
- `web/`: first visit on any route shows a welcome screen that asks one question at a time, sliding between steps: what to call you, what to call the agent, what you use Open Loops for (work, school, personal, hobby and newsletters) and which inbox it reads, then a five-stop tour over the real page, all remembered in cookies and editable in Settings; the inbox and its purpose sit in the top bar as the connected source (one inbox at a time). Ask (⌘K, or the Ask button in the top bar) answers one question about the ledger from the deployed runtime, read-only, with links to the loops and messages it cites (#31). A rail of routes (Today, Board, Calendar, Decisions, Activity, About) with bottom tabs on phones and a top bar carrying the agent's status, the bell and the theme. Today is a split view on wide screens: the list grouped by time with the state on each row, hover actions and keyboard triage on the left, the chosen loop on the right (a sheet on a phone); Calendar is a six-week grid on due dates; Board is draggable, resizable groups around a hub, by state, category or area of life, layout saved in the browser. Decisions lists every proposed action the agent will not take alone, and a strip above the Today list repeats the first three; Review opens a sheet showing exactly what would be sent, paid or booked and the evidence behind it, with Approve and Decline that confirm in place. White/navy themes and Inter are shared across the app. Loop detail shows facts, next action, consequence, evidence quotes and source links, actions with the effects the agent produced, and folded history; "I already did this", Remind me tomorrow, Ignore, activity feed, and a message page behind every source id let each claim be checked against the original mail or event. A notification centre in the header lists what changed, one notice per loop derived from the audit trail; with permission granted it also raises a browser notification, but only while the tab is hidden and only for a loop the Risk Judge flagged as needing a decision now. Runs on the local ledger seeded from the demo. Front-end revamp complete (`docs/plans/2026-09-13-front-end-revamp.md`): the day bar, area tints and action glyphs, grain and a small motion budget, an appearance menu (accent, density, opening view), swipe for Done or Snooze with Undo, loading skeletons, Settings with a web reset of the demo, About with the diagram, a footer, the loop page led by the decision, the activity timeline, the calendar agenda, and empty states that point somewhere.
- `packages/ledger-dynamo`: DynamoDB ledger passing the shared contract suite against a real table; tables `openloop-ledger` and `openloop-ledger-test` exist in `us-east-1`.
- `agent/`: AgentCore project with the Strands pipeline (Extractor, Investigator with inbox and ledger tools, Risk Judge, update path for new mail in tracked threads, Action Agent; all structured output on Claude Sonnet 4.6). The Risk Judge's `interruptUser` decision is stored on the loop and logged, and is what the web app gates its browser notification on; on the delta path the Judge runs again whenever a loop changes state, so consequence, priority and the interrupt decision follow the state instead of staying frozen at the first message (`dueAt` still does). `handle` executes allowed actions through a simulated sink; `execute` runs one approved action; high risk never executes without approval (enforced in code, tested); `catch_up` summarizes state changes since the last check from the ledger alone. A real scan of the 12-thread demo inbox produces 11 loops with the expected states in about 95 to 105 seconds, three threads at a time, writing evidence, proposed actions (high-risk ones gated) and audit events through the shared ledger; a loop belongs to the thread it was found in, so an Investigator that only quotes another thread's message no longer folds that thread into a delta. `runScan` and `executeAction` emit a structured JSON line per pipeline step (thread, role, duration, outcome) to stdout for CloudWatch; shapes and capture queries in `docs/architecture/observability/`. Deployed to AgentCore Runtime (`AgentCore-OpenLoop-default`, `us-east-1`) writing to DynamoDB; invoked end to end from the AWS CLI and from the web app's Scan button. `pnpm reset-demo` deletes the demo user's rows (two-phase, three guards) and rescans the base inbox through the deployed runtime (#29). The agent checks in on its own: an EventBridge Scheduler schedule invokes `catch_up` on the live ledger every day at 07:00 ET, one model call, about a cent (ADR-0013, proposed; `create-schedule` script). `pnpm --filter @openloop/agent agreement` scans a four-thread subset once by default (`--full` for all twelve, `OPENLOOP_AGREEMENT_RUNS=3` for a final check), prints each thread's state beside the expected one and exits non-zero on disagreement; the rescheduled club meeting landed Watching 3/3 after the Investigator rule was made decisive (#15). Duplicates on rescan, already-resolved threads, vague deadlines and unsafe actions are pinned by tests over a separate fixture, `demo/seed-inbox-failures.json` (#14).

## In progress

Work is tracked as GitHub issues on the submission milestone (`must-ship` first, then `stretch`); each has an owner. Claim anything unassigned by assigning yourself; see `CONTRIBUTING.md` *Claiming work*.

| Owner | Issues, hardest first within each row |
|---|---|
| Omggdavidd (hard + front end) | #20 live Gmail, the web OAuth half (the reader shipped in #130), #21 Google sinks (stretch); video and submission chores |
| Ojulari123 (next hardest) | nothing open; #16 shipped in #121, #31 shipped in #128 |
| tdare514 (medium) | nothing open; #20's reader and the runtime's `gmail` source kind shipped in #130, #111 shipped |
| ab00bae (medium-easy) | nothing open |
| AyomideAw (easiest) | nothing open |

One owner per issue and no issue waits on another. Every issue states why it matters for the submission.

## Recently completed

- 2026-09-13 Calibration harness defaults to one representative subset run, retains full-demo verification and fails on disagreement (#153).
- 2026-09-14 Two safety boundaries the agent leans on were weaker than documented: `isAutoExecutable` consulted the risk tier before the action type, so a `pay` or `send_email` the Risk Judge rated low executed unattended (#163), and `renderMessage` interpolated mail into the prompt envelope raw, so a body, subject, display name or attribute could forge a `<message>` with a citable source id (#164). Both fixed and pinned by tests; `docs/security.md` records the stronger posture. Every server action that writes now refuses a request with no `Origin` (#140, #160).
- 2026-09-10 Phase 0 foundation (f1156d9); Phase 1 merged (#1); workspace scaffold and shared package merged (#2); `main` ruleset enabled; MIT license added.
- 2026-09-11 Web dashboard shell (#4), agent pipeline (#8), AgentCore deploy (#9), DynamoDB and Scan button (#10), delta path (#11), actions and approval (#12).
- 2026-09-12 Loop page shows executed effects (#17); message page behind evidence links (#35, tdare514); Catch me up command and button (#13); dashboard design and responsive navigation (#18); dashboard at a glance: readable rows, one summary line, refined open-ring identity, compact progress, white default with persistent themes and consistent detail/source panels (#52); reading themes: highlighter headings, Inter, navy dark mode with reveal toggle (#61); loop page in reading order and a live clock (#67); observability evidence: structured pipeline logs in the runtime and CloudWatch captures of one scan (#30, tdare514 with Omggdavidd); submission README, architecture diagram and the missing `web/.env.example` (#33, ab00bae).
- 2026-09-13 CI builds the web app in `workspace-checks`, so a route that fails to compile cannot reach `main` (#38, tdare514); `executeAction` re-reads the loop before writing a status, so an action in flight can no longer reopen a loop the user resolved while it ran (#66, ab00bae); Remind me tomorrow and Ignore on the loop page, park a responsibility in Watching without claiming it is done (#36, ab00bae); quiet change banner on the overview: one or two sentences of what changed in the last day, built from the audit trail, each named loop linked, dismissible until something newer happens (#39, ab00bae).
- 2026-09-13 Dashboard reimagined as a responsibility whiteboard with saved arrangements and accessible controls; hub headline, docked agent panel and a professional finish (#83); overview direction after product research: List by time as home, Board and Calendar as views (#88).

- 2026-09-13 Web app deployed to Vercel at https://openloop-neon.vercel.app with the least-privilege IAM user `openloop-web` (#19).
- 2026-09-13 Interrupt gate: the Risk Judge's `interruptUser` decision reaches the ledger and is the only thing that raises a browser notification, so eight of eleven demo loops arrive quietly (#99, tdare514).
- 2026-09-13 Front-end revamp, tiers 2 and 3 (#109): day bar (#124), agent panel captions and polish (#126, #127), area tints, glyphs, grain and motion budget (#129), appearance menu (#131), swipe with Undo (#132), skeletons and row motion (#133), Settings and About with a footer (#134), loop page led by the decision and a Risk Judge that names the sender, verified by a real scan (#135), activity timeline and empty states (#136), calendar agenda (#137), screenshots recaptured (#138).
- 2026-09-13 Front-end revamp, first tier: rail of routes and a split Today view (#105), rows in fixed columns and one Group by menu (#106), Decisions with a review sheet that confirms in place (#107), welcome screen, agent name and a five-stop tour (#108); Today fills the screen until a loop is chosen (#120). Re-judge on the delta path (#111, tdare514). Demo reset script (#29), Investigator calibration with an agreement harness (#15) and failure-path tests (#14), all Ojulari123.
- 2026-09-13 Demo script for the five-minute video, written against the app as built and walked twice against the running app (#22, ab00bae, taken over from AyomideAw).

- 2026-09-13 The agent checks in unattended: daily `catch_up` through EventBridge Scheduler, ADR-0013 proposed, `create-schedule` script, agreement harness defaults to one run to protect the Bedrock budget (#155).
- 2026-09-13 Ask command bar: a read-only `ask` runtime command behind `mayExecute`, references filtered against the ledger, `/api/ask` behind the origin guard, ⌘K in the web app; runtime redeployed and answered correctly against the live table (#128, Ojulari123, closes #31). Onboarding asks who you are, what Open Loops is for and which inbox it reads, on every route (#151, closes #150).
- 2026-09-13 Scan runs three threads at a time with per-role model ids and a loop belongs only to the thread it was found in, 95 to 105 seconds for the demo inbox instead of four to five minutes (#121, Ojulari123, closes #16); agent `.env.example` (#125, Ojulari123); `GoogleSource` reads live Gmail and Calendar behind the existing `IngestionSource`, the web OAuth half of #20 still open (#130, tdare514); budget alarm and `openloop-web` policy verified from the CLI (#144).
- 2026-09-13 Security review of the deployed app and ledger: origin check on the three agent routes so an unauthenticated stranger cannot spend Bedrock tokens, response headers, and `docs/security.md` recording what is deliberately open (ab00bae).

## Blocked

- Nothing external. AWS is ready: personal account, `openloop-dev` IAM user with AdministratorAccess, CLI configured on David's machine in `us-east-1`, Bedrock use-case form accepted, Claude Sonnet 4.6 answers. Google Cloud project not yet created (needed for the live-Gmail stretch, #20). The Vercel project exists.

## Next up

Every must-ship is in, the front-end revamp is complete, and the live table and runtime are ready to record. Remaining stretch: the OAuth half of #20 (needs the Google Cloud project) and #21. Owner-only chores (video, submission day, IAM users, Devpost) are in `docs/hackathon/SUBMISSION.md`.

## Known issues

- AgentCore CLI 0.28.1: `agentcore package` is broken upstream (aws/agentcore-cli#2125) and a bare `agentcore deploy` ships a runtime that crashes on start under pnpm; use `pnpm --filter @openloop/agent deploy-runtime` (`agent/README.md`).
- A full scan of the 12 demo threads takes about 95 to 105 seconds, three threads at a time (263s to 277s sequential across three runs). Short enough to run on camera, but the demo is still safer from a warm ledger.

## Temporary limitations

- Product name is **Open Loops** (decided 2026-09-11 after considering alternatives; not reopening). "Open loop" stays the noun for a tracked item.
- One day remains. Phases 1 and 2 compressed into Sep 10 and 11; day-by-day steps in `docs/plans/2026-09-10-mvp.md`.
- Strands TypeScript Graph joins use AND semantics; the graph is designed as a pipeline with one fan-out (ADR-0007).

## Workstreams

Collaborators: Omggdavidd (admin), Ojulari123, ab00bae, tdare514, AyomideAw. Each has an IAM user `openloop-<login>` in the AWS account; keys are shared by David through a password manager, never in chat or the repo. Tracks and owners are in *In progress*.
