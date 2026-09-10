# AWS Hackathon 2026

Team project for the AWS Hackathon 2026. What we are building is defined by the specification in `docs/hackathon/` (pending). Current phase and state live in `STATUS.md`.

## Getting started

Requires Node 22 and pnpm 12 (`npm install -g pnpm@12.3.4` if corepack complains).

```
git clone https://github.com/Omggdavidd/AWS-Hackathon-2026.git
cd AWS-Hackathon-2026
pnpm install
pnpm check          # lint, typecheck, tests, context check
```

The shared schema package and the seeded demo data exist today. The web app and the agent arrive next; their READMEs will carry the run commands.

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
