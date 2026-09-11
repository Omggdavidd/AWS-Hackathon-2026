# Architecture

Status: **accepted design** (ADRs 0003 to 0012, accepted 2026-09-10). Implemented so far: `packages/shared/`, `demo/`, `web/` on the local ledger, and `agent/` scanning fixtures into a local ledger, deployed to AgentCore Runtime. Not yet: web invoking the runtime, DynamoDB, delta updates, action execution. Update this file as the rest lands; rationale lives in the ADRs, not here.

## 1. Problem and shape

Open Loops turns email and calendar into a persistent, evidence-backed ledger of responsibilities and follows through on them (`docs/hackathon/SPEC.md` §4). Runtime pieces: a Next.js web app (UI, Google OAuth, invocation of the agent), a Strands agent graph on Amazon Bedrock AgentCore Runtime, one DynamoDB table holding the ledger, and Google Gmail and Calendar as the first sensors. Seeded fixtures replace Google for the deterministic demo.

## 2. Component map

| Unit | Responsible for | Must not |
|---|---|---|
| `web/` (Next.js) | Dashboard with the four states, loop detail with evidence and timeline, approval queue, activity feed, command bar, "catch me up"; Google OAuth callback and token storage; invoking the agent runtime server-side | Call Bedrock or Google APIs from the browser; hold business rules about state transitions |
| `agent/app/OpenLoopAgent/` (Strands) | The pipeline: Extractor, Investigator, Risk Judge, Action Agent as structured-output Agents behind the `Specialists` interface; the Orchestrator (`scan.ts`) is code that runs them per thread and writes the ledger; custom tools for inbox, calendar and ledger | Write to the ledger except through the shared adapter; execute a high-risk action that is not `APPROVED` |
| `packages/shared/` | Zod schemas for OpenLoop, Evidence, ProposedAction, AuditEvent and every agent output; the `LedgerStore` adapter interface; the local adapter; state-transition rules | Depend on Next.js, AWS SDK or Strands |
| `demo/` | Seeded Gmail-like messages and calendar events for the §14 scenario, plus expected loops | Contain real personal data |
| DynamoDB table (AWS) | Durable ledger, one table, single-table keys | Be the only place the schema is defined |

Important names: `OpenLoop`, `Evidence`, `ProposedAction`, `AuditEvent`, `LedgerStore`, `LocalLedgerStore`, `DynamoLedgerStore`, `IngestionSource` (fixture and Gmail implementations), the tools `search_gmail`, `get_gmail_thread`, `draft_email`, `send_email`, `list_calendar_events`, `create_calendar_event`, `upsert_open_loop`, `find_open_loops`, `append_evidence`, `transition_loop`, `propose_action`, `execute_approved_action`.

## 3. Data flow

1. The user connects Google (or selects demo mode) in the web app. The server stores the refresh token per user.
2. A scan is triggered (first backfill over a bounded window, later deltas). The web server invokes the AgentCore runtime with a session id, the user id, the ingestion mode and a short-lived Google access token when live.
3. Inside the runtime, the Orchestrator feeds each candidate message or event to the Extractor. Candidates that describe a responsibility go to the Investigator, which searches related and later sources for resolution or change. The Risk Judge assigns tier, priority and next action. The Orchestrator writes the loop, evidence and audit event through the ledger adapter and decides whether the user must be interrupted.
4. Low-risk actions execute immediately via the Action Agent; medium ones are prepared; high ones become `ProposedAction` records awaiting approval.
5. The web app reads the ledger directly (same adapter, DynamoDB) to render the dashboard, detail, timeline and approval queue. Approving an action invokes the runtime again with the action id; the Action Agent executes it only if the record is `APPROVED`.

## 4. Boundaries and invariants

- Models interpret evidence; the application owns state. Every state change has a reason and a timestamp; every loop keeps source ids.
- Every hop between agents is a validated Zod schema. Free text never crosses a boundary as data.
- The frontend never talks to Bedrock, Strands or Google directly. Only the Next.js server holds AWS and Google credentials.
- High-risk execution is refused in code unless the `ProposedAction` is `APPROVED`. Prompts cannot override this.
- Fixture mode and live mode implement the same `IngestionSource` interface; switching is configuration.
- No raw chain-of-thought is stored or shown. Evidence, confidence and short rationale are.
- Full email bodies are not stored when ids plus excerpts suffice. Scopes are least-privilege.

## 5. Deployment

- Agent: `pnpm --filter @openloop/agent deploy-runtime` to AgentCore Runtime in `us-east-1` (CodeZip, arm64, Node 22): stack `AgentCore-OpenLoop-default`, runtime `OpenLoop_OpenLoopAgent-CA60RSCE0z`. Invoked with IAM SigV4 from the web server.
- Web: Vercel, production from `main`, preview per PR. Environment: AWS credentials scoped to `InvokeAgentRuntime` and the DynamoDB table, Google OAuth client, table name, runtime ARN.
- Data: one DynamoDB table created by a script in `scripts/`. Local development uses the in-process adapter; `agentcore dev` runs the agent locally.
- Models: Bedrock, `global.anthropic.claude-sonnet-4-6` by default.

## 6. Cross-cutting

- Auth: single-user or a handful of test users in the hackathon; the web app's session is the user identity, passed to the runtime as `userId`.
- Observability: CloudWatch logs and metrics from AgentCore; the application's audit feed is the user-facing trace; Strands OpenTelemetry locally.
- Errors: tool failures become audit events, never silent; ambiguous extractions land in `UNCERTAIN` rather than in a wrong state.
- Cost: classify with the cheapest capable model first; bounded backfill window; deltas only after onboarding.

Diagrams: `docs/hackathon/architecture-proposal.png` (playbook proposal) and `docs/hackathon/state-lifecycle.png`. The submission diagram is produced in Phase 5 into `docs/architecture/`.
