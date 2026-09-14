# Security posture

What the deployed system exposes, what is deliberately open, and what is still outstanding. Reviewed 2026-09-13 against `main` and the live deployment; every claim below re-checked against the code 2026-09-14.

This file owns the security posture. Environment variables live in the `.env.example` next to the code, IAM policy in `agent/app/OpenLoopAgent/iam/`, and the invariants that the product depends on in [`architecture.md`](architecture.md) §4.

## What is deliberately open

**There is no authentication, and that is the current design.** `web/lib/ledger.ts` hard-codes `USER_ID = 'user-alex'`; ADR-0011 puts Google OAuth in the web app but it is not wired up, and `architecture.md` §6 says the session is the user identity "in the hackathon". A judge has to be able to open the URL and click things. Adding a login before submission would cost us the thing the live URL is for.

Consequences, accepted knowingly:

- Anyone with the URL sees the demo ledger. The ledger contains no real personal data — every person, address and organisation in `demo/` is invented. (Onboarding does put what a visitor types about themselves in that visitor's own cookies; see *Application surface*.)
- Anyone with the URL can change that ledger: approve an action, mark a loop done, park one.

Neither of those is a data-protection problem, because the ledger holds no real data and there is one user. The problem is the next one.

## The real exposure: unauthenticated spend

`POST /api/scan`, `/api/handle`, `/api/catch-up` and `/api/ask` each invoke the deployed AgentCore runtime, which spends real Bedrock tokens. A full scan is about 95 to 105 seconds of Claude Sonnet 4.6 across three threads at a time. The account is **self-funded with no credits left** (`STATUS.md` *Blocked*), so this is somebody's money.

Before this review, any script that could reach the URL could run those in a loop. The guard is live: a POST without a matching `Origin` returns 403 from the deployment, checked 2026-09-13 on `/api/scan`, `/api/handle` and `/api/catch-up`; `/api/ask` was checked the same way against a production build before it shipped.

**Mitigated:** every route handler that invokes the runtime now rejects any request that did not come from the app's own origin (`web/lib/same-origin.ts`). Browsers always send `Origin` on a POST, so the app works unchanged; `curl` and most bots send nothing and get a 403. This also closes the CSRF hole — before it, any page a teammate visited could have fired a scan from their browser. Next's Server Actions check `Origin` against `Host` only when an `Origin` header is present; a handcrafted POST with no `Origin` is let through with a logged warning (`action-handler.js` in Next 16). Action ids are in the public HTML, so every server action in `web/app/actions.ts` that writes anything — a loop's state, a proposed action, or the profile and agent-name cookies — calls the same guard as its first statement. `approveAction` is the one that spends Bedrock through `execute` and `resetDemo` the one that wipes the demo user's rows; the rest only move a loop between states or change a name, and they carry the guard because one rule is easier to keep right than a list of exceptions. `web/lib/action-origin.test.ts` calls each action with and without an `Origin`, so a guard that goes missing fails the test suite.

`/api/ask` is the only one of those routes that takes arbitrary user text and hands it to a model holding ledger-read tools (`find_open_loops`, `get_loop_evidence`). The 500-character cap on the question bounds what one request costs, not what it says: a prompt that talks the model into an unhelpful answer is still possible, and the defence against it is that the `ask` path holds no sink and can only read one user's own ledger, so the worst outcome is a wrong answer rather than an effect.

**Not fully mitigated, and this is the honest limit:** an attacker who sets one header walks straight through. An origin check is a bill boundary against casual abuse, not a defence against anyone trying. Two things bound the damage past that point:

1. **An AWS budget alarm.** In place: a $60 monthly cost budget with email alerts at 85% and 100% of actual spend and 100% of forecast, verified from the CLI 2026-09-13 (#144, ticked in `SUBMISSION.md`) and raised from $25 on 2026-09-14 after the first four days of scans cost about $30, almost all of it local CLI runs rather than the public URL. Note what it is and is not — a tripwire, not a hard cap. AWS does not stop the spend when it fires, it tells us the spend happened, so it bounds how long abuse runs unnoticed rather than what it costs.
2. **A rate limit on those routes.** There is one now. `withinDailyCeiling` (`web/lib/ceiling.ts`) counts every invocation of a paid path — `/api/scan`, `/api/handle`, `/api/catch-up`, `/api/ask` and `approveAction` — into one DynamoDB row per UTC day (`PK=RATE#<date>`, outside the `USER#` partitions a demo reset walks) and refuses past 500. `OPENLOOP_DAILY_INVOCATIONS` overrides the number; `0` disables the ceiling rather than closing it, so `1` is the break-glass value. Three things to be precise about:
   - **It fails open, deliberately.** No table configured, an unreachable or throttled table, a malformed counter: each lets the request through. Locking a judge out mid-evaluation would cost more than the abuse it prevents. The price is that a broken counter and an unused one look identical from outside.
   - **It is per deployment, not per IP.** There is no principal to count against, so one caller can spend the day's allowance and everyone else gets a refusal until midnight UTC. That turns unbounded spend into a denial of service against ourselves, which is the better of the two and still not good.
   - **It bounds runaway spend; it does not enforce the budget.** 500 invocations at the price of a scan is roughly $250 against a $60 alert. It stops a runaway script, not the bill. And nothing has yet read a `RATE#` row back from the deployment: if `openloop-web` could not `UpdateItem`, the ceiling would fail open on every request with no symptom. Confirm a `PK = RATE#<today>` row exists after the app has been used before trusting it.
3. **A deliberate runtime lock** (ADR-0014). `CONFIG / RUNTIME_LOCK` has three states: `open`, `demo` and `locked`. The last two keep the ledger and every evidence page readable but stop before command dispatch in `agent/app/OpenLoopAgent/main.ts`, so a caller that bypasses the web UI still cannot reach a model; Scan, Check for new mail, Handle, Catch me up, Ask and Approve all refuse while it is on, and `pnpm reset-demo` refuses before deleting anything rather than emptying the table for a rescan that cannot run. `OPENLOOP_LOCK_DEFAULT` is the safety floor and a table row may only tighten it; a failed read falls back to the floor. Reads are cached for ten seconds, which is the worst-case lag on a resume. Two things to be precise about:
   - **Pausing is public, resuming is not.** Anyone with the URL may pause the agent, because pausing is the safe direction. Resuming requires `OPENLOOP_UNLOCK_KEY`, compared server-side as two digests in constant time and never stored in the browser or the table. That is the first authentication in this app, and it authenticates one operation, not a person: it cannot be revoked per teammate and anyone holding it can resume.
   - **With no key set, the Settings controls do nothing.** Otherwise a public Pause would be a one-way door: nobody could resume from the UI and recovery would be a CLI `delete-item` on `CONFIG/RUNTIME_LOCK`. Both the buttons and the server action are inert until `OPENLOOP_UNLOCK_KEY` exists. `OPENLOOP_LOCK_DEFAULT` and a row written from the CLI still pause the runtime in that state.

## Response headers

`web/next.config.ts` now sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` denying camera, microphone, geolocation and payment. Vercel already sends HSTS with a two-year max-age and preload.

**No Content-Security-Policy.** Next injects inline bootstrap script and style, so a `script-src` worth having needs per-request nonces through middleware. A CSP that breaks the app the day before a submission is worse than a missing one. It is the right follow-up once the deadline is past.

## Secrets

- No credential has ever been committed: `gitleaks` runs on every pull request and push, `check_context.py` fails the build on a secret-shaped filename, and the root `.gitignore` covers `.env` and `.env.*` with an exception only for `.env.example`.
- `web/.env.example` carries placeholders only — `<account-id>`, `<runtime-id>` — and its AWS key lines are commented out.
- Credentials reach the deployed app as Vercel environment variables on the least-privilege `openloop-web` IAM user, and reach a developer machine from `~/.aws`. Neither path goes through the repository.

**The AWS account ID `970547374543` is in the public repository**, in `agent/agentcore/aws-targets.json` and `agent/agentcore/.cli/deployed-state.json`, along with the runtime ARN and an IAM role ARN. It has been there since #8 and the AgentCore CLI's own `.gitignore` opts the state file in deliberately.

An account ID is not a credential and AWS does not treat it as a secret, but it is information a stranger does not need: it makes resources enumerable by name and role ARNs guessable. It is not worth rewriting published history for, and the `main` ruleset forbids that anyway. Worth a deliberate "we accept this" rather than nobody having noticed.

## IAM

The runtime's DynamoDB policy (`agent/app/OpenLoopAgent/iam/dynamodb-ledger.json`) is properly narrow: `GetItem`, `PutItem`, `UpdateItem`, `Query` and `BatchWriteItem` on `openloop-ledger*` only. No `DeleteItem`, no `Scan`, no other table, no other service. A compromised runtime cannot drop the table.

The `openloop-web` user for Vercel is scoped to DynamoDB item and query actions on the table plus `bedrock-agentcore:InvokeAgentRuntime` on the runtime ARN (#19). Verified from the CLI on 2026-09-13: one attached policy, `OpenLoopWebLeastPrivilege`, allowing `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query`, `BatchGetItem` and `BatchWriteItem` on `openloop-ledger` and its indexes, and `InvokeAgentRuntime` on the one runtime ARN and its endpoints. No `DeleteTable`, no wildcard resource, no inline policies, no groups. `DeleteItem` is there because the web reset deletes the demo user's rows.

`openloop-scheduler` is the role EventBridge Scheduler assumes for the daily catch-up (ADR-0013): `InvokeAgentRuntime` on the one runtime ARN, trusted only by `scheduler.amazonaws.com` from this account, nothing else.

`openloop-dev` holds `AdministratorAccess` (`STATUS.md` *Blocked*). Normal for a hackathon, worth retiring afterwards.

## Application surface

Checked and clean:

- **No raw HTML anywhere.** Loop titles, reasons and drafted email bodies are all model-generated and all render as escaped React text; there is no `dangerouslySetInnerHTML` in the tree. That is the obvious injection path in a product that displays model output, and it is closed.
- **Mail cannot forge the prompt envelope it arrives in.** `renderMessage` and `renderEvent` wrap each message and event in `<message>` / `<event>` tags carrying the ids the model cites as evidence. A body, subject or display name that closed one of those tags and opened another could invent a message with a source id the UI then links to. Attribute values are escaped and the envelope tokens are defused in text (#164); a real From header keeps its angle brackets, so prompt text for both demo fixtures is byte-identical to before the change. This matters when `GoogleSource` is reading a live inbox and the sender is a stranger.
- **Nor can it forge one on the way back out.** An excerpt, loop title or next action is written by a model reading that same mail, so mail that asks to be quoted exactly could land a forged envelope in the ledger, which every later prompt for that loop reads back: the delta path, the Risk Judge, the Action Agent, and `get_loop_evidence` on the Ask path. All of it is defused where the prompt is built rather than where it is stored, so the ledger still holds exactly what was observed and the web app still shows it (#170, #174). `JSON.stringify` was the hole worth naming: it escapes quotes and backslashes but not angle brackets, so a record interpolated as JSON carried a tag through intact. No demo fixture contains an envelope token, so every prompt over the demo is byte-identical and the calibration (#15) is untouched.
- **Known residual in the defusing.** `＜/message＞` (fullwidth) and `</mess\u200Bage>` (a zero-width space inside the tag name) do not match the pattern and pass through. Whether a model reads either as a tag is unproven, and the opening tag would need the same trick while attribute escaping has closed the citable-id path. Recorded rather than fixed because blanket angle-bracket escaping would rewrite every prompt on a project whose output is pinned by an agreement suite.
- **Every ledger read and write is user-scoped.** No handler takes a user id from the request.
- **`/messages/[id]`** serves only the bundled demo fixtures and 404s on an unknown id, so it cannot be walked into arbitrary content.
- **Cookies.** Ten, all `SameSite=Lax` with a one-year max-age, none `HttpOnly` because the client reads them: `openloops-theme`, `-accent`, `-density` and `-home` (appearance), `-seen` and `-toured` (what has been dismissed), `-agent` (the agent's name), and `-you`, `-inbox` and `-purpose` from onboarding (#151). None is a session and none carries a credential. The last three do hold what the visitor typed about themselves — a name, an email address, and which of four purposes the inbox serves — bounded and validated by `cleanPersonName`, `cleanEmail` and `parsePurpose` in `web/lib/profile.ts`, and falling back to the demo persona when absent. That is real personal data on an unauthenticated public URL, so read the "no real personal data" line above as covering the ledger only: these stay in that visitor's own browser, are never written to the ledger and never reach Bedrock, but they are typed by a real person rather than invented in `demo/`.
- **High-risk actions** cannot execute without `APPROVED`, enforced in `mayExecute` and covered by tests. Note the scope of that claim: it stops the *agent* acting unilaterally. It does not stop a person who can reach the UI from clicking Approve, because there is no auth — see the first section.
- **Sending mail, paying and submitting a form never execute unattended**, whatever risk tier they carry, along with the catch-all `other`. The tier is assigned by the Risk Judge, so it is model output; resting the guarantee on the tier alone meant a `pay` the model rated `low` was auto-executable (#163). The type is now checked before the tier in `isAutoExecutable`, and a test pins each of those four types at all three tiers. Approval still executes them — this is a gate, not a ban.

## If something does go wrong

Rotate the `openloop-web` key in IAM and update the Vercel environment variable; the deployment picks it up on redeploy. The ledger is reproducible from `demo/seed-ledger.json`, so a damaged table can be rebuilt rather than restored. Nothing in the system holds data that would need disclosing, because none of it is real.
