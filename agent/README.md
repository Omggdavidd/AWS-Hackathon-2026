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
pnpm --filter @openloop/agent test              # stub-based, no AWS needed
pnpm --filter @openloop/agent dev               # runtime server on :8080 (same as agentcore dev, without the inspector)
agentcore dev                                   # interactive local runtime with inspector (needs a real terminal)
agentcore deploy / status / invoke / logs       # AWS; first deploy bootstraps CDK
```

Invocation payload (validated by the Zod schema in `main.ts`):

```json
{ "command": "scan", "userId": "user-alex", "source": { "kind": "fixture", "path": "demo/seed-inbox.json" }, "ledger": { "kind": "local", "path": ".openloop/ledger.json" } }
```

Requires AWS credentials with Bedrock access (`aws configure`, region `us-east-1`) and the account's Anthropic use-case form accepted. `OPENLOOP_MODEL_ID` overrides the model.

## Known calibration

Against `demo/seed-ledger.json` the pipeline produces the same 9 loops and states, except the rescheduled club meeting, which the Investigator still marks Needs You rather than Watching. Update-from-new-evidence (delta scans), DynamoDB, live Gmail and action execution are later plan steps.

`AGENTS.md` here is the CLI's own guide to `agentcore/` config and applies alongside the root `AGENTS.md`.
