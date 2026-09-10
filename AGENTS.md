# AGENTS.md

Canonical briefing for AI coding agents (Claude Code, Cursor, Codex, Copilot, Gemini CLI and similar) and for the humans pairing with them. Claude Code loads this file through `CLAUDE.md`. Explicit instructions from the user override this file.

## Project

Team entry for the AWS **Agents for Humans** hackathon, Everyday Agents track, submission due Mon Sep 14, 2026, 8:00 PM ET. Product: **Open Loops**, a follow-through agent that keeps a persistent, evidence-backed ledger of unresolved responsibilities found in email and calendar, handles low-risk work automatically and interrupts the user only for real decisions. The full specification and team playbook is `docs/hackathon/SPEC.md` (about 1,000 lines): read the sections your task touches, not the whole file.

Stack, hosting, persistence, integrations and repository layout are **decided in ADRs 0003 to 0012** (`docs/decisions/README.md`): TypeScript, Strands TypeScript SDK on Bedrock, AgentCore Runtime, DynamoDB behind a local-or-AWS adapter, Next.js 16 on Vercel, Google OAuth owned by the web app, pnpm workspace with `web/`, `agent/`, `packages/shared/`, `demo/`. System map: `docs/architecture.md`. Plan: `docs/plans/2026-09-10-mvp.md`. Anything outside those decisions needs a new ADR.

## Phase discipline

Work moves through phases defined in `docs/process/phases.md`. `STATUS.md` states the current phase. Work inside it; if a task needs a later phase, say so and stop at the boundary. Never advance the phase yourself.

## Repository layout

| Path | Purpose |
|---|---|
| `docs/` | Architecture, decisions (ADRs), hackathon material, plans, process. |
| `scripts/` | Repo tooling. `check_context.py` is the deterministic context check used by CI and hooks. |
| `.claude/` | Claude Code project config: settings, skills. Committed and shared. |
| `.github/` | PR template, CI workflows. |

Application workspaces (frontend, backend, agents, shared packages, infrastructure) are added in Phase 2 after a Phase 1 ADR settles the layout. Each workspace then gets its own README; a nested `AGENTS.md` only when it develops conventions of its own (the closest `AGENTS.md` to a file wins).

## Shared project memory: one owner per fact

| Information | Canonical location |
|---|---|
| What the project is, quick start | `README.md` |
| Hackathon spec, rules, judging, submission, demo script | `docs/hackathon/` |
| Current phase, works / in progress / blocked / next / bugs / limitations / workstreams | `STATUS.md` |
| Phase definitions and exit conditions | `docs/process/phases.md` |
| System structure, component map, invariants, where contracts live | `docs/architecture.md` |
| Why a decision was made and what was rejected | `docs/decisions/` (ADRs) |
| Multi-PR implementation plans | `docs/plans/` |
| Build / test / lint / run commands | this file, *Commands* |
| Agent working rules, constraints, definition of done | this file |
| Claude Code specifics | `CLAUDE.md`, `.claude/` |
| Git branch / commit / PR / review workflow | `CONTRIBUTING.md` |
| Context Sync Protocol (full text) | `docs/process/context-sync.md` |
| Environment variables | `.env.example` next to the code that reads them |
| Setup beyond the README quick start | `docs/setup.md`, created only when the README section outgrows ~30 lines |

Rules: a fact lives in exactly one place and other files link to it. Fix duplication when you see it. Delete stale text instead of annotating it as outdated. There is no changelog: git history and merged PRs are the record. Anything another developer or their agent needs to know must end up in one of these files, an ADR, a plan or a PR, never only in a chat.

## Commands

No toolchain yet. When code lands, this section lists the exact commands per workspace (install, dev, test, lint, typecheck, build), and agents run the relevant ones before declaring work done. Do not guess a command that is not listed here or in a workspace README; check the workspace manifest first.

Repo-wide, available now:

```
python3 scripts/check_context.py   # deterministic context check (also run by CI)
```

## Session start protocol

Load only what the task needs, in this order:

1. This file (auto-loaded by most tools).
2. `STATUS.md`: current phase, what works, what is in flight, what is blocked. Some tools auto-load it; read it if it is not already in your context.
3. The task: issue, PR or the user's request. Restate it in one sentence. Ask if it is materially ambiguous.
4. Confirm the branch: `git status -sb`. Never work on `main`; branch as `CONTRIBUTING.md` describes.
5. `docs/architecture.md` if the change touches more than one component or a public interface.
6. ADRs relevant to your area: scan titles in `docs/decisions/README.md`, open only those that apply. Same for `docs/plans/`.
7. The code you will change and its tests. `git log --oneline -15 -- <path>` if history matters.
8. Plan before editing anything non-trivial. State assumptions explicitly. Save the plan to `docs/plans/` only if it spans several PRs or several people.

Do not read the whole `docs/` tree or every ADR by default.

## Working rules

- Small, focused changes. One concern per branch and PR.
- Match the conventions of the workspace you are in. Once formatters and linters exist they are the authority; do not argue style in review.
- A new dependency of consequence, framework, database, AWS service or auth approach needs an ADR (or an existing ADR that covers it). Propose it; do not sneak it in.
- Prefer the simplest thing that demos reliably. A working vertical slice beats a half-built platform.
- Stay in scope. Do not refactor, rename or reformat files unrelated to the task.
- Write tests where they are cheap and where breakage would be silent. Do not fake coverage.

## Uncertainty, architecture changes, incomplete work

- **Unclear spec or task**: ask when the answers would lead to materially different work. Otherwise choose the boring option, state the assumption in the PR, and add it to `STATUS.md` *Temporary limitations* if it affects others.
- **Architecture change**: do not silently restructure. Propose an ADR (`status: proposed`) and, if it spans several PRs, a plan in `docs/plans/`. Implement after the team agrees.
- **Incomplete work**: never present partial work as done. List what is missing in the PR description and in `STATUS.md` (*In progress* or *Known issues*). A future session must be able to continue without this chat.

## Hard constraints

- Never commit secrets, credentials, tokens or real `.env` files. Use `.env.example` with placeholder values. The repository is public.
- Never push directly to `main`, force-push a shared branch or rewrite `main` history.
- Never delete or blank shared context files (`STATUS.md`, `AGENTS.md`, ADRs, `docs/architecture.md`). Edit them surgically.
- Never claim a test passed, a build succeeded or a check ran when it did not. Report failures verbatim.
- Never run destructive AWS or database operations (delete stacks, drop tables, purge buckets) without explicit human confirmation in the same session.
- Never set an ADR to `accepted` or advance the project phase on the team's behalf.

## Definition of done

1. The requested behaviour exists, and nothing else changed.
2. Relevant commands from *Commands* pass locally. Errors on the new path are handled, not ignored.
3. The final `git diff` has been reviewed by the author for scope, secrets and leftovers (debug output, unowned TODOs, dead code).
4. Architecture is still coherent: no new boundary crossed without an ADR.
5. Context Sync has been performed (below) and shared docs agree with the code.
6. Unresolved problems, skipped checks and assumptions are stated in the PR description.
7. The PR is reviewable in under 15 minutes, or it is split, and it is marked ready.

## Session end protocol and Context Sync

Before declaring significant work complete or marking a PR ready:

1. Run the relevant checks (tests, lint, typecheck, build). Verify the behaviour actually works, not only that code exists. Fix or report failures.
2. Read the final diff.
3. Run the **Context Sync Protocol** in `docs/process/context-sync.md`. In short: decide which shared docs the change affects (status, architecture, ADRs, plans, setup, commands, env vars, contracts, agent rules, workflow, hackathon requirements, demo), update only those, remove stale text you find, confirm no secrets, run `python3 scripts/check_context.py`, and finish with `Context Sync: PASS` or `Context Sync: INCOMPLETE` plus the reason.
4. Do not touch docs the change does not affect. Meaningful sync, not churn.
5. Leave the repository understandable for the next person or agent: `STATUS.md` reflects reality; the PR description says what was done, what was skipped and what is next.

## Git

Full workflow in `CONTRIBUTING.md`. Summary: update `main`; branch `type/short-description`; work; test; Context Sync; push; PR using the template; CI green plus one review; squash merge; everyone pulls `main`.
