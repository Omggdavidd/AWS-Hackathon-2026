# AWS Hackathon 2026

Team project for the AWS Hackathon 2026. What we are building is defined by the specification in `docs/hackathon/` (pending). Current phase and state live in `STATUS.md`.

## Getting started

Requires Node 22 and pnpm 12 (`npm install -g pnpm@12.3.4` if corepack complains).

```
git clone https://github.com/Omggdavidd/AWS-Hackathon-2026.git
cd AWS-Hackathon-2026
pnpm install
pnpm check                          # lint, typecheck, tests, context check
pnpm --filter @openloop/web dev     # http://localhost:3000 on the seeded local ledger, no AWS needed
```

That is enough for frontend work: the dashboard runs on `demo/seed-ledger.json`, the ledger the agent is expected to produce.

To run the agent, the DynamoDB contract suite or a deploy you need AWS credentials: David creates an access key for your `openloop-<login>` IAM user and shares it privately; run `aws configure` (region `us-east-1`, output `json`). Claude Code and the scripts pick the credentials up from `~/.aws`; never paste keys into `.env` files or chat. Frontend work on the local ledger needs none of this:

```
pnpm --filter @openloop/agent scan -- --reset          # real model over the demo inbox, ~4 min
pnpm --filter @openloop/agent scan -- --delta          # next-morning batch: updates, not duplicates
pnpm --filter @openloop/agent scan -- --handle         # execute every allowed action
cp web/.env.example web/.env.local                     # point the web app at DynamoDB and the deployed runtime
pnpm --filter @openloop/agent deploy-runtime           # deploy the agent (only if you changed agent/)
```

## Working here

| You want to… | Read |
|---|---|
| Know the current phase, what works, what is in flight, what is blocked | `STATUS.md` |
| Contribute code (branches, commits, PRs, reviews) | `CONTRIBUTING.md` |
| Point an AI coding agent at this repo | `AGENTS.md` (Claude Code loads it via `CLAUDE.md`) |
| Understand the system and why it is that way | `docs/architecture.md`, `docs/decisions/` |
| See how phases work | `docs/process/phases.md` |
| Plan a multi-PR piece of work | `docs/plans/` |
| See the hackathon rules and requirements | `docs/hackathon/` |
| Merge something | `docs/process/context-sync.md` |
