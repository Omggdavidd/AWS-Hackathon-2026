---
status: proposed
date: 2026-09-14
decision-makers: tdare514
---

# A runtime lock lives in a CONFIG row of the ledger table, and a shared secret lifts it

## Context and Problem Statement

The deployment at <https://openloop-neon.vercel.app> is public and every agent path spends Bedrock tokens. Two situations need a switch that works in seconds: an incident (a script, a bill, a bad prompt reaching production) and a recording or a judging window where the ledger must stay readable while nothing may change under it. The daily ceiling (#180) bounds a runaway script but has no off position, and `docs/security.md` is explicit that the app has no accounts: there is no principal to authorise anything against. So this decision is really two: where the switch is stored, and what stands between a stranger and flipping it back. ADR-0009 describes the table as `USER#` and `LOOP#` partitions, and a lock is neither.

## Considered Options

* A row at `PK=CONFIG / SK=RUNTIME_LOCK` in the ledger table, read by the runtime and the web app, with `OPENLOOP_LOCK_DEFAULT` as a floor the row may only tighten, and `OPENLOOP_UNLOCK_KEY` (a shared secret compared server-side) required to resume
* An environment variable alone: change `OPENLOOP_LOCK_DEFAULT` and redeploy both the web app and the runtime
* A second store for configuration: SSM Parameter Store, AppConfig or a feature-flag service
* Real accounts first: finish Google OAuth (#20), then an admin role that owns the switch

## Decision Outcome

Chosen option: "a `CONFIG / RUNTIME_LOCK` row with an environment floor and a shared secret", because it is the only one that takes effect within seconds from a phone, needs no new AWS service or IAM change, and is enforced where it matters. The runtime checks the mode in `main.ts` before any command dispatch or specialist creation, so a caller that skips the web app still cannot reach a model. The environment stays the floor: the row may tighten the mode, never loosen it, and a failed read falls back to the floor, so a DynamoDB blip can neither invent a lock nor undo one. Reads are cached for ten seconds, which is the worst-case lag on a resume.

The secret is the first authentication in this codebase, and it is deliberately narrow: it authenticates one privileged operation (resume), not a user, and it is checked with a constant-time comparison of two digests, never stored in the browser or the table. Pausing needs no secret, because pausing is the safe direction. That asymmetry has one sharp edge: on a deployment where `OPENLOOP_UNLOCK_KEY` is unset, a public Pause button would be a one-way door, recoverable only with a CLI `delete-item`. So the Settings controls are inert until the key exists, the way the agent buttons are inert until a runtime is configured, and the server action ignores the request as well as disabling the button. `OPENLOOP_LOCK_DEFAULT` and a row written outside the app still work in that state.

A second store is more machinery than a three-valued flag deserves, and it would put the switch somewhere the runtime does not already have credentials for. Waiting for accounts is right in the long run and useless tonight.

### Consequences

* Good, because one click stops every model call for every caller, including the scheduled catch-up (ADR-0013), and the whole ledger, its evidence and its timeline stay readable.
* Good, because the table's non-user partitions (`RATE#<date>` from the daily ceiling, now `CONFIG`) are outside the `USER#` partitions the demo reset walks, so a reset cannot delete the lock and the lock cannot be mistaken for a user's record.
* Bad, because a shared secret is not an identity: it cannot be revoked per person, it is only as good as the password manager it lives in, and anyone who has it can resume. It is a break-glass switch, not an admin console.
* Bad, because the layout in ADR-0009 is no longer the whole story; this ADR and `docs/architecture.md` now carry the non-user partitions, and a future key-layout change has to consider them.
* Bad, because every page render reads the lock row (strongly consistent, ten-second cache) and `pnpm reset-demo` reads it before deleting anything, which is one more call that can fail. Both fall back to the environment floor.

## More Information

* Enforcement: `packages/ledger-dynamo/src/runtime-lock.ts` (read, write, cache), `agent/app/OpenLoopAgent/main.ts` (before dispatch), `web/lib/runtime-lock.ts` and `web/app/actions.ts` (UI gate, unlock key, approvals).
* Security posture and what stays deliberately open: `docs/security.md`.
* Revisit when #20 gives the app real identities: an admin role replaces the shared secret, and the row becomes one of several settings rather than a special case.
