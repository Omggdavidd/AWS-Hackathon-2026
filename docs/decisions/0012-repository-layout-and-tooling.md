---
status: accepted
date: 2026-09-10
decision-makers: team
---

# pnpm workspace with web, agent, shared schemas and demo fixtures; Biome and Vitest

## Context and Problem Statement

The system has three code units in one language (ADR-0007): the Next.js app, the AgentCore-scaffolded Strands agent, and Zod schemas plus the storage adapter shared by both. The AgentCore CLI generates its own project root (`agentcore/` config and `app/<Agent>/` code). Several developers and agents work in parallel for four days.

## Considered Options

* One pnpm workspace containing all units, the AgentCore project nested under `agent/`
* Separate repositories per unit
* One workspace with Turborepo on top

## Decision Outcome

Chosen option: "One pnpm workspace, AgentCore project under `agent/`", because pnpm 12 workspaces with the `workspace:*` protocol are enough for three packages and Turborepo adds configuration without solving a problem we have. Layout:

```
web/                 Next.js 16 app (UI, OAuth callbacks, runtime invocation)
agent/               AgentCore CLI project root: agentcore/ (config, CDK), app/OpenLoopAgent/ (Strands graph, tools)
packages/shared/     Zod schemas, types, storage adapter interface and local adapter
demo/                Seeded fixtures for the deterministic demo (ADR-0006)
docs/ scripts/       Unchanged from Phase 0
```

Tooling: Node 22 (`.nvmrc`), pnpm 12 (`packageManager` field), Biome for lint and format (one config, `create-next-app --biome`), Vitest 4 with the `projects` config at the root, Zod 4 (`z.toJSONSchema` available for tool schemas). Repo-wide commands are pnpm scripts at the root; `AGENTS.md` *Commands* lists them once they exist.

Deviation from the playbook (§15): `web/` instead of nested `apps/`, and the CLI-generated `app/OpenLoopAgent/` lives under `agent/` rather than at the root so that the generator's config does not collide with the workspace root.

### Consequences

* Good, because schemas are imported, not copied, and one `pnpm install` sets up everything.
* Good, because the agent can still be developed and deployed with the CLI from `agent/` exactly as documented.
* Bad, because `agentcore deploy` bundles with esbuild, so a `workspace:*` dependency on `packages/shared` must bundle cleanly; verified on the first deploy in Phase 2, with a fallback of publishing shared code into the agent by a build step.
* Bad, because the generator's own `AGENTS.md` and `README.md` inside `agent/` must be trimmed to avoid contradicting the root files.

## More Information

* pnpm workspaces: <https://pnpm.io/workspaces>
* Vitest projects: <https://vitest.dev/guide/projects>
* Biome getting started: <https://biomejs.dev/guides/getting-started/>
