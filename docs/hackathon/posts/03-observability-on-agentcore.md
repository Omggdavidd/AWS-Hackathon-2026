# Agents for Humans: making a TypeScript agent observable on AgentCore Runtime

*Draft for builder.aws. Written for developers running agents on Bedrock AgentCore who need to see what happened.*

---

We deployed Open Loops, our AWS Agents for Humans entry, to Amazon Bedrock AgentCore Runtime. It worked. Then someone asked a reasonable question — *how do we know what it did?* — and we discovered our log group had almost nothing in it.

This is the post about fixing that, including the bug that caused it, which was ours and not the platform's.

## Per-step traces are not free for a TypeScript runtime

AgentCore gives you a lot. What we could not rely on was automatic per-step tracing of a TypeScript agent's internals — which specialist ran, how long it took, what it decided. If we wanted a judge to see the pipeline work, we had to emit it ourselves.

That is fine, because the runtime ships stdout to CloudWatch. One JSON object per line, one line per pipeline step, and the log group becomes a readable trace.

## The bug: our events never reached stdout

Before writing any logging, we found the actual reason the log group was empty. `main.ts` was buffering scan events into an array and yielding them only after `runScan` returned:

```ts
const events: string[] = []
await runScan({ ..., onEvent: (e) => events.push(JSON.stringify(e)) })
// events yielded here — after everything finished
```

`onEvent` existed for the web app's progress stream, and for that it is fine. But it meant that during a four-minute scan the runtime wrote nothing at all, and if the invocation failed midway, everything it had learned went with it. The most useful moment to have a log — the failure — was exactly the moment we had none.

Worth stating plainly because it is the general lesson: **a progress channel for a UI is not a log.** They have different consumers, different lifetimes and different failure modes. We needed both.

## The logger

`src/log.ts` is about forty lines. The design constraints were that it must default to silence, so the orchestrator stays side-effect free under test, and it must be injectable, so tests can capture lines without touching stdout.

```ts
export type Logger = (line: LogLine) => void

/** The default everywhere: logging is opt-in so the orchestrator stays silent under test. */
export const noopLogger: Logger = () => {}

/** JSON lines on stdout. `write` is injectable so tests can capture without touching stdout. */
export function jsonLogger(write = (c: string) => void process.stdout.write(c)) {
  return (line: LogLine) => write(`${JSON.stringify({ ts: new Date().toISOString(), ...line })}\n`)
}

/** Run `fn`, then log `line` with the elapsed milliseconds. Failures are logged and rethrown. */
export async function timed<T>(log: Logger, line: LogLine, fn: () => Promise<T>): Promise<T> {
  const started = Date.now()
  try {
    const result = await fn()
    log({ ...line, ms: Date.now() - started })
    return result
  } catch (err) {
    log({ ...line, ms: Date.now() - started, error: err instanceof Error ? err.message : String(err) })
    throw err
  }
}
```

`timed` logging the failure *before* rethrowing is the small detail that matters most in practice. A role that throws still leaves a duration and an error in the trace, so a failed scan is diagnosable rather than a gap.

Wiring it is one line in the runtime entry point, and behind a `--log-json` flag locally — on **stderr** there, so it cannot interleave with the human-readable progress on stdout.

## What a scan looks like now

| `evt` | When | Key fields |
|---|---|---|
| `scan_started` | once | `messages`, `threads` |
| `thread_started` | per thread | `threadId`, `messages` |
| `role` | per specialist call | `role`, `threadId`, `ms` |
| `loop_created` | a thread became a loop | `loopId`, `status`, `priority`, `riskLevel`, `interruptUser`, `ms` |
| `thread_skipped` | no loop | `threadId`, `reason`, `ms` |
| `action_blocked` | the gate refused | `actionId`, `reason`, `ms` |
| `sink` | an effect left the agent | `actionId`, `effect` (kind only), `ms` |
| `scan_completed` | once | `created`, `updated`, `skipped`, `byStatus`, `ms` |

Every line carries `ts` and `evt`; every step carries `ms`. That last column turned out to be the most valuable thing in the whole exercise — per-role durations are what told us the scan was dominated by sequential model round trips, which is what led to running three threads at a time and taking a twelve-thread scan from about 270 seconds to about 100.

The single most useful line, though, is `action_blocked`. When the policy gate refuses a high-risk action, the log says so and no `sink` line follows. The safety model stops being a claim in a README and becomes something you can point at in CloudWatch.

## What must not reach the log

Logging model output is where this gets dangerous, and we got it half right on the first attempt.

We were careful with effects from the start. The `sink` line records `plan.effect.kind` and never the effect itself, because a `draft_email` carries a recipient, a subject and a body, and a log group is the wrong place for any of them. There is a test that pins it — it asserts the recipient, subject and body of a drafted reply appear nowhere in the emitted lines, and fails if the payload is ever logged again.

What we missed was the other end. `thread_started` originally logged `subject: root.subject`. Harmless against fictional demo data, and a real problem the moment live Gmail is connected: subject lines are frequently the sensitive part of a message, and they would have been flowing into a log group with different retention and access rules than the ledger.

A reviewer caught it by noticing the inconsistency — careful about the effect, careless about the subject — and it came out. `thread_started` now carries the thread id and a count. The id is enough to find the thread in the ledger, where access and retention are the ledger's problem, which is where they belong.

The general rule we ended up with: **an identifier is almost always enough.** If a log line contains content rather than a pointer to content, ask what happens when the data stops being fictional.

## If you are doing this on AgentCore

- Write to stdout, one JSON object per line. The runtime ships it; CloudWatch Logs Insights queries it.
- Log durations per step. You will not guess correctly about where the time goes.
- Log refusals, not just successes. A line that proves your safety gate fired is worth more than ten that prove the happy path works.
- Make the logger injectable and default it to silent, so it never becomes a reason your tests need a runtime.
- Decide what may never be logged before you are looking at real data, and pin it with a test. Ours has already failed once in review, which is the only evidence that it works.

Source, log shapes and the CloudWatch queries: <https://github.com/Omggdavidd/AWS-Hackathon-2026>
