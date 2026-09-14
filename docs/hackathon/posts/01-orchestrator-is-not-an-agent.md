# Agents for Humans: we put the orchestrator in plain TypeScript, not in a prompt

*Draft for builder.aws. Written for developers building multi-step agents on Bedrock.*

---

We built Open Loops for the AWS Agents for Humans hackathon. It reads a person's email and calendar and keeps a ledger of every responsibility that is still open — the deposit due Friday, the form nobody chased, the reply someone is still waiting on. It handles the low-risk ones itself and interrupts you only when a real decision is needed.

The interesting part is not the model. It is where we refused to put one.

## The shape most agent demos take

The obvious design is a single capable agent with a big prompt and a pile of tools. Give it the inbox, tell it to find responsibilities, let it decide what to do. It demos well and it is very hard to reason about: when it produces a wrong answer you are debugging English, and when it produces a right answer you cannot tell whether it will do so again.

We went the other way. Seven narrow specialists, each with one job and a typed output, and an orchestrator that is ordinary TypeScript.

```ts
export interface Specialists {
  extract(input: { thread: EmailMessage[]; now: string }): Promise<ExtractorOutput>
  investigate(input: { candidate: ...; thread: EmailMessage[]; now: string }): Promise<InvestigatorOutput>
  judge(input: { loop: ...; evidence: ... }): Promise<JudgeOutput>
  plan(input: { loop: ...; action: ProposedAction; ... }): Promise<ActionPlan>
  // update, summarize, answer
}
```

The Extractor answers one question: does this thread contain a responsibility? The Investigator answers a different one: is it already done? The Risk Judge assigns a tier, a priority and a next action. The Action Agent turns an approved decision into a concrete effect.

None of them talks to another. The orchestrator does.

## The orchestrator is code

`runScan` is a function. It groups messages by thread, decides which threads are new and which already have a loop, calls the right specialist for each, and writes the result to DynamoDB. It contains no model call of its own, and nothing it does is delegated to one.

That distinction is worth being precise about, because "multi-agent" usually implies agents deciding what happens next. Ours do not. They answer questions. Control flow, deduplication, state transitions, what gets written and in what order — all of that is in TypeScript, where it can be read, tested and stepped through.

The practical payoff showed up immediately in the test suite:

```ts
const stubs = { async extract() { ... }, async investigate() { ... } } as Specialists
const summary = await runScan({ source, store, userId: 'u', specialists: stubs, now })
expect(summary.threads).toBe(12)
expect(summary.created).toBe(11)
```

Because the specialists sit behind an interface, the orchestrator can be tested with stubs. **No test in our CI calls a model.** The whole suite runs in seconds, on every pull request, with no AWS credentials and no cost. The thing that is expensive and non-deterministic — the model — is at the leaves, and the thing that has to be correct every time — the state machine — is in code that behaves the same way twice.

## Every hop is a parsed schema

Free text never crosses a boundary as data. Every specialist returns structured output that is parsed with a Zod schema before anything downstream sees it:

```ts
export const OpenLoop = z.object({
  id: Id,
  title: z.string().min(1).max(120),
  status: LoopStatus,            // NEEDS_YOU | WAITING | WATCHING | RESOLVED | UNCERTAIN
  confidence: Confidence,
  sourceRefs: z.array(SourceRef).min(1),
  // ...
})
```

`sourceRefs` having `.min(1)` is not decoration. A loop that cannot say which message it came from is not a loop we are willing to store, and the schema is where that is enforced rather than in a code review.

This also means a model that drifts fails loudly at the boundary instead of quietly writing a malformed record that surfaces three screens later in the UI.

## Bounded parallelism, and why it needed locks

Our first version processed threads one at a time. A full scan of the twelve-thread demo inbox took 263 to 277 seconds across three runs — too slow to show on camera.

The naive fix is `Promise.all` over the threads. That breaks a single-table ledger in two ways: two threads that mention the same responsibility can both decide to create it, and interleaved writes can land out of order within a thread.

So the concurrency is bounded and the writes are serialised where it matters:

```ts
/** Threads run in parallel; three keeps the Bedrock round trips overlapping without hammering it. */
const DEFAULT_CONCURRENCY = 3

const commit = mutex()        // one writer at a time for ledger commits
const loopLock = keyedMutex() // one queue per loop id, so unrelated loops still run in parallel
```

Three workers, a mutex around the commit, and a keyed mutex so that two threads touching the *same* loop queue behind each other while everything else overlaps. Same twelve threads, same eleven loops, same states: **95 to 105 seconds.**

## The cheaper-model trap

The obvious next optimisation is a cheaper model for the cheapest role. The Extractor only answers yes or no, so we tried Claude Haiku 4.5 there and kept Sonnet everywhere else.

It was faster — 76 seconds on the inbox we had at the time. It also read one thread as "not a responsibility" and produced eight loops where we expected nine. The missing one was a write-up a professor was waiting on, which is exactly the kind of quiet obligation the product exists to catch.

A 25% speedup that silently drops a responsibility is not a speedup. It is a correctness regression with a nice benchmark. The per-role override stayed in the code as an environment variable, defaulting off:

```ts
export function loadModelsByRole(model = loadModel(), extractorModelId = process.env.OPENLOOP_EXTRACTOR_MODEL_ID) {
  const extract = extractorModelId ? loadModel(extractorModelId) : model
  return { extract, investigate: model, judge: model, plan: model, /* ... */ }
}
```

The lesson we would pass on: when you swap a model for a cheaper one, measure the *output*, not the latency. We only caught it because the expected outcome of every demo thread is pinned by a test.

## What we would keep

If we built this again on Bedrock, the three decisions we would not change:

1. **Put orchestration in code.** Models are good at judgement and bad at being a state machine. Let them answer questions and keep the control flow where you can debug it.
2. **Type every hop.** A schema at each boundary turns "the model said something odd" into a stack trace at the point of failure.
3. **Make the expensive thing injectable.** Specialists behind an interface meant we could run the entire orchestrator in CI, for free, on every commit.

The stack, for completeness: Strands Agents TypeScript SDK, Claude Sonnet 4.6 on Amazon Bedrock, deployed to Bedrock AgentCore Runtime, one DynamoDB table behind a storage adapter, Next.js on the front.

Source, architecture decisions and the full test suite: <https://github.com/Omggdavidd/AWS-Hackathon-2026>
