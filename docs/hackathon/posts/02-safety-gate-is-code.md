# Agents for Humans: a safety gate the model cannot talk its way past

*Draft for builder.aws. Written for developers whose agents take real actions on a user's behalf.*

---

Open Loops, our entry for the AWS Agents for Humans hackathon, decides what to do about the responsibilities it finds in your mail. It drafts replies, books calendar time, sets reminders. It can also propose paying a $200 registration deposit.

The difference between those two categories is the whole product. Get it wrong and you have built something nobody should connect to their real inbox.

One thing to be straight about up front, since it changes how you should read the rest: **effects are currently simulated.** Every action runs through a fixture sink that records what would have happened. Live Gmail and Calendar writes are the next step, behind the same interface. The gate described here is real and enforced today; the send is not yet wired to anything that leaves the building.

## "You are a careful assistant" is not a safety control

The tempting way to handle this is in the prompt. *Only take low-risk actions. Always ask before spending money.* It reads like a rule. It is a suggestion to a system whose entire job is to produce plausible text, and it sits in the same channel as the data you are asking it to reason about — which is to say, in the same channel as anything an attacker can put in an email.

We put the gate in application code instead, on the other side of the interface from anything a model can influence:

```ts
/** Policy gate applied by the orchestrator before any effect runs. */
export function mayExecute(action: ProposedAction): { ok: true } | { ok: false; reason: string } {
  if (action.status === 'EXECUTED') return { ok: false, reason: 'already executed' }
  if (action.status === 'CANCELLED' || action.status === 'FAILED')
    return { ok: false, reason: `action is ${action.status.toLowerCase()}` }
  if (action.status === 'APPROVED') return { ok: true }
  if (action.requiresApproval || action.riskTier === 'high')
    return { ok: false, reason: 'requires your approval' }
  if (!isAutoExecutable(action)) return { ok: false, reason: 'requires your approval' }
  return { ok: true }
}
```

Nothing here is negotiable in English. A high-risk action returns `ok: false` regardless of how persuasively the model argued for it, and the only way to flip it is a human pressing Approve, which sets `status` to `APPROVED` in the database.

## Actions are records, not calls

The second structural decision: an agent deciding to do something and something being done are separate events, separated by a row in DynamoDB.

The Risk Judge does not send email. It writes a `ProposedAction` with a type, a risk tier and a summary. That record sits in the ledger with `status: 'PROPOSED'` until either the policy gate allows it automatically or a person approves it. Only then does the Action Agent turn it into a concrete effect, and only then does an `ActionSink` — the single, narrow interface where effects leave the system — carry it out.

```ts
export interface ActionSink {
  execute(action: ProposedAction, plan: ActionPlan): Promise<ActionResult>
}
```

One interface. Today it has one implementation, `FixtureActionSink`, which records the effect it was asked to perform and returns a reference to it rather than contacting Google. Live Gmail and Calendar sinks are the planned second implementation behind the same interface, and are not built yet.

Sinks never decide policy either way. They do what they are told, after the gate has already run — which is the property that makes swapping in a live one a configuration change rather than a rewrite of the safety model.

The useful property is that "what the agent wanted to do" is durable and inspectable *before* it happens. You can show a user a list of proposed actions. You can audit what was proposed and never executed. You cannot do either if deciding and doing are the same function call.

## The bug we did not expect

Here is the part we would not have found without someone reviewing the flow rather than the function.

Marking a loop done by hand cancels its pending actions, so the agent never picks up work you have already closed. Fine. But an action *already in flight* is a different problem, and it produced a genuine lost update.

`executeAction` read the loop near the top, then called the model and the sink — about twenty seconds of wall clock — and then used that same object to write a status:

```ts
// before
if (plan.loopStatusAfter && canTransition(loop.status, plan.loopStatusAfter)) {
  const moved = applyTransition(loop, plan.loopStatusAfter, now)  // `loop` is twenty seconds stale
  await store.putLoop(moved)
}
```

If the user pressed "I already did this" during that window — which is exactly when the button is on screen — `putLoop` wrote a loop reconstructed from *before* their click. The status became whatever the plan wanted, `resolvedAt` was dropped, and the resolution vanished. On screen, a loop you had just closed reopened by itself.

Worth noting why the transition table did not catch it: `RESOLVED` is deliberately not terminal. Evidence can reopen a closed loop, because sometimes a payment bounces. So `RESOLVED → WAITING` is a legal move, and the guard that would have saved us was one we had deliberately chosen not to have.

The fix is to re-read immediately before writing, and to let the user win:

```ts
// after
const current = (await store.getLoop(userId, loop.id)) ?? loop
if (current.status === 'RESOLVED') {
  // The effect already happened and is recorded; only the status write is dropped.
  log({ evt: 'transition_skipped', actionId, loopId: loop.id, reason: 'already resolved' })
  await store.appendAudit(audit(userId, action, 'notification',
    `${plan.summary}; you had already marked this done, so it stays closed`, now))
} else if (canTransition(current.status, plan.loopStatusAfter)) {
  const moved = applyTransition(current, plan.loopStatusAfter, now)
  await store.putLoop(moved)
}
```

Two details we argued about and would defend:

**The effect stays recorded.** The draft really was produced. Discarding the evidence because we discarded the status change would leave the artifact orphaned — and once a live sink is wired up, that same path would mean a genuinely sent email with no trace of it on the loop. Only the status write is dropped.

**The skip is explained, not silent.** It writes an audit event the user can read: *you had already marked this done, so it stays closed*. An agent that quietly declines to do something is only marginally better than one that quietly does the wrong thing.

The regression test resolves the loop from inside the `plan` stub — the exact window — and asserts the loop stays `RESOLVED` with `resolvedAt` intact. We checked that it fails against the old code before keeping it: `expected 'WAITING' to be 'RESOLVED'`. A regression test that passes with and without the fix is decoration.

**What this does and does not close.** It closes the wide window: the twenty seconds spanning the model call and the sink, which is when a user is actually looking at the button. It does not make the write atomic. `getLoop` followed by an unconditional `putLoop` is still a read-modify-write, and a resolution landing between those two calls would still be overwritten. That window is microseconds rather than seconds, and no test covers it. Closing it properly means a conditional write — a version attribute and a condition expression on the update — which is the right fix for genuinely concurrent callers and which we have not done.

## What generalises

- **Put the gate where prompt injection cannot reach it.** If the rule lives in the prompt, it lives in the same channel as the attacker's input.
- **Make intent durable before it becomes action.** A row between deciding and doing gives you approval, audit and the ability to change your mind.
- **Re-read before you write, and know what that buys you.** Any agent step spanning a model call spans real time, and the world can change inside it. The stale-snapshot write is not an exotic failure: ours took twenty seconds to open and a single click to trigger. Re-reading closes that window. It does not make the write atomic — for that you want a conditional write against a version attribute.
- **Say no out loud.** Every refusal in our system writes an audit line. Users trust a system that explains itself; so do judges.

Source and the full pipeline: <https://github.com/Omggdavidd/AWS-Hackathon-2026>
