# Architecture Decision Records

One file per decision that is hard to reverse or whose *why* other people need: frameworks, services, data stores, auth, agent orchestration, deployment, observability, security posture. Not for trivia.

Format: MADR 4.0 minimal, see `adr-template.md`. Keep each under a page. Write it as a conversation with a teammate who joins next week.

## How to add one

1. Copy `adr-template.md` to `NNNN-short-title-with-dashes.md` using the next free number.
2. Fill in context, options considered, decision and consequences. Keep `status: proposed` until the team agrees, then `accepted`.
3. Add a row to the index below and open the PR. Claude Code: `/adr <title>` does steps 1 and 3.
4. Reversing a decision: write a new ADR and set the old one to `superseded by ADR-NNNN`. Do not rewrite an accepted ADR.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions as ADRs | accepted |
| [0002](0002-repository-as-shared-project-memory.md) | The repository is the shared project memory for humans and agents | accepted |
| [0003](0003-specialist-agent-graph.md) | Orchestrate the agent as a graph of narrow specialist agents with typed outputs | proposed |
| [0004](0004-explicit-open-loop-state.md) | The application owns an explicit open-loop ledger; models only interpret evidence | proposed |
| [0005](0005-risk-tiers-and-approval.md) | Actions are gated by risk tier; high-risk actions require explicit human approval | proposed |
| [0006](0006-seeded-demo-data-first.md) | The demo runs on deterministic seeded data; live Gmail is an optional second path | proposed |
| [0007](0007-typescript-strands-bedrock.md) | Build in TypeScript with the Strands TypeScript SDK on Amazon Bedrock | proposed |
| [0008](0008-agentcore-runtime-hosting.md) | Host the Strands agent on Amazon Bedrock AgentCore Runtime via the AgentCore CLI | proposed |
| [0009](0009-dynamodb-single-table-with-local-adapter.md) | Persist the ledger in one DynamoDB table behind the storage adapter, with a local adapter | proposed |
| [0010](0010-nextjs-frontend-on-vercel.md) | Build the product UI with Next.js 16 and host it on Vercel | proposed |
| [0011](0011-google-oauth-in-web-app.md) | The web app owns Google OAuth in Testing status; the agent receives tokens per invocation and polls | proposed |
| [0012](0012-repository-layout-and-tooling.md) | pnpm workspace with web, agent, shared schemas and demo fixtures; Biome and Vitest | proposed |
