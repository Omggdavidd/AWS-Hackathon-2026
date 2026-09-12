# Observability evidence

What we show judges as proof the AgentCore deployment is real (SPEC §13 must-ship, §17 Technical
Implementation). Per-step traces are not automatic for TypeScript runtimes (ADR-0008), so the
evidence is the runtime's structured log: `runScan` and `executeAction` emit one JSON line per
pipeline step to stdout, which the Runtime ships to CloudWatch.

## The log lines

Emitted by `agent/app/OpenLoopAgent/src/log.ts`, wired in `main.ts` (the Runtime) and behind
`--log-json` in the local runner. Every line carries `ts` and `evt`; steps carry `ms`.

| `evt` | When | Key fields |
|---|---|---|
| `scan_started` | once per scan | `messages`, `threads` |
| `thread_started` | per thread | `threadId`, `messages` |
| `role` | per specialist call | `role` (extract, investigate, judge, update, plan), `threadId`, `ms` |
| `loop_created` | a thread became a loop | `threadId`, `loopId`, `status`, `priority`, `riskLevel`, `actions`, `ms` |
| `loop_updated` | delta path moved a loop | `threadId`, `loopId`, `from`, `to`, `ms` |
| `thread_skipped` | no loop from this thread | `threadId`, `reason`, `ms` |
| `scan_completed` | once per scan | `threads`, `created`, `updated`, `skipped`, `byStatus`, `ms` |
| `action_started` / `action_blocked` / `action_executed` / `action_failed` | one action | `actionId`, `loopId`, `reason` or `error`, `ms` |
| `sink` | the effect left the agent | `actionId`, `effect` (the kind only), `ms` |

A blocked high-risk action logs `action_blocked` and never reaches `sink` — the policy gate is
visible in the log, which is the point worth showing a judge.

**What must not reach the log.** The `sink` line records `plan.effect.kind` and never the effect
itself: a `draft_email` effect carries the recipient, subject and body, and a log line is the wrong
place for any of them. `test/actions.test.ts` pins this — it asserts the recipient, subject and body
of a drafted reply appear nowhere in the emitted lines, and it fails if the payload is logged again.

No message content reaches the log at all: `thread_started` carries the thread id and a count, not
the subject line. Subjects are often the sensitive part of a message, and `docs/architecture.md` §4
commits to ids and excerpts over full content — the `threadId` is enough to find the thread in the
ledger, where access and retention are the ledger's rather than the log group's. The human-readable
progress from `scan -- --reset` still prints subjects to stdout for whoever is watching a local run.

## Capturing it

Log group: `/aws/bedrock-agentcore/runtimes/OpenLoop_OpenLoopAgent-CA60RSCE0z-DEFAULT`
(`us-east-1`). Run a scan against the deployed runtime, then in **CloudWatch → Logs Insights**:

```
# the pipeline, newest scan first
fields @timestamp, evt, threadId, role, ms, status
| filter ispresent(evt)
| sort @timestamp asc
| limit 200
```

```
# where the time goes, per role
filter evt = 'role'
| stats count(*) as calls, avg(ms) as avg_ms, max(ms) as max_ms by role
```

Locally, the same lines without AWS:

```
pnpm --filter @openloop/agent scan -- --reset --log-json 2>pipeline.jsonl
```

## Captures

Taken 2026-09-12 from one scan of the 12-thread demo inbox against the deployed runtime
(session `obs-evidence-20260912181241…`, ephemeral ledger, so the shared table was untouched).

- [`logs-insights-pipeline.png`](logs-insights-pipeline.png): the first query, one line per thread,
  role and outcome, in order.
- [`role-durations.png`](role-durations.png): the second query, calls and average and maximum
  milliseconds per specialist role.
- [`runtime-metrics.png`](runtime-metrics.png): the runtime's CloudWatch metrics for the last 24
  hours (invocations, sessions, latency, errors, throttles) from the `AWS/Bedrock-AgentCore`
  namespace.
- [`pipeline-2026-09-12.jsonl`](pipeline-2026-09-12.jsonl): the raw structured lines of that scan
  as CloudWatch stored them, so the tables above can be checked against the source.

The tables are rendered from `aws logs get-query-results` and `aws cloudwatch
get-metric-statistics` output rather than photographed from the console, so anyone with the
`openloop-*` IAM user can reproduce them without a console login:

```
LG=/aws/bedrock-agentcore/runtimes/OpenLoop_OpenLoopAgent-CA60RSCE0z-DEFAULT
aws logs start-query --region us-east-1 --log-group-name $LG --start-time <epoch> --end-time <epoch> \
  --query-string "fields @timestamp, evt, threadId, role, ms, status | filter ispresent(evt) | sort @timestamp asc | limit 200"
aws logs get-query-results --region us-east-1 --query-id <id>
aws cloudwatch get-metric-statistics --region us-east-1 --namespace AWS/Bedrock-AgentCore --metric-name Invocations \
  --dimensions Name=Resource,Value=<runtime arn> Name=Operation,Value=InvokeAgentRuntime Name=Name,Value=OpenLoop_OpenLoopAgent::DEFAULT \
  --start-time <iso> --end-time <iso> --period 86400 --statistics Sum Average Maximum
```

**No trace.** `agentcore traces list` answers `Traces are only supported for Python agents.
TypeScript agents do not support observability traces.` (CLI 0.28.1), which is the ADR-0008
limitation stated plainly by the tool. The structured log is the trace.
