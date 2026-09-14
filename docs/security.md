# Security posture

What the deployed system exposes, what is deliberately open, and what is still outstanding. Reviewed 2026-09-13 and corrected 2026-09-14 against `integration/s2` and the live deployment.

This file owns the security posture. Environment variables live in the `.env.example` next to the code, the runtime's DynamoDB policy in `agent/app/OpenLoopAgent/iam/`, the scheduler's role inline in `agent/app/OpenLoopAgent/scripts/create-schedule.ts`, and the invariants that the product depends on in [`architecture.md`](architecture.md) §4.

Two audiences are mixed here on purpose. Most of what follows is judged against **a single-user demo on a public URL the day before a submission**, where the loss that matters is somebody's Bedrock bill or a wrecked recording. Where a gap only bites a second user, it is labelled as such and left labelled, because `README.md` pitches this as a product, and a security page that quietly scopes its own threat model down to what it happens to handle is worse than none.

## What is deliberately open

**There is no authentication, and that is the current design.** `web/lib/ledger.ts:16` hard-codes `USER_ID = 'user-alex'`; [ADR-0011](decisions/0011-google-oauth-in-web-app.md) puts Google OAuth in the web app but it is not wired up, and `architecture.md` §6 says the session is the user identity "in the hackathon". A judge has to be able to open the URL and click things. Adding a login before submission would cost us the thing the live URL is for.

Consequences, accepted knowingly:

- Anyone with the URL sees the demo ledger. It contains no real personal data — every person, address and organisation in `demo/` is invented.
- Anyone with the URL can change that ledger: approve an action, mark a loop done, park one, or reset it.

Neither of those is a data-protection problem, because there is no real data and one user. The problem is the next one.

**For the product this pitches itself as, this is the whole game and none of it is built.** There is no login, no session, no per-request principal, no authorisation check anywhere in `web/` or `agent/`. Every mitigation below is a spend or abuse control; not one of them is a privilege boundary. Acceptable for a single-user demo, unacceptable for a product with two users.

## The real exposure: unauthenticated spend

`POST /api/scan`, `/api/handle`, `/api/catch-up` and `/api/ask` each invoke the deployed AgentCore runtime, which spends real Bedrock tokens. A full scan is about 95 to 105 seconds of Claude Sonnet 4.6 across three threads at a time, roughly fifty cents. The account is **self-funded with no credits left** ([`SUBMISSION.md`](hackathon/SUBMISSION.md)), so this is somebody's money.

Before this review, any script that could reach the URL could run those in a loop. The guard is live: a POST without a matching `Origin` returns 403 from the deployment, checked 2026-09-13 on `/api/scan`, `/api/handle` and `/api/catch-up`; `/api/ask` was checked the same way against a production build before it shipped.

**Mitigated:** every route handler that invokes the runtime rejects any request that did not come from the app's own origin (`web/lib/same-origin.ts`), as the first statement in the handler, before the runtime is touched. Browsers always send `Origin` on a POST, so the app works unchanged; `curl` and most bots send nothing and get a 403. This also closes the CSRF hole — before it, any page a teammate visited could have fired a scan from their browser. Next's Server Actions check `Origin` against `Host` only when an `Origin` header is present; a handcrafted POST with no `Origin` is let through with a logged warning (`action-handler.js` in Next 16). Action ids are in the public HTML, so every server action in `web/app/actions.ts` that writes anything — a loop's state, a proposed action, or the profile and agent-name cookies — calls the same guard as its first statement. `approveAction` is the one that spends Bedrock through `execute` and `resetDemo` the one that wipes the demo user's rows; the rest only move a loop between states or change a name, and they carry the guard because one rule is easier to keep right than a list of exceptions. `web/lib/action-origin.test.ts` calls each action with and without an `Origin`, so a guard that goes missing fails the test suite.

**Mitigated, per call:** `MAX_OUTPUT_TOKENS = 8192` on every Bedrock model (`agent/app/OpenLoopAgent/src/model.ts:13`) caps what one role can generate, so a rambling response fails fast instead of eating the runtime's 300-second budget. That bounds the cost of a *call*, not the number of calls.

`/api/ask` is the only one of those routes that takes arbitrary user text and hands it to a model holding ledger-read tools (`find_open_loops`, `get_loop_evidence`). The 500-character cap on the question — enforced twice, in the route and in the runtime's own schema — bounds what one request costs, not what it says: a prompt that talks the model into an unhelpful answer is still possible, and the defence against it is that the `ask` path holds no sink and can only read one user's own ledger, so the worst outcome is a wrong answer rather than an effect.

### The honest limit of the origin check

The file's own comment calls it "a bill boundary, not a privilege boundary", and that is exactly right. Two specific holes, neither of them mitigated in code:

1. **An attacker who sets one header walks straight through.** `Origin` is trivially settable outside a browser. The check stops CSRF and casual scripted abuse; it stops nobody who reads this page.
2. **The check trusts `x-forwarded-host`.** `isSameOrigin` puts `headers.get('x-forwarded-host')` into the allowed set (`web/lib/same-origin.ts:26`), so a request carrying **both** `Origin: https://evil.example` and `X-Forwarded-Host: evil.example` satisfies it. That is not a bug in isolation — behind a proxy the browser's host arrives in that header and nowhere else — but it means **the guard is only as strong as the proxy in front of it**. Vercel overwrites `x-forwarded-host` at its edge, so the deployment is not exploitable this way. That proxy assumption is load-bearing; it is stated in this paragraph and, since 2026-09-14, in a comment beside the line that makes it (`same-origin.ts:24`), because someone changing the hosting reads the code and not this page. If this app is ever served without a proxy that overwrites the header — `next start` on a bare host, a container behind something more permissive — the origin check becomes decorative. Anyone changing how the app is hosted has to re-check this.

Two things would actually bound the damage, in priority order:

1. **A hard cap on spend.** The $25 monthly budget with email alerts exists and was verified from the CLI ([`SUBMISSION.md`](hackathon/SUBMISSION.md)), which closes what this page used to call its highest-value action. It is an alert, not a cap: it mails somebody, it does not refuse the next invocation. Between the alert firing and a human reading it, spend is unbounded.
2. **A rate limit on those routes** — per-IP and a global daily ceiling. **There is none on this branch**: no limiter, no counter, no middleware, nothing. Verified 2026-09-14 by grep across `web/`, `agent/`, `packages/` and `scripts/` for `rate limit`, `ratelimit`, `throttle`, `upstash`, `bottleneck`, `p-limit` and daily cap, ceiling, limit and quota wording; the only matches are Google's own 429 backoff (`google-source.ts:442`) and a concurrency bound on the ledger purge (`dynamo-store.ts:38`), neither of which limits how often a paid route can be called. A daily invocation ceiling is **proposed** in PR #162 (branch `ceiling/daily-invocations`, open against `integration/s2`) and is **not merged and not on this branch**; until it is, plan as though it does not exist. Whatever ships needs shared state, so on Vercel that means a counter in DynamoDB or a managed limiter. Deliberately not attempted the day before submission: a limiter that misfires locks a judge out of the demo, which is worse than the risk it removes. **Nothing limits spend today, and this is the largest single gap on the page.**

## The runtime has no authentication of its own

The AgentCore runtime takes the user it acts as straight from the invocation payload: `userId: z.string().min(1)` (`agent/app/OpenLoopAgent/main.ts:39`), and that value is passed unchecked into the ledger store, the specialists and every tool. **Anyone who can invoke the runtime ARN can act as any user** — read their loops, write to them, execute their approved actions.

What actually stops that today is IAM and nothing else: `bedrock-agentcore:InvokeAgentRuntime` on that ARN is held by `openloop-dev`, by the `openloop-web` user whose keys live in Vercel's environment, and by the `openloop-scheduler` role. There is no second check inside the runtime. With one real user this is a distinction without a difference. With two it is a complete authorisation bypass for anyone who obtains the `openloop-web` key, which is a long-lived static credential.

The payload also names the ledger table (`ledger: { kind: 'dynamo', table }`) and the source, so a caller who can invoke the runtime picks both. The runtime's IAM policy confines the table to `openloop-ledger*`, which is the real bound.

## Prompt injection, and what the approval gate is actually made of

This is no longer theoretical, because `packages/shared/src/ingestion/google-source.ts` can read a live inbox. Untrusted prose from anyone who can email the user flows into model prompts that drive an action pipeline. Worth being precise about both the exposure and the gate. The gate was thinner than it looked a week ago; two controls landed since, and what is left is still worth naming exactly.

**How much attacker text reaches a prompt.** Less than the source allows: `GoogleSource` stores up to 20,000 characters of body (`google-source.ts:172`), but `renderMessage` cuts each body to 1,500 characters before it enters a prompt (`agent/app/OpenLoopAgent/src/render.ts:3,30`). A thread is that many times the number of messages, and the Investigator's `search_inbox` tool returns up to ten rendered messages per call, so the realistic ceiling is tens of thousands of characters of attacker-chosen text per scan, not one bounded blob.

**Delimiting exists, and the envelope can no longer be forged.** Messages are wrapped in `<message id="…" thread="…" date="…" labels="…">` … `</message>` (`render.ts:33,39`). Until this week nothing escaped the body or the attributes, so a body containing `</message>` followed by a fabricated `<message id="…">` could close its own envelope and forge a message that appears to come from someone else, with an id the model would then cite as evidence. That is closed: every interpolated value now passes through `text`, which rewrites anything matching `<`, an optional slash and `message` or `event` into `&lt;…` (`render.ts:6,15-17`), and attribute values additionally lose quotes, angle brackets and line breaks (`render.ts:20-26`). Only a run of characters that could open or close an envelope is touched, so ordinary text renders byte for byte as before and the prompts the demo was calibrated on do not move.

What is **not** fixed is provenance past the tag. Nothing marks which part of a prompt is attacker-controlled, and there is **no instruction anywhere in the prompts that content inside a `<message>` is data rather than instruction** (checked across `agent/app/OpenLoopAgent/src/agents/prompts.ts`). A body that simply asks the model to do something, forging nothing, is still asking the model directly. The structure is honest now; the model is still free to believe what it reads inside it.

**What the injected text can reach.** The Extractor and the Investigator see it directly. The Investigator and the delta-path `update` role have tools bound (`agent/app/OpenLoopAgent/src/agents/index.ts:147,160`), and those tools are **all read-only** — `search_inbox`, `get_thread`, `list_calendar_events`, `find_open_loops` (`src/tools/inbox.ts`, `src/tools/ledger.ts`). There is no write tool and no sink on that path, which is a genuine and deliberate mitigation. The Risk Judge has no tools at all, but it is the role that proposes actions, and its input is the loop and the evidence excerpts the Investigator just wrote from attacker text.

**The gate is made of model judgments.** `mayExecute` (`packages/shared/src/actions/sink.ts:46`) is the only thing between a proposed action and an effect, and both of its inputs come from the model:

- `riskTier` is a field the Risk Judge emits (`packages/shared/src/schemas/agent-outputs.ts:66`).
- `requiresApproval` is not an independent judgment at all. It is derived as `proposed.riskTier === 'high'` (`agent/app/OpenLoopAgent/src/scan.ts:364`).

So a single model field decides the tier. What that field can no longer decide on its own is whether an irreversible effect happens, because `isAutoExecutable` (`sink.ts:38-43`) reads the action type **before** it looks at the tier:

```ts
if (NEVER_AUTOMATIC.has(action.type)) return false   // every tier, no exception
if (action.riskTier === 'high') return false
if (action.riskTier === 'low') return true
return MEDIUM_OK.has(action.type)
```

`NEVER_AUTOMATIC` is `pay`, `submit_form`, `send_email`, `book_appointment`, `follow_up` and `other` (`sink.ts:18-28`) — effects that move money, commit the user to someone else or speak in their name, none of which can be taken back. A Risk Judge that labels a `pay` as `low` still produces `requiresApproval = false`, and `mayExecute` refuses it anyway, so it waits for a person. `follow_up` is on the list because a follow-up is mail to the other party rather than a note to the user; `other` because an escape hatch that names no effect should never run alone. `packages/shared/test/actions.test.ts:33` asserts the refusal at all three tiers for all six types, so a type quietly dropped from the set fails the suite, and `web/lib/decisions.ts:13` asks `mayExecute` rather than keeping a second copy of the rule, so the Decisions list shows exactly what the gate withheld.

What can still run without a person is `draft_email`, `create_calendar_event` and `remind` at `medium` or `low` (`MEDIUM_OK`, `sink.ts:31-35`), plus `archive_thread` at `low` only. Those are preparation and inbox hygiene, and each is undoable by hand. The Zod refinement on `ProposedAction` (`proposed-action.ts:46`) still only enforces that `high` implies approval, and no code path raises a tier from the action type or the presence of an amount, so the type list rather than the tier is what carries the weight here.

**A second control covers the step after approval.** Approving an action approves its *type*, but nothing in the schemas binds a `ProposedAction.type` to the `ActionPlan.effect.kind` the Action Agent plans, so an approved `draft_email` could come back as a `send_email` effect and the sink would post mail nobody approved. `isAllowedEffect` (`agent/app/OpenLoopAgent/src/actions.ts:61-63`) refuses that: past `note` and `reminder`, which any type may return because neither reaches anyone but the user, a type permits only its own effects (`actions.ts:44-58`). A weaker kind passes — a draft where a send was allowed — and a stronger or unrelated one throws inside the try, so it lands as a normal `FAILED` with an `action_failed` audit line a person can read (`actions.ts:135-140`). One calibration is worth knowing because it looks like a hole and is not: the effect union has no payment, so the model plans a `reminder` for an approved `pay`, and that is allowed. A reminder to pay the deposit reaches only the user, and it is the most the Action Agent can honestly do with a payment. Both the refusal and that pairing are pinned by tests (`test/actions.test.ts:200,241`).

**What else stops this today**, and unlike the two controls above it is circumstance rather than design:

- **No real sink exists.** The runtime wires `FixtureActionSink` (`main.ts:153`), which pushes onto an array and returns a summary string. Nothing leaves the process. Gmail and Calendar sinks are issue #21, unstarted.
- **No caller asks for live mail.** `GoogleSource` is constructed only at `main.ts:86`, reachable only by a payload with `source: { kind: 'gmail', … }`. Nothing in the repository sends one: the web app hard-codes `source: { kind: 'fixture' }` (`web/lib/agent.ts:47,79`), the local scan script loads fixtures, and the scheduled catch-up reads no mail at all. Reaching the Gmail path takes a hand-built invocation of the runtime ARN with a valid Google credential; what that now means is the section below.
- **Demo fixtures are ours.** `demo/seed-inbox.json` contains no injection attempt, so the demo will not surprise anyone.

So the realistic exposure *tomorrow* is low, and most of that is still the accident of what is not yet connected. What changed this week is that the part which *is* design got real: the envelope cannot be forged, the irreversible action types cannot run alone at any tier, and an approved action cannot come back as a stronger effect than the one approved. When #20 (live Gmail) and #21 (Google sinks) land together, a crafted email would have to talk the Risk Judge into a `draft_email`, a `create_calendar_event`, a `remind` or an `archive_thread`, which is a smaller prize than a payment and each of them undoable by hand. That is a gate worth having rather than a boolean. It is still made of model judgments about *which* draft to write and *what* to put in it, so the remaining work is provenance and an instruction that message content is data — neither of which exists yet.

Unrelated to injection but worth recording here: a scan iterates every thread the source returns with no ceiling (`scan.ts:447`). On fixtures that is twelve. On a live inbox it is bounded only by `GoogleSource`'s `maxMessages` default of 250 (`google-source.ts:169`), which is up to 250 threads at three or more model calls each, in one unauthenticated request.

## Google refresh material crosses the wire

An earlier version of this page said the runtime accepts exactly one Google credential, a short-lived bearer token, and that no refresh token, client secret or client id crosses the wire. **That is wrong.** The Gmail source takes an optional `refresh: { refreshToken, clientId, clientSecret }` beside the access token (`agent/app/OpenLoopAgent/src/google-auth.ts:15-28`), which the runtime's request schema accepts as `GmailSourceSchema` (`main.ts:53`). `main.ts:87` hands the whole source to `googleAccessToken`, and whenever `refresh` is present that returns a function rather than the caller's string (`google-auth.ts:51-75`). `GoogleSource` resolves the token per request (`google-source.ts:22,345-349`), so the callback exchanges a fresh token shortly before the held one expires, and the 401 retry that used to be dead code now fires. A 90-day backfill makes hundreds of calls against a token that lives an hour, so this is a real need, not a speculative one.

**The handling of the credential is careful, and deserves saying.** The exchange posts to a hard-coded `TOKEN_ENDPOINT` constant (`google-auth.ts:5`) with the secrets in a form body, never a URL or a query string. A failed exchange is reported through `fail`, which strikes the client secret and the refresh token out of Google's own response text **before** truncating it to 300 characters (`google-auth.ts:109-118`) — the right order, since truncating first could leave half a secret in place. A test feeds back an error body that echoes both credentials and asserts neither survives into the message (`test/google-auth.test.ts:187`). The token factory is handed no logger and calls none; the runtime's logger serialises only the `LogLine` objects it is given, never the invocation payload (`src/log.ts:24-28`), and a second test writes a failed exchange's message through the real logger and asserts the log line carries no secret (`test/google-auth.test.ts:208`). The three fields are all-or-nothing, so half a credential is rejected rather than quietly ignored (`test/google-auth.test.ts:50`). Google error messages elsewhere are built with `stripQuery(url)` (`google-source.ts:378,406`), and Zod parse failures are reported as **paths and issue codes only, never the rejected value** (`agents/index.ts:93-97`), a deliberate and correct choice given that model output carries the user's mail.

**The bet got materially bigger anyway.** Whether AgentCore logs invocation payloads to CloudWatch is **not verified** — it was not checked against a live log group, and no scan was run for this review. That open question used to hang over a one-hour bearer token, which expires on its own whatever happens to it. It now hangs over a long-lived Google refresh token and an OAuth client secret sitting in the same payload, which together mint new access tokens until a human revokes them in Google Cloud. Same unknown, much larger loss, and nothing the runtime does to its own logs bears on it: the question is what the platform does with the payload before the handler sees it. Confirming that is the highest-value unchecked item on this page and has to happen before live Gmail (#20) ships.

**Nothing in the repository sends a gmail source at all, let alone refresh material.** The web app hard-codes `source: { kind: 'fixture' }` (`web/lib/agent.ts:47,79`), the local scan script loads fixtures, and the scheduled catch-up reads no mail. Reaching this code takes a hand-built invocation of the runtime ARN carrying credentials the caller already holds. So the path is **unreachable today, which is not the same as safe**: the schema accepts it, the deployed runtime would act on it, and the only thing keeping an OAuth client secret out of an AgentCore payload is that nobody has yet written the caller that puts it there. When #20 lands, that caller is the first thing it adds.

## The scheduled catch-up

[ADR-0013](decisions/0013-scheduled-catch-up-eventbridge-scheduler.md) (status: **proposed**, not accepted) adds an EventBridge Scheduler schedule that invokes the runtime once a day at 07:00 America/New_York. It is the only thing in the system that spends money without a person clicking.

It is bounded about as tightly as a standing invocation can be, and all of this is in `agent/app/OpenLoopAgent/scripts/create-schedule.ts`:

- **The payload is fixed in the schedule definition**: `{ command: 'catch_up', userId, ledger: { kind: 'dynamo', table } }`. `catch_up` builds its digest from the ledger in code and makes one model call to write the sentences — about a cent. It reads no mail, holds no sink and executes nothing.
- **`RetryPolicy: { MaximumRetryAttempts: 0 }`**, so a failing run cannot become a retry storm on the bill.
- **The role can do one thing**: `bedrock-agentcore:InvokeAgentRuntime` on one runtime ARN and its endpoints, trusted only by `scheduler.amazonaws.com` and only with `aws:SourceAccount` equal to this account.

Who can change it: anyone holding EventBridge Scheduler and IAM permissions in the account, which today means `openloop-dev` and its `AdministratorAccess`. The `openloop-web` key in Vercel **cannot** — it has no scheduler or IAM permissions. Someone who could call `scheduler:UpdateSchedule` could rewrite the payload to `command: 'scan'` and turn a one-cent daily job into a fifty-cent one, but they would already hold account credentials, at which point the schedule is the least of it. Disable it before recording with `create-schedule -- --disable`.

## Response headers

`web/next.config.ts` sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` denying camera, microphone, geolocation and payment, on every path. Vercel already sends HSTS with a two-year max-age and preload.

**No Content-Security-Policy.** Next injects inline bootstrap script and style, so a `script-src` worth having needs per-request nonces through middleware. A CSP that breaks the app the day before a submission is worse than a missing one. It is the right follow-up once the deadline is past.

## Secrets

- No credential has ever been committed: `gitleaks` runs on every pull request and push (`.github/workflows/ci.yml`), `check_context.py` fails the build on a secret-shaped filename (`SECRET_NAME_RE`, `scripts/check_context.py:185`), and the root `.gitignore` covers `.env` and `.env.*` with an exception only for `.env.example`. The only tracked files matching are `web/.env.example` and `agent/app/OpenLoopAgent/.env.example`.
- Both `.env.example` files carry placeholders only — `<account-id>`, `<runtime-id>` — and their AWS key lines are commented out.
- **Nothing is exposed to the browser.** There is no `NEXT_PUBLIC_*` variable anywhere in the repository, and both modules that construct an AWS client import `server-only` first: `web/lib/ledger.ts:1` (DynamoDB) and `web/lib/agent.ts:1` (AgentCore).
- Credentials reach the deployed app as Vercel environment variables on the least-privilege `openloop-web` IAM user, and reach a developer machine from `~/.aws`. Neither path goes through the repository.

**The AWS account ID `970547374543` is in the public repository**, in `agent/agentcore/aws-targets.json` and `agent/agentcore/.cli/deployed-state.json`, along with the runtime ARN and an IAM role ARN. It has been there since #8 and the AgentCore CLI's own `.gitignore` opts the state file in deliberately.

An account ID is not a credential and AWS does not treat it as a secret, but it is information a stranger does not need: it makes resources enumerable by name and role ARNs guessable. It is not worth rewriting published history for, and the `main` ruleset forbids that anyway. Worth a deliberate "we accept this" rather than nobody having noticed.

Two smaller disclosures, both real and both judged acceptable:

- **The ledger table name reaches the browser.** `resetLedger` interpolates `LEDGER_TABLE` into the sentence it returns (`web/lib/ledger.ts:82`), which the Settings reset button displays (`web/components/reset-demo.tsx:48`). So anyone who clicks reset learns the table is `openloop-ledger`. With the published account ID that makes the table ARN guessable, which matters only to someone who already holds credentials in the account — the name was never the control, and it is already in `web/.env.example` and `AGENTS.md`.
- **Route errors are returned verbatim.** All four API routes return `err instanceof Error ? err.message : …` to the client, and the agent panel renders it (`web/components/agent-panel.tsx:132,254`). An AWS SDK `AccessDenied` carries the principal ARN and the resource ARN, so a misconfiguration would show a stranger an IAM user name. Nothing secret, but more than a user needs.

## IAM

The runtime's DynamoDB policy (`agent/app/OpenLoopAgent/iam/dynamodb-ledger.json`) is properly narrow: `GetItem`, `PutItem`, `UpdateItem`, `Query` and `BatchWriteItem` on `openloop-ledger*` only. No `DeleteItem`, no `Scan`, no other table, no other service. A compromised runtime cannot drop the table.

The `openloop-web` user for Vercel is scoped to DynamoDB item and query actions on the table plus `bedrock-agentcore:InvokeAgentRuntime` on the runtime ARN (#19). Verified from the CLI on 2026-09-13: one attached policy, `OpenLoopWebLeastPrivilege`, allowing `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query`, `BatchGetItem` and `BatchWriteItem` on `openloop-ledger` and its indexes, and `InvokeAgentRuntime` on the one runtime ARN and its endpoints. No `DeleteTable`, no wildcard resource, no inline policies, no groups. `DeleteItem` is there because the web reset deletes the demo user's rows.

`openloop-scheduler` is the role EventBridge Scheduler assumes for the daily catch-up ([ADR-0013](decisions/0013-scheduled-catch-up-eventbridge-scheduler.md)): `InvokeAgentRuntime` on the one runtime ARN, trusted only by `scheduler.amazonaws.com` from this account, nothing else.

`openloop-dev` holds `AdministratorAccess` (`STATUS.md` *Blocked*). Normal for a hackathon, worth retiring afterwards.

Every one of these is a long-lived static key or role. **There is no rotation story and no instant revocation** beyond deleting the key in IAM by hand; see the last section.

## Application surface

Checked and clean:

- **No raw HTML anywhere.** Loop titles, reasons and drafted email bodies are all model-generated and all render as escaped React text; there is no `dangerouslySetInnerHTML` in the tree (verified by grep across `web/`). That is the obvious injection path in a product that displays model output, and it is closed. It matters more than usual here, because with live Gmail the text on a loop page originates with whoever sent the mail.
- **Every ledger read and write is user-scoped, and no handler takes a user id from the request.** All four routes and every server action use the `USER_ID` constant. The trust problem is that the constant is the only user, not that it can be forged.
- **`/messages/[id]`** serves only the bundled demo fixtures (`web/lib/inbox.ts` imports the two `demo/*.json` files statically) and 404s on an unknown id, so it cannot be walked into arbitrary content or used to read the filesystem.
- **High-risk actions** cannot execute without `APPROVED`, enforced in `mayExecute` and covered by tests. Note the scope of that claim twice over: it stops the *agent* acting unilaterally on something it called high risk. It does not stop a person who can reach the UI from clicking Approve, because there is no auth; and for the four types that may still run alone — `draft_email`, `create_calendar_event`, `remind` and `archive_thread` — a tier the model got wrong still means an effect with no person in it. The types that cannot be undone are refused at every tier; see the injection section.
- **Cookie values are validated on read, never trusted.** The app sets ten cookies — `openloops-theme`, `openloops-seen`, `openloops-toured`, `openloops-agent`, `openloops-you`, `openloops-inbox`, `openloops-purpose`, `openloops-accent`, `openloops-density` and `openloops-home` — all `SameSite=Lax`, none of them a session, none granting anything. A tampered value falls back to a default rather than reaching logic: `cleanEmail` requires an address shape, `parsePurpose` and `parseDensity` accept only known ids (`web/lib/profile.ts`, `web/lib/appearance.ts`), and `parseAccent` requires a six-digit hex before the value is written into a CSS custom property (`web/lib/appearance.ts:19-26`), which is what keeps a cookie out of the stylesheet. Two of them, `openloops-you` and `openloops-inbox`, hold a name and an email address the user typed into Settings; they are readable by client script (set via `document.cookie`, so not `HttpOnly`), which is fine for a preference and would not be for anything else.
- **The local JSON ledger is validated on load and written atomically.** `LocalLedgerStore.fromFile` parses the file through a Zod `Snapshot` schema, so a hand-edited or truncated file cannot become a parsed type, and writes go to a temp file and `rename` so a reader never sees half a write (`packages/shared/src/ledger/local-store.ts`). This is a local-development path only: a Vercel production deployment with no `OPENLOOP_LEDGER_TABLE` now throws at startup rather than silently serving seeded demo data (`web/lib/ledger.ts:96-101`), which is the one place in the system that fails closed on missing config.

## Measured against a normal backend

Worth stating plainly where this sits against the posture a production service would be held to, because most of the distance is deliberate and some of it is not.

| Expectation | Here |
|---|---|
| Every state-mutating route requires a verified principal | **Not met, by design.** No principal exists. Origin checks stand in, and they are not a privilege boundary. |
| Untrusted input is a typed schema before it reaches logic | **Met, and well.** Zod at every boundary: the runtime's request, every model output, Gmail wire shapes, the ledger file, cookie values. The strongest part of the system. |
| Abuse-prone and paid endpoints are rate-limited per route | **Not met.** Nothing, anywhere. The biggest real gap. |
| Config fails at boot on a missing secret rather than defaulting | **Partly met.** The production ledger table now hard-fails (`ledger.ts:96`). `AWS_REGION` still defaults to `us-east-1`, and an unset runtime ARN degrades to a 503 rather than failing at boot. |
| A stolen credential can be revoked instantly | **Not met.** Long-lived static IAM keys in Vercel; revocation means a human in the IAM console and a redeploy. |
| Fail-closed is chosen deliberately and written down; fail-open is written down too | **This page is that.** The fail-open choices — no auth, no rate limit, no CSP, a trusted proxy header — are each named above with the reason. |

For one user, one day and a judge with a URL, the first, third and fifth rows are the right trades and the second row is genuinely good work. None of them survives a second user.

## If something does go wrong

Rotate the `openloop-web` key in IAM and update the Vercel environment variable; the deployment picks it up on redeploy. Disable the daily schedule with `pnpm --filter @openloop/agent create-schedule -- --disable` if the concern is spend. The ledger is reproducible from `demo/seed-ledger.json`, so a damaged table can be rebuilt rather than restored (`pnpm reset-demo`). Nothing in the system holds data that would need disclosing, because none of it is real.

The one thing that would *not* be quick: there is no kill switch for the paid routes short of unsetting `OPENLOOP_RUNTIME_ARN` in Vercel and redeploying, which makes every agent button return 503. That is the break-glass move if the bill starts climbing.
