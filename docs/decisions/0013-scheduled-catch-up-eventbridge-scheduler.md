---
status: proposed
date: 2026-09-13
decision-makers: Omggdavidd
---

# The agent checks in on its own: a daily catch-up scheduled with Amazon EventBridge Scheduler

## Context and Problem Statement

Everything the agent does today starts with a click or a script: `runScan`, `handleWhatYouCan` and `catchUp` have no trigger of their own. The Everyday Agents pitch is an agent that works while nobody is looking and interrupts only for a real decision, and the interrupt gate (#99, #111) already makes silence the default. What is missing is a trigger, not intelligence. The spec lists a scheduled task as one of the three user triggers (`docs/hackathon/SPEC.md` §8, trigger table). A scheduled run also changes who paces the spend: a button is paced by a person, a schedule by itself, so the cheapest command and a cadence a person can predict matter more than latency.

## Considered Options

* Amazon EventBridge Scheduler invoking the AgentCore runtime directly (universal target), once a day, with the `catch_up` command
* The same schedule running `scan`, or `scan` on the delta path, hourly
* Vercel cron hitting `/api/catch-up`
* A Gmail push subscription (`users.watch` and Pub/Sub) waking the agent on new mail

## Decision Outcome

Chosen option: "EventBridge Scheduler, daily, `catch_up`", because it needs no new code path, no new runtime, no Google project, and costs about a cent a run: `catch_up` builds its digest in code and makes one model call to write the sentences, so it is roughly fifty times cheaper than a scan and finishes in seconds, inside the synchronous universal-target window that a 95-second scan would blow through. The schedule runs once a day at 07:00 America/New_York, the time the demo persona would read a morning digest, so the audit mark it leaves (`catch_up`, which moves the baseline the next Catch me up summarizes from) lands at a time no one is demonstrating the product. The scheduler assumes the `openloop-scheduler` IAM role, which can invoke exactly one runtime and nothing else; the role and the schedule are created by `pnpm --filter @openloop/agent create-schedule`, which is idempotent.

`scan` on a schedule is rejected for now: a scan is fifty cents and one to five minutes, EventBridge's synchronous target gives up around thirty seconds, and a scheduled scan overlapping a person's scan is a race the ledger has no lock for. Vercel cron on the Hobby plan fires once a day somewhere inside a chosen hour, which is fine for the cadence but adds a second scheduler for no gain when the runtime already has an IAM role. Gmail push depends on the Google Cloud project that #20 still needs and on a public endpoint; it is the last step, after incremental sync, and after the hackathon.

### Consequences

* Good, because the activity feed and the change banner show the agent checked in while nobody was there, which is the unattended story, for about thirty cents a month.
* Good, because the spend is bounded by construction: one cheap command, once a day, and the $25 budget alarm on the account is the backstop.
* Bad, because a run during a recording session would move the Catch me up baseline; `docs/hackathon/DEMO.md` says when it fires and how to disable it (`pnpm --filter @openloop/agent create-schedule -- --disable`).
* Bad, because a scheduled `scan` or `handle` would need a run lock on the ledger and an asynchronous target (a small Lambda that starts the runtime and returns); neither exists, so the agent still only reads mail when a person asks.

## More Information

* EventBridge Scheduler universal targets: <https://docs.aws.amazon.com/scheduler/latest/UserGuide/managing-targets-universal.html>
* InvokeAgentRuntime: <https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeAgentRuntime.html>
* Cost analysis that led here: September's Bedrock spend was about 28 scans at fifty cents; the agreement harness at three scans per run was the largest multiplier (#155).
* Revisit when live Gmail exists (#20): incremental sync with `users.history.list` and a stored `historyId`, with a full re-sync on a 404, is the next step; push comes last.
