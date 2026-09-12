# agent

AgentCore CLI project (ADR-0008) containing the Strands agent (ADR-0003, ADR-0007). Run every `agentcore` command from this directory.

```
agent/
├── agentcore/            CLI config: agentcore.json (resources), aws-targets.json (deploy targets), cdk/ (generated, do not edit)
└── app/OpenLoopAgent/    @openloop/agent: the runtime entry point and the specialist pipeline
    ├── main.ts           BedrockAgentCoreApp: POST /invocations, GET /ping (port 8080)
    ├── src/agents/       Extractor, Investigator, Risk Judge as structured-output Agents; prompts.ts
    ├── src/tools/        search_inbox, get_thread, list_calendar_events, find_open_loops
    ├── src/scan.ts       Orchestrator: thread -> extract -> investigate -> judge -> ledger
    ├── scripts/scan.ts   Local runner over demo/seed-inbox.json with the real model
    └── test/             Orchestrator tests with stubbed specialists (no model calls)
```

## Commands

```
pnpm --filter @openloop/agent scan -- --reset   # real model over the demo inbox, ~4 min, writes .openloop/agent-ledger.json
pnpm --filter @openloop/agent scan -- --delta   # then the next-morning batch (demo/seed-inbox-delta.json): updates, not duplicates
pnpm --filter @openloop/agent scan -- --handle  # execute every allowed proposed action (drafts, calendar, reminders); high risk waits for approval
pnpm --filter @openloop/agent scan -- --catch-up  # what changed since the last catch-up, written from the ledger only
pnpm --filter @openloop/agent test              # stub-based, no AWS needed
pnpm --filter @openloop/agent dev               # runtime server on :8080 (same as agentcore dev, without the inspector)
agentcore dev                                   # interactive local runtime with inspector (needs a real terminal)
pnpm --filter @openloop/agent deploy-runtime            # prepare-deploy + agentcore deploy -y --json (~1-2 min)
agentcore deploy --dry-run -y --json            # synth only; check agentcore/cdk/cdk.out/asset.*.zip has _deps/
agentcore status --json                         # runtime ARN and state
agentcore logs                                  # CloudWatch logs
```

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

Commands: `scan` (default), `handle` (execute every proposed action the policy allows and list the rest), `execute` with `actionId` (one action, used by the web after approval), `catch_up` (state changes since the previous catch-up or `since`; the digest is built in code, the model only writes the sentences, and a `catch_up` audit event marks the check). The policy gate is `mayExecute` in `@openloop/shared`: low risk and prepare-type medium risk run automatically; high risk only when the record is `APPROVED`. Effects go through `FixtureActionSink` today (simulated, recorded as evidence with source `action:<id>`); Gmail and Calendar sinks are the live-path stretch.

Requires AWS credentials with Bedrock access (`aws configure`, region `us-east-1`) and the account's Anthropic use-case form accepted. `OPENLOOP_MODEL_ID` overrides the model.

## Structured logs

`runScan` and `executeAction` take an optional `logger`. It defaults to silence, so the orchestrator
stays side-effect free under test; `main.ts` wires `jsonLogger()` so the deployed runtime writes one
JSON line per pipeline step to stdout for CloudWatch. Locally:

```
pnpm --filter @openloop/agent scan -- --reset --log-json 2>pipeline.jsonl
```

Lines go to stderr so they never interleave with the human-readable progress. Line shapes, the
Logs Insights queries and what to screenshot are in `docs/architecture/observability/`.

## Known calibration

Against `demo/seed-ledger.json` the pipeline produced the same 9 loops and states, except the rescheduled club meeting, which the Investigator marks Needs You rather than Watching in about half the runs. That run predates the `thr-form` and `thr-passport` threads (#40); the expected ledger now has 11 loops and a real scan has not been re-run against it. Update-from-new-evidence (delta scans), DynamoDB, live Gmail and action execution are later plan steps.

`AGENTS.md` here is the CLI's own guide to `agentcore/` config and applies alongside the root `AGENTS.md`.
