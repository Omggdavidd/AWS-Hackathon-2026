---
status: proposed
date: 2026-09-14
decision-makers: Ojulari123
---

# Loop writes can be compare-and-swap: a version on the record, a condition on the write

## Context and Problem Statement

`LedgerStore.putLoop` overwrites the row and nothing else. Seven read-modify-write sequences run through it (`web/lib/resolve.ts`, `web/lib/park.ts`, `web/lib/restore.ts` and several in `agent/app/OpenLoopAgent/src/actions.ts`), and the web app and the runtime write the same DynamoDB partition at the same time: a scan is running while someone clicks "I already did this", and ADR-0013's 07:00 catch-up can land on top of a manual run. Whoever writes last wins and the other change is gone, with no error and no audit trace. #66 patched one instance of this by re-reading the loop inside `executeAction`, which narrows the window but cannot close it: there is no way to say "write this only if nobody has changed it since I read it". The ledger is the product's memory (ADR-0004), so a silently dropped write is a responsibility the agent forgets.

## Considered Options

* A `version` counter on `OpenLoop` and an opt-in compare-and-swap on `putLoop`
* A DynamoDB transaction (`TransactWriteItems`) per write
* A lock table: take a lease on the user's partition before a scan, release it after
* Do nothing and keep re-reading close to the write, as #66 does

## Decision Outcome

Chosen option: "a `version` counter and an opt-in compare-and-swap", because it is the standard optimistic-concurrency pattern DynamoDB is built for, it costs one attribute and one `ConditionExpression`, and it can be added without touching a single existing caller. `putLoop(loop)` still overwrites, exactly as today; `putLoop(loop, { ifUnchanged: true })` writes under a condition on the stored version and bumps it. The loser gets a `StaleLoopWriteError` and nothing else does, so a caller can re-read, reapply its change and retry, and can tell that apart from a throttle or a network failure. An error rather than a `false` return, because the method has to hand back the record it stored (the caller needs the new version for its next write), and because a caller that ignores a boolean drops a write silently, which is the bug being fixed.

`version` is optional on the schema rather than defaulted to 0. A defaulted field is required in the inferred type, and that fails to compile in `web/lib/format.test.ts` and `web/lib/decisions.test.ts`, which build `OpenLoop` literals; more importantly every row already in `openloop-ledger` and every loop in `demo/seed-ledger.json` was written without it. Absent means 0 everywhere, and the DynamoDB condition for an expected version of 0 accepts `attribute_not_exists(version)`, so a row written before this ADR can be claimed exactly once and carries a version from then on.

`TransactWriteItems` was rejected: it is twice the write cost for a single-item write and still needs a condition to express "unchanged", so it buys nothing here; it is the right tool later if a loop and its actions must move together. A lock table was rejected because a lease needs a TTL, a renewal and a recovery path for a runtime that dies holding it, which is more moving parts than the whole feature. Doing nothing was rejected because the race is not theoretical: the interleaving is reproducible in a few lines against both stores, and the catch-up schedule makes an unattended writer a permanent fixture.

### Consequences

* Good, because a lost update is now expressible and catchable; the shared contract suite holds both stores to it (a stale write is refused, a fresh one succeeds, the version advances), and CI runs it against DynamoDB Local.
* Good, because nothing changes for existing code: `putLoop(loop)` behaves as before, old rows stay valid, and no caller was edited in the change that added this.
* Bad, because the guard only holds between callers that opt in. A blind `putLoop` does not touch the version, so it can still overwrite a compare-and-swap writer's row without either side noticing. The read-modify-write sites in the web app (done, park, restore) and the agent (the delta path and the action agent) are converted in the same change, each bounded to three attempts; a blind write elsewhere still bypasses the guard, so the invariant is only as strong as the callers that opt in.
* Bad, because a retry loop is now a caller's problem. There is no retry helper in `@openloop/shared`; each converted caller carries its own three-attempt loop, and a shared helper is left for whoever adds the next site.
* Neutral, because the counter is one number per loop row: no extra read, no index, no measurable cost.

## More Information

* DynamoDB conditional writes: <https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithItems.html#WorkingWithItems.ConditionalUpdate>
* `version` is a DynamoDB reserved word, so the condition uses a `#version` name placeholder.
* Related: ADR-0004 (the ledger is the source of truth), ADR-0009 (single table), ADR-0013 (the scheduled catch-up that adds a second unattended writer), #66 (the re-read that narrowed one instance of this race).
* Revisit when a write has to span more than one row, for example closing a loop and cancelling its proposed actions together: that is where `TransactWriteItems` earns its cost.
