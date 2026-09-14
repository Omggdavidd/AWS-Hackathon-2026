# Security posture

What the deployed system exposes, what is deliberately open, and what is still outstanding. Reviewed 2026-09-13 against `main` and the live deployment.

This file owns the security posture. Environment variables live in the `.env.example` next to the code, IAM policy in `agent/app/OpenLoopAgent/iam/`, and the invariants that the product depends on in [`architecture.md`](architecture.md) §4.

## What is deliberately open

**There is no authentication, and that is the current design.** `web/lib/ledger.ts` hard-codes `USER_ID = 'user-alex'`; ADR-0011 puts Google OAuth in the web app but it is not wired up, and `architecture.md` §6 says the session is the user identity "in the hackathon". A judge has to be able to open the URL and click things. Adding a login before submission would cost us the thing the live URL is for.

Consequences, accepted knowingly:

- Anyone with the URL sees the demo ledger. It contains no real personal data — every person, address and organisation in `demo/` is invented.
- Anyone with the URL can change that ledger: approve an action, mark a loop done, park one.

Neither of those is a data-protection problem, because there is no real data and one user. The problem is the next one.

## The real exposure: unauthenticated spend

`POST /api/scan`, `/api/handle`, `/api/catch-up` and `/api/ask` each invoke the deployed AgentCore runtime, which spends real Bedrock tokens. A full scan is about 95 to 105 seconds of Claude Sonnet 4.6 across three threads at a time. The account is **self-funded with no credits left** ([`SUBMISSION.md`](hackathon/SUBMISSION.md)), so this is somebody's money.

Before this review, any script that could reach the URL could run those in a loop. The guard is live: a POST without a matching `Origin` returns 403 from the deployment, checked 2026-09-13 on `/api/scan`, `/api/handle` and `/api/catch-up`; `/api/ask` was checked the same way against a production build before it shipped.

**Mitigated:** every route handler that invokes the runtime now rejects any request that did not come from the app's own origin (`web/lib/same-origin.ts`). Browsers always send `Origin` on a POST, so the app works unchanged; `curl` and most bots send nothing and get a 403. This also closes the CSRF hole — before it, any page a teammate visited could have fired a scan from their browser. Next's Server Actions check `Origin` against `Host` only when an `Origin` header is present; a handcrafted POST with no `Origin` is let through with a logged warning (`action-handler.js` in Next 16). So the two server actions that reach the runtime or the table apply the same guard themselves: `approveAction` in `web/app/actions.ts` (spends Bedrock through `execute`) and `resetDemo` (wipes the demo user's rows) refuse a request with no matching `Origin`, since action ids are in the public HTML. The other server actions only move a loop between states on the ledger and keep Next's default check.

`/api/ask` is the only one of those routes that takes arbitrary user text and hands it to a model holding ledger-read tools (`find_open_loops`, `get_loop_evidence`). The 500-character cap on the question bounds what one request costs, not what it says: a prompt that talks the model into an unhelpful answer is still possible, and the defence against it is that the `ask` path holds no sink and can only read one user's own ledger, so the worst outcome is a wrong answer rather than an effect.

**Not mitigated, and this is the honest limit:** an attacker who sets one header walks straight through. An origin check is a bill boundary against casual abuse, not a defence against anyone trying. Two things would actually bound the damage, in priority order:

1. **A hard cap on spend.** The $25 monthly budget with email alerts exists and was verified from the CLI ([`SUBMISSION.md`](hackathon/SUBMISSION.md)), which closes what this page used to call its highest-value action. It is an alert, not a cap: it mails somebody, it does not refuse the next invocation.
2. **A rate limit on those routes** — per-IP and a global daily ceiling. Needs shared state, so on Vercel it means a counter in DynamoDB or a managed limiter. Deliberately not attempted the day before submission: a limiter that misfires locks a judge out of the demo, which is worse than the risk it removes.

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

`openloop-dev` holds `AdministratorAccess` (`STATUS.md` *Blocked*). Normal for a hackathon, worth retiring afterwards.

## Application surface

Checked and clean:

- **No raw HTML anywhere.** Loop titles, reasons and drafted email bodies are all model-generated and all render as escaped React text; there is no `dangerouslySetInnerHTML` in the tree. That is the obvious injection path in a product that displays model output, and it is closed.
- **Every ledger read and write is user-scoped.** No handler takes a user id from the request.
- **`/messages/[id]`** serves only the bundled demo fixtures and 404s on an unknown id, so it cannot be walked into arbitrary content.
- **Cookies** (`openloops-theme`, `openloops-seen`) hold a theme name and a timestamp, are `SameSite=Lax`, and carry nothing sensitive. Neither is a session.
- **High-risk actions** cannot execute without `APPROVED`, enforced in `mayExecute` and covered by tests. Note the scope of that claim: it stops the *agent* acting unilaterally. It does not stop a person who can reach the UI from clicking Approve, because there is no auth — see the first section.

## If something does go wrong

Rotate the `openloop-web` key in IAM and update the Vercel environment variable; the deployment picks it up on redeploy. The ledger is reproducible from `demo/seed-ledger.json`, so a damaged table can be rebuilt rather than restored. Nothing in the system holds data that would need disclosing, because none of it is real.
