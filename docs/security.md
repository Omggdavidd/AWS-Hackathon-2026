# Security posture

What the deployed system exposes, what is deliberately open, and what is still outstanding. Reviewed 2026-09-13 against `integration/s2` and the live deployment.

This file owns the security posture. Environment variables live in the `.env.example` next to the code, the runtime's DynamoDB policy in `agent/app/OpenLoopAgent/iam/`, the scheduler's role inline in `agent/app/OpenLoopAgent/scripts/create-schedule.ts`, and the invariants that the product depends on in [`architecture.md`](architecture.md) §4.

Two audiences are mixed here on purpose. Most of what follows is judged against **a single-user demo on a public URL the day before a submission**, where the loss that matters is somebody's Bedrock bill or a wrecked recording. Where a gap only bites a second user, it is labelled as such and left labelled, because `README.md` pitches this as a product, and a security page that quietly scopes its own threat model down to what it happens to handle is worse than none.

## What is deliberately open

**There is no authentication, and that is the current design.** `web/lib/ledger.ts:9` hard-codes `USER_ID = 'user-alex'`; [ADR-0011](decisions/0011-google-oauth-in-web-app.md) puts Google OAuth in the web app but it is not wired up, and `architecture.md` §6 says the session is the user identity "in the hackathon". A judge has to be able to open the URL and click things. Adding a login before submission would cost us the thing the live URL is for.

Consequences, accepted knowingly:

- Anyone with the URL sees the demo ledger. It contains no real personal data — every person, address and organisation in `demo/` is invented.
- Anyone with the URL can change that ledger: approve an action, mark a loop done, park one, or reset it.

Neither of those is a data-protection problem, because there is no real data and one user. The problem is the next one.

**For the product this pitches itself as, this is the whole game and none of it is built.** There is no login, no session, no per-request principal, no authorisation check anywhere in `web/` or `agent/`. Every mitigation below is a spend or abuse control; not one of them is a privilege boundary. Acceptable for a single-user demo, unacceptable for a product with two users.

## The real exposure: unauthenticated spend

`POST /api/scan`, `/api/handle`, `/api/catch-up` and `/api/ask` each invoke the deployed AgentCore runtime, which spends real Bedrock tokens. A full scan is about 95 to 105 seconds of Claude Sonnet 4.6 across three threads at a time, roughly fifty cents. The account is **self-funded with no credits left** ([`SUBMISSION.md`](hackathon/SUBMISSION.md)), so this is somebody's money.

Before this review, any script that could reach the URL could run those in a loop. The guard is live: a POST without a matching `Origin` returns 403 from the deployment, checked 2026-09-13 on `/api/scan`, `/api/handle` and `/api/catch-up`; `/api/ask` was checked the same way against a production build before it shipped.

**Mitigated:** every route handler that invokes the runtime rejects any request that did not come from the app's own origin (`web/lib/same-origin.ts`), as the first statement in the handler, before the runtime is touched. Browsers always send `Origin` on a POST, so the app works unchanged; `curl` and most bots send nothing and get a 403. This also closes the CSRF hole — before it, any page a teammate visited could have fired a scan from their browser. Next's Server Actions check `Origin` against `Host` only when an `Origin` header is present; a handcrafted POST with no `Origin` is let through with a logged warning (`action-handler.js` in Next 16). So the two server actions that reach the runtime or the table apply the same guard themselves: `approveAction` in `web/app/actions.ts` (spends Bedrock through `execute`) and `resetDemo` (wipes the demo user's rows) refuse a request with no matching `Origin`, since action ids are in the public HTML. The other server actions only move a loop between states on the ledger and keep Next's default check.

**Mitigated, per call:** `MAX_OUTPUT_TOKENS = 8192` on every Bedrock model (`agent/app/OpenLoopAgent/src/model.ts:13`) caps what one role can generate, so a rambling response fails fast instead of eating the runtime's 300-second budget. That bounds the cost of a *call*, not the number of calls.

`/api/ask` is the only one of those routes that takes arbitrary user text and hands it to a model holding ledger-read tools (`find_open_loops`, `get_loop_evidence`). The 500-character cap on the question — enforced twice, in the route and in the runtime's own schema — bounds what one request costs, not what it says: a prompt that talks the model into an unhelpful answer is still possible, and the defence against it is that the `ask` path holds no sink and can only read one user's own ledger, so the worst outcome is a wrong answer rather than an effect.

### The honest limit of the origin check

The file's own comment calls it "a bill boundary, not a privilege boundary", and that is exactly right. Two specific holes, neither of them mitigated in code:

1. **An attacker who sets one header walks straight through.** `Origin` is trivially settable outside a browser. The check stops CSRF and casual scripted abuse; it stops nobody who reads this page.
2. **The check trusts `x-forwarded-host`.** `isSameOrigin` puts `headers.get('x-forwarded-host')` into the allowed set (`web/lib/same-origin.ts:24`), so a request carrying **both** `Origin: https://evil.example` and `X-Forwarded-Host: evil.example` satisfies it. That is not a bug in isolation — behind a proxy the browser's host arrives in that header and nowhere else — but it means **the guard is only as strong as the proxy in front of it**. Vercel overwrites `x-forwarded-host` at its edge, so the deployment is not exploitable this way. That proxy assumption is load-bearing and was not written down anywhere before this paragraph. If this app is ever served without a proxy that overwrites the header — `next start` on a bare host, a container behind something more permissive — the origin check becomes decorative. Anyone changing how the app is hosted has to re-check this.

Two things would actually bound the damage, in priority order:

1. **A hard cap on spend.** The $25 monthly budget with email alerts exists and was verified from the CLI ([`SUBMISSION.md`](hackathon/SUBMISSION.md)), which closes what this page used to call its highest-value action. It is an alert, not a cap: it mails somebody, it does not refuse the next invocation. Between the alert firing and a human reading it, spend is unbounded.
2. **A rate limit on those routes** — per-IP and a global daily ceiling. **There is none**: no limiter, no counter, no middleware, nothing (verified by grep across `web/`, `agent/`, `packages/` and `scripts/`). Needs shared state, so on Vercel it means a counter in DynamoDB or a managed limiter. Deliberately not attempted the day before submission: a limiter that misfires locks a judge out of the demo, which is worse than the risk it removes. This is the largest single gap on the page.

## The runtime has no authentication of its own

The AgentCore runtime takes the user it acts as straight from the invocation payload: `userId: z.string().min(1)` (`agent/app/OpenLoopAgent/main.ts:37`), and that value is passed unchecked into the ledger store, the specialists and every tool. **Anyone who can invoke the runtime ARN can act as any user** — read their loops, write to them, execute their approved actions.

What actually stops that today is IAM and nothing else: `bedrock-agentcore:InvokeAgentRuntime` on that ARN is held by `openloop-dev`, by the `openloop-web` user whose keys live in Vercel's environment, and by the `openloop-scheduler` role. There is no second check inside the runtime. With one real user this is a distinction without a difference. With two it is a complete authorisation bypass for anyone who obtains the `openloop-web` key, which is a long-lived static credential.

The payload also names the ledger table (`ledger: { kind: 'dynamo', table }`) and the source, so a caller who can invoke the runtime picks both. The runtime's IAM policy confines the table to `openloop-ledger*`, which is the real bound.

## Prompt injection, and what the approval gate is actually made of

This is no longer theoretical, because `packages/shared/src/ingestion/google-source.ts` can read a live inbox. Untrusted prose from anyone who can email the user flows into model prompts that drive an action pipeline. Worth being precise about both the exposure and the gate, because the gate is thinner than it looks.

**How much attacker text reaches a prompt.** Less than the source allows: `GoogleSource` stores up to 20,000 characters of body (`google-source.ts:172`), but `renderMessage` cuts each body to 1,500 characters before it enters a prompt (`agent/app/OpenLoopAgent/src/render.ts:3,7`). A thread is that many times the number of messages, and the Investigator's `search_inbox` tool returns up to ten rendered messages per call, so the realistic ceiling is tens of thousands of characters of attacker-chosen text per scan, not one bounded blob.

**Delimiting exists, but it is forgeable.** Messages are wrapped in `<message id="…" thread="…" date="…">` … `</message>` (`render.ts:9-15`). That is real structure, and better than pasting bodies raw — but **nothing escapes the body or the attributes**. A message whose body contains `</message>` followed by a fabricated `<message id="…">` block can close its own envelope and forge a message that appears to come from someone else, with an id the model will then cite as evidence. There is no provenance marking beyond the tag, and no instruction anywhere in the prompts that content inside a `<message>` is data rather than instruction.

**What the injected text can reach.** The Extractor and the Investigator see it directly. The Investigator and the delta-path `update` role have tools bound (`agent/app/OpenLoopAgent/src/agents/index.ts:147,160`), and those tools are **all read-only** — `search_inbox`, `get_thread`, `list_calendar_events`, `find_open_loops` (`src/tools/inbox.ts`, `src/tools/ledger.ts`). There is no write tool and no sink on that path, which is a genuine and deliberate mitigation. The Risk Judge has no tools at all, but it is the role that proposes actions, and its input is the loop and the evidence excerpts the Investigator just wrote from attacker text.

**The gate is made of model judgments.** `mayExecute` (`packages/shared/src/actions/sink.ts:26`) is the only thing between a proposed action and an effect, and both of its inputs come from the model:

- `riskTier` is a field the Risk Judge emits (`packages/shared/src/schemas/agent-outputs.ts:66`).
- `requiresApproval` is not an independent judgment at all. It is derived as `proposed.riskTier === 'high'` (`agent/app/OpenLoopAgent/src/scan.ts:345`).

So a single model field decides everything. And `isAutoExecutable` (`sink.ts:13-23`) is asymmetric in a way worth reading twice:

```ts
if (action.riskTier === 'high') return false
if (action.riskTier === 'low') return true          // every type, no filter
return ['draft_email', 'create_calendar_event', 'remind', 'follow_up', 'book_appointment'].includes(action.type)
```

The type allow-list — the thing that keeps `pay` and `send_email` away from automatic execution — **applies only at the `medium` tier**. At `low` it is skipped. An action of type `pay` or `submit_form` that the Risk Judge labels `low` gets `requiresApproval = false`, passes `mayExecute`, and executes without a person. The Zod refinement on `ProposedAction` (`proposed-action.ts:46`) only enforces that `high` implies approval; it says nothing about `low`. No code path raises a tier based on the action type or on the presence of an amount.

**What actually stops this today**, and it is circumstance rather than design:

- **No real sink exists.** The runtime wires `FixtureActionSink` (`main.ts:127`), which pushes onto an array and returns a summary string. Nothing leaves the process. Gmail and Calendar sinks are issue #21, unstarted.
- **No caller asks for live mail.** `GoogleSource` is constructed only at `main.ts:77`, reachable only by a payload with `source: { kind: 'gmail', accessToken }`. Nothing in the repository sends one: the web app hard-codes `source: { kind: 'fixture' }` (`web/lib/agent.ts:36,69`), the local scan script loads fixtures, and the scheduled catch-up reads no mail at all. Reaching the Gmail path takes a hand-built invocation of the runtime ARN with a valid Google token.
- **Demo fixtures are ours.** `demo/seed-inbox.json` contains no injection attempt, so the demo will not surprise anyone.

So the realistic exposure *tomorrow* is low, and it is low by accident of what is not yet connected rather than by anything in the gate. The moment #20 (live Gmail) and #21 (Google sinks) land together, a crafted email is one model misjudgement away from a real effect, and the only thing in the way is a boolean the same model chose. **Making `isAutoExecutable` apply the type allow-list at every tier is a three-line change and should happen before either issue merges**, not after.

Unrelated to injection but worth recording here: a scan iterates every thread the source returns with no ceiling (`scan.ts:420`). On fixtures that is twelve. On a live inbox it is bounded only by `GoogleSource`'s `maxMessages` default of 250 (`google-source.ts:169`), which is up to 250 threads at three or more model calls each, in one unauthenticated request.

## What did *not* land, and should not

An earlier framing of this review expected the runtime to accept Google **refresh** material — a refresh token, client id and client secret — in the invocation payload, so an expired access token could be refreshed mid-scan. **It did not, and the code is better for it.** The runtime's Gmail source accepts exactly one credential, a short-lived bearer token: `accessToken: z.string().min(1)` (`main.ts:53`). No refresh token, no client secret and no client id crosses the wire or is stored anywhere in the runtime.

The refresh problem was solved in-process instead: `AccessToken` is `string | (() => string | Promise<string>)` (`google-source.ts:22`), and on a 401 the source asks the callback once for a fresh token (`google-source.ts:360-368`). The secret stays with whoever owns the callback.

Two consequences, one good and one to know about:

- Nothing in this path can leak refresh material to a log, because there is none to leak. The logger (`agent/app/OpenLoopAgent/src/log.ts`) serialises only the `LogLine` objects it is handed, never the invocation payload. Google error messages are built with `stripQuery(url)` (`google-source.ts:378,406`), so a query string never reaches a log line; the token was only ever in the `Authorization` header, never in a URL. Zod parse failures are reported as **paths and issue codes only, never the rejected value** (`agents/index.ts:93-97`), which is a deliberate and correct choice given that model output carries the user's mail.
- **The refresh path is unreachable from the deployed runtime.** `main.ts:78` passes `payload.source.accessToken`, a plain string, so `typeof this.options.accessToken === 'function'` is false and the 401 retry never fires. A token expiring mid-scan still fails the scan. That is a resilience gap rather than a security one, but the capability exists only for an in-process caller.

The access token itself is still sent in an invocation payload. Whether AgentCore logs request payloads to CloudWatch is **not verified** — it was not checked against a live log group, and no scan was run for this review. Before live Gmail ships somebody should confirm it, because a one-hour bearer token in a log group is still a credential in a log group.

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

- **The ledger table name reaches the browser.** `resetLedger` interpolates `LEDGER_TABLE` into the sentence it returns (`web/lib/ledger.ts:41`), which the Settings reset button displays (`web/components/reset-demo.tsx:48`). So anyone who clicks reset learns the table is `openloop-ledger`. With the published account ID that makes the table ARN guessable, which matters only to someone who already holds credentials in the account — the name was never the control, and it is already in `web/.env.example` and `AGENTS.md`.
- **Route errors are returned verbatim.** All four API routes return `err instanceof Error ? err.message : …` to the client, and the agent panel renders it (`web/components/agent-panel.tsx:131,251`). An AWS SDK `AccessDenied` carries the principal ARN and the resource ARN, so a misconfiguration would show a stranger an IAM user name. Nothing secret, but more than a user needs.

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
- **High-risk actions** cannot execute without `APPROVED`, enforced in `mayExecute` and covered by tests. Note the scope of that claim twice over: it stops the *agent* acting unilaterally on something it called high risk. It does not stop a person who can reach the UI from clicking Approve, because there is no auth; and it does not stop an action the model called `low` — see the injection section.
- **Cookie values are validated on read, never trusted.** The app sets ten cookies — `openloops-theme`, `openloops-seen`, `openloops-toured`, `openloops-agent`, `openloops-you`, `openloops-inbox`, `openloops-purpose`, `openloops-accent`, `openloops-density` and `openloops-home` — all `SameSite=Lax`, none of them a session, none granting anything. A tampered value falls back to a default rather than reaching logic: `cleanEmail` requires an address shape, `parsePurpose` and `parseDensity` accept only known ids (`web/lib/profile.ts`, `web/lib/appearance.ts`), and `parseAccent` requires a six-digit hex before the value is written into a CSS custom property (`web/lib/appearance.ts:19-26`), which is what keeps a cookie out of the stylesheet. Two of them, `openloops-you` and `openloops-inbox`, hold a name and an email address the user typed into Settings; they are readable by client script (set via `document.cookie`, so not `HttpOnly`), which is fine for a preference and would not be for anything else.
- **The local JSON ledger is validated on load and written atomically.** `LocalLedgerStore.fromFile` parses the file through a Zod `Snapshot` schema, so a hand-edited or truncated file cannot become a parsed type, and writes go to a temp file and `rename` so a reader never sees half a write (`packages/shared/src/ledger/local-store.ts`). This is a local-development path only: a Vercel production deployment with no `OPENLOOP_LEDGER_TABLE` now throws at startup rather than silently serving seeded demo data (`web/lib/ledger.ts:55-60`), which is the one place in the system that fails closed on missing config.

## Measured against a normal backend

Worth stating plainly where this sits against the posture a production service would be held to, because most of the distance is deliberate and some of it is not.

| Expectation | Here |
|---|---|
| Every state-mutating route requires a verified principal | **Not met, by design.** No principal exists. Origin checks stand in, and they are not a privilege boundary. |
| Untrusted input is a typed schema before it reaches logic | **Met, and well.** Zod at every boundary: the runtime's request, every model output, Gmail wire shapes, the ledger file, cookie values. The strongest part of the system. |
| Abuse-prone and paid endpoints are rate-limited per route | **Not met.** Nothing, anywhere. The biggest real gap. |
| Config fails at boot on a missing secret rather than defaulting | **Partly met.** The production ledger table now hard-fails (`ledger.ts:55`). `AWS_REGION` still defaults to `us-east-1`, and an unset runtime ARN degrades to a 503 rather than failing at boot. |
| A stolen credential can be revoked instantly | **Not met.** Long-lived static IAM keys in Vercel; revocation means a human in the IAM console and a redeploy. |
| Fail-closed is chosen deliberately and written down; fail-open is written down too | **This page is that.** The fail-open choices — no auth, no rate limit, no CSP, a trusted proxy header — are each named above with the reason. |

For one user, one day and a judge with a URL, the first, third and fifth rows are the right trades and the second row is genuinely good work. None of them survives a second user.

## If something does go wrong

Rotate the `openloop-web` key in IAM and update the Vercel environment variable; the deployment picks it up on redeploy. Disable the daily schedule with `pnpm --filter @openloop/agent create-schedule -- --disable` if the concern is spend. The ledger is reproducible from `demo/seed-ledger.json`, so a damaged table can be rebuilt rather than restored (`pnpm reset-demo`). Nothing in the system holds data that would need disclosing, because none of it is real.

The one thing that would *not* be quick: there is no kill switch for the paid routes short of unsetting `OPENLOOP_RUNTIME_ARN` in Vercel and redeploying, which makes every agent button return 503. That is the break-glass move if the bill starts climbing.
