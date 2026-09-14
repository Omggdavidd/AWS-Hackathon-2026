# agent

AgentCore CLI project (ADR-0008) containing the Strands agent (ADR-0003, ADR-0007). Run every `agentcore` command from this directory.

```
agent/
├── agentcore/            CLI config: agentcore.json (resources), aws-targets.json (deploy targets), cdk/ (generated, do not edit)
└── app/OpenLoopAgent/    @openloop/agent: the runtime entry point and the specialist pipeline
    ├── main.ts           BedrockAgentCoreApp: POST /invocations, GET /ping (port 8080)
    ├── src/agents/       Extractor, Investigator, Risk Judge as structured-output Agents; prompts.ts
    ├── src/tools/        search_inbox, get_thread, list_calendar_events, find_open_loops, get_loop_evidence
    ├── src/scan.ts       Orchestrator: thread -> extract -> investigate -> judge -> ledger
    │                     (tracked thread -> update -> judge on a state change -> ledger)
    ├── scripts/scan.ts   Local runner over demo/seed-inbox.json with the real model
    ├── scripts/reset-demo.ts  Demo reset: clear the ledger table for one user, then rescan through the deployed runtime
    └── test/             Orchestrator tests with stubbed specialists (no model calls)
```

## Commands

```
pnpm --filter @openloop/agent scan -- --reset   # real model over the demo inbox, ~95 to 105s, writes .openloop/agent-ledger.json
pnpm --filter @openloop/agent scan -- --delta   # then the next-morning batch (demo/seed-inbox-delta.json): updates, not duplicates
pnpm --filter @openloop/agent scan -- --handle  # execute every allowed proposed action (drafts, calendar, reminders); high risk waits for approval
pnpm --filter @openloop/agent scan -- --catch-up  # what changed since the last catch-up, written from the ledger only
pnpm --filter @openloop/agent scan -- --ask "what am I waiting on?"  # answer one question from the ledger; reads only
pnpm --filter @openloop/agent agreement         # 3 real scans, per-thread status against demo/seed-ledger.json (OPENLOOP_AGREEMENT_RUNS overrides)
pnpm --filter @openloop/agent test              # stub-based, no AWS needed
pnpm reset-demo --dry-run                       # count the rows a reset would delete; deletes nothing
pnpm reset-demo --table openloop-ledger --yes   # delete them, then rescan the base inbox on the deployed runtime (~95 to 105s)
pnpm reset-demo --table openloop-ledger --yes --no-scan   # delete only, no runtime call
pnpm reset-demo --local --yes                   # reseed .openloop/ledger.json from demo/seed-ledger.json instead
pnpm --filter @openloop/agent dev               # runtime server on :8080 (same as agentcore dev, without the inspector)
agentcore dev                                   # interactive local runtime with inspector (needs a real terminal)
pnpm --filter @openloop/agent deploy-runtime            # prepare-deploy + agentcore deploy -y --json (~1-2 min)
# needs the CLI once: npm install -g @aws/agentcore@0.28.1  (the version agent/agentcore was generated with)
agentcore deploy --dry-run -y --json            # synth only; check agentcore/cdk/cdk.out/asset.*.zip has _deps/
agentcore status --json                         # runtime ARN and state
agentcore logs                                  # CloudWatch logs
```

Exit codes. A run's product is the ledger, so a run that lost part of it must not look like success to a script. `runScan` survives a thread whose pipeline throws: it counts the thread in `ScanSummary.failed`, logs the id and the message, and finishes the rest of the inbox. The scan CLI then exits 1 with the count on stderr, because those threads are responsibilities the user believes are tracked and are not. `--handle` exits 1 when any action came back `FAILED`, and prints `✗` rather than `✓` for those. `agreement` exits 1 if any run lost a thread, since a thread that threw is indistinguishable from a thread that disagreed in the table it prints. `reset-demo`'s codes are under *Demo reset*.

CLI notes (v0.28.1):

- Any command run without a non-interactive flag opens the CLI's terminal UI and hangs in a script or agent session. Always pass `-y`, `--json`, or another flag marked non-interactive.
- `agentcore package` fails with "The esbuild JavaScript API cannot be bundled" (upstream issue aws/agentcore-cli#2125). Deploy does not use it: the CDK stack bundles `app/OpenLoopAgent/main.ts` itself (about 2 MB, includes `@openloop/shared` and the embedded demo inbox). Do not set `ESBUILD_BINARY_PATH`; it breaks CDK synth, which uses its own esbuild.
- **Always deploy through `pnpm --filter @openloop/agent deploy-runtime`.** The CDK bundler copies a fixed list of packages that `bedrock-agentcore` loads dynamically (`@fastify/sse`, `ws`, `readable-stream`, …) from `app/OpenLoopAgent/node_modules` into the zip, and silently skips what it cannot find. Under pnpm those are transitive or symlinked, so a bare `agentcore deploy` ships a runtime that crashes on start with "Cannot find module '@fastify/sse'". `scripts/prepare-deploy.mjs` materializes them as real directories first.
- `agentcore/aws-targets.json` holds the deploy target (account and region). `agentcore/.cli/deployed-state.json` is written by deploy and is committed on purpose.
- Deployed: stack `AgentCore-OpenLoop-default`, runtime `OpenLoop_OpenLoopAgent-CA60RSCE0z`, `us-east-1`. Logs: `/aws/bedrock-agentcore/runtimes/OpenLoop_OpenLoopAgent-CA60RSCE0z-DEFAULT`. Invoke from a shell with `aws bedrock-agentcore invoke-agent-runtime --agent-runtime-arn <arn> --runtime-session-id <33+ chars> --payload <base64 json> out.txt`.

Invocation payload (validated by the Zod schema in `main.ts`). Without `source.path` the demo inbox bundled into the runtime is used; `source.variant: "delta"` overlays the bundled next-morning batch so a second scan updates existing loops (the delta path). The ledger is either the DynamoDB table shared with the web app (the runtime's role allows `openloop-ledger*` via `iam/dynamodb-ledger.json`, referenced from `agentcore.json` `additionalPolicies`) or a local file, which on the Runtime lives only for the session:

```json
{ "command": "scan", "userId": "user-alex", "source": { "kind": "fixture" }, "ledger": { "kind": "dynamo", "table": "openloop-ledger" } }
```

`source.kind: "gmail"` reads a real inbox and calendar instead (`GoogleSource` in `@openloop/shared`,
issue #20). It takes a short-lived Google access token the caller already holds and an optional
`backfillDays`, default 90:

```json
{ "command": "scan", "userId": "user-alex", "source": { "kind": "gmail", "accessToken": "<short-lived Google access token>", "backfillDays": 90 }, "ledger": { "kind": "dynamo", "table": "openloop-ledger" } }
```

The runtime never sees a refresh token and stores no Google credential: the web app owns the OAuth
flow and mints the access token per invocation (ADR-0011). **Nothing mints that token yet** — the
OAuth route and the Google Cloud project are the remaining half of #20 — so this path is unreachable
from the app today and is covered by unit tests against a stubbed transport rather than a live run.
`GoogleSource` talks to the Gmail and Calendar REST endpoints with `fetch` rather than through
`googleapis`, which keeps `@openloop/shared` free of framework dependencies. It caps one scan at 250
messages and 20,000 characters of body per message, runs at most five `messages.get` calls at once
(Gmail bills five quota units each against 250 per second per user), and retries 429 and 5xx.

Commands: `scan` (default), `handle` (execute every proposed action the policy allows and list the rest), `execute` with `actionId` (one action, used by the web after approval), `catch_up` (state changes since the previous catch-up or `since`; the digest is built in code, the model only writes the sentences, and a `catch_up` audit event marks the check), `ask` with `question` (SPEC §8G: one question about the ledger, answered by an agent with `find_open_loops` and the read-only `get_loop_evidence`, structured as `AskAnswer`). `ask` reads and never writes: it cannot execute an action, and when a question asks for work done it names the control that does it (`suggests`) and says nothing has run. References the model returns are checked against the ledger before they leave the runtime, so a loop id or a source id it invented is dropped rather than shown. The policy gate is `mayExecute` in `@openloop/shared`: low risk and prepare-type medium risk run automatically; high risk only when the record is `APPROVED`. Effects go through `FixtureActionSink` today (simulated, recorded as evidence with source `action:<id>`); Gmail and Calendar sinks are the live-path stretch.

Requires AWS credentials with Bedrock access (`aws configure`, region `us-east-1`) and the account's Anthropic use-case form accepted.

Models and pacing (ADR-0007): all seven roles share one Claude Sonnet 4.6 instance. `OPENLOOP_MODEL_ID` overrides the shared model, `OPENLOOP_EXTRACTOR_MODEL_ID` gives the Extractor its own. Every role runs with `maxTokens: 8192` (`MAX_OUTPUT_TOKENS` in `src/model.ts`): the largest legitimate output is an `ActionPlan` with a 4000-character body, well under 2k tokens, so the ceiling only catches a role that starts rambling before it eats the runtime's 300s budget. Sampling is left at the provider default on purpose — the 11 loops of `demo/seed-ledger.json` were calibrated there, so a temperature or top-p of our own would throw away the agreement runs behind them. A structured output its schema rejects throws an error naming the role and the failing schema paths and never the output itself, because those messages reach CloudWatch and the output carries the user's mail. `runScan` works on three threads at a time; `ScanOptions.concurrency` changes that (1 is the old sequential behaviour). Writes stay ordered within a thread, a loop is never created twice, and `onEvent` still emits one thread's events as a block. The block is held until the thread finishes rather than emitted when it starts, so the web scan log stays empty until the first thread is done and then lands in bursts of about three threads, out of inbox order; adjacency is what `AgentPanel` needs to keep a thread's lines together, so do not trade it back for a running commentary.

Measured over the current 12-thread `demo/seed-inbox.json` on Claude Sonnet 4.6 in `us-east-1`: 263s, 276s and 277s sequential across three runs, and 95s, 103s and 104s at concurrency 3, so about 95 to 105 seconds. The 95s run, taken after the cross-thread claim fix in `scan.ts`, produced the 11 loops of `demo/seed-ledger.json` exactly, `thr-passport` included: 1 resolved, 6 needs you, 3 watching, 1 waiting. On the 10-thread inbox that preceded #54, a Claude Haiku 4.5 Extractor ran in 76s but read `thr-issue1` as not a responsibility and produced 8 loops instead of 9, so Haiku stays opt-in: set `OPENLOOP_EXTRACTOR_MODEL_ID=global.anthropic.claude-haiku-4-5-20251001-v1:0` if you want it.

## Structured logs

`runScan` and `executeAction` take an optional `logger`. It defaults to silence, so the orchestrator
stays side-effect free under test; `main.ts` wires `jsonLogger()` so the deployed runtime writes one
JSON line per pipeline step to stdout for CloudWatch. Locally:

```
pnpm --filter @openloop/agent scan -- --reset --log-json 2>pipeline.jsonl
```

Lines go to stderr so they never interleave with the human-readable progress. Line shapes, the
Logs Insights queries and what to screenshot are in `docs/architecture/observability/`.

## Re-judging on the delta path

A scan of an already-tracked thread runs the Investigator's update role, which decides the state and
nothing else. When that state actually changes, the Risk Judge runs again over the full evidence and
rewrites `consequence`, `riskLevel`, `priority`, `nextAction` and `interruptUser`; when it does not,
the new mail is recorded as evidence and no model call is spent. The reason is that what a
responsibility costs you depends on whose move it is: a loop that was Waiting on somebody else and
now asks something of the user would otherwise keep the low priority it earned while it was not the
user's problem, and would never interrupt.

`dueAt` is still fixed at creation. Changing it needs the Extractor to re-read the thread, not the
Judge, so a rescheduled deadline does not yet move the date on the loop.

## Areas

The Extractor sets `area` on every loop (school, work, money, health, home, travel, community, other) from who is asking and what it is about; the prompt gives one line of guidance per area. Records written before the field existed parse with `other`. The board's By area view groups on it.

## Demo reset

`pnpm reset-demo` (root script; `scripts/reset-demo.ts` here) puts the demo back in a known state before a rehearsal or the recording: it deletes the demo user's rows from the DynamoDB ledger table, then rescans the base inbox into the table through the deployed runtime, and prints the loops it ends with.

- It prints table, region, user and the row counts it found, and **deletes nothing without both `--table <name>` and `--yes`**. `--table` must repeat the resolved target table exactly (`OPENLOOP_LEDGER_TABLE`, default `openloop-ledger`); a destructive run with the wrong name or no `--table` at all prints what it expected, deletes nothing and exits 1. `--dry-run` counts and stops, and needs no `--table`.
- `--no-scan` deletes without calling the runtime. `--local` resets the local JSON ledger (`.openloop/ledger.json`, or `OPENLOOP_LEDGER_FILE`) from `demo/seed-ledger.json` instead and never touches DynamoDB or AWS; it takes `--yes` alone, because it overwrites one local file any scan can rebuild and there is no table to name. It reseeds **wholesale**, so it cannot target a user: the seed holds only `user-alex`, and no other user's ledger can come out of it. `--user` with `--local` is rejected even when it names the seed's own user, because the flag promises a selectivity this path does not have; an `OPENLOOP_USER_ID` that differs from the seed's user is rejected too, while one that matches is accepted silently. A rejected run explains itself, writes nothing and exits 1.
- `OPENLOOP_LEDGER_TABLE` (default `openloop-ledger`), `AWS_REGION`, `DYNAMODB_ENDPOINT`, `OPENLOOP_RUNTIME_ARN` (required unless `--no-scan`) and `--user` / `OPENLOOP_USER_ID` (default `user-alex`) configure it.
- Deletion is a per-user query, never a table scan: loop ids are collected first, then each loop's `LOOP#<id>` evidence partition, then everything is removed with batched `BatchWriteItem`. **Limitation:** rows the user's partition cannot reach survive, namely anything written under another partition prefix (the contract tests use a UUID prefix) and evidence whose loop row is already missing from earlier runs. Delete those by hand in the console if they ever matter; a scan-based sweep is too dangerous to run against the wrong table.

## Known calibration

Against `demo/seed-ledger.json` the pipeline produces the expected 11 loops and states. The rescheduled club meeting was the one thread that drifted: on the prompt before the change below, the Investigator marked it Needs You rather than Watching once in four observed runs on the 12-thread inbox, and about half the time on the earlier 10-thread one. Priorities and loop titles vary between runs; `demo/README.md` pins states, not priorities. `pnpm --filter @openloop/agent agreement` measures that drift: it runs the base scan three times and prints each thread's status next to the expected one, with an agreement count. The comparison itself is `src/agreement.ts`, covered by `test/agreement.test.ts`; the runs need AWS credentials.

The Investigator prompt now states the rule outright (a meeting already on the calendar whose time changed is Watching unless another event overlaps the new slot or the organizer asks for a reply).

That change is what the table below measures. Measured 2026-09-13 over `demo/seed-inbox.json` (12 threads), Claude Sonnet 4.6 on Bedrock `us-east-1`, sequential scan, runs of 277s, 276s and 263s. Every thread landed on its expected state in all three runs, the club meeting included; three runs is three runs, so rerun the harness after any prompt change.

```
thread         expected  run 1     run 2     run 3
thr-deposit    NEEDS_YOU NEEDS_YOU NEEDS_YOU NEEDS_YOU ✓
thr-housing    RESOLVED  RESOLVED  RESOLVED  RESOLVED  ✓
thr-insurance  NEEDS_YOU NEEDS_YOU NEEDS_YOU NEEDS_YOU ✓
thr-issue1     WAITING   WAITING   WAITING   WAITING   ✓
thr-club       WATCHING  WATCHING  WATCHING  WATCHING  ✓
thr-flight     WATCHING  WATCHING  WATCHING  WATCHING  ✓
thr-dentist    NEEDS_YOU NEEDS_YOU NEEDS_YOU NEEDS_YOU ✓
thr-return     NEEDS_YOU NEEDS_YOU NEEDS_YOU NEEDS_YOU ✓
thr-streaming  NEEDS_YOU NEEDS_YOU NEEDS_YOU NEEDS_YOU ✓
thr-form       NEEDS_YOU NEEDS_YOU NEEDS_YOU NEEDS_YOU ✓
thr-passport   WATCHING  WATCHING  WATCHING  WATCHING  ✓

agreement 11/11 threads over 3 runs
```

Update-from-new-evidence (delta scans), DynamoDB, live Gmail and action execution are later plan steps.

`AGENTS.md` here is the CLI's own guide to `agentcore/` config and applies alongside the root `AGENTS.md`.
