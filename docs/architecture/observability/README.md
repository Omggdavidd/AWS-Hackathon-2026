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

## Screenshots

Drop them here and reference them from `docs/architecture.md` §6 and the demo script:

- `logs-insights-pipeline.png` — the per-thread/per-role lines of one scan
- `runtime-metrics.png` — the AgentCore runtime metrics dashboard
- `role-durations.png` — the per-role duration table (optional, from the second query)

If `agentcore traces` yields anything for the TypeScript runtime, add `trace.png` too; if it does
not, say so in the PR rather than leaving a gap.
