---
status: accepted
date: 2026-09-10
decision-makers: David Amaefula
---

# The repository is the shared project memory for humans and agents

## Context and Problem Statement

Every developer on the team uses a different AI coding agent (Claude Code, Cursor, Codex and others). Each agent needs the same project context, and that context must not live in any single person's conversation history. `main` must represent both the current code and the current shared understanding of the project.

## Considered Options

* Tool-agnostic `AGENTS.md` as the canonical instruction file, with `CLAUDE.md` importing it and holding only Claude-specific notes
* `CLAUDE.md` as canonical, duplicated or symlinked for other tools
* Separate instruction files per tool, maintained independently

## Decision Outcome

Chosen option: "`AGENTS.md` canonical, `CLAUDE.md` imports it", because `AGENTS.md` is the open convention stewarded by the Agentic AI Foundation and read natively by Codex, Cursor, Copilot's coding agent and (with one setting) Gemini CLI, while Claude Code's documented pattern for this case is a `CLAUDE.md` that contains `@AGENTS.md` plus Claude-only content. Per-tool files would drift immediately.

Alongside it, the repository carries: `STATUS.md` (snapshot of now), `docs/architecture.md` (system map), ADRs (why), `CONTRIBUTING.md` (workflow), and the Context Sync Protocol (`docs/process/context-sync.md`) that requires code, docs and agent context to agree before merge. Each fact has one owner document; the ownership table lives in `AGENTS.md`.

### Consequences

* Good, because any developer can clone, open their agent and get identical context.
* Good, because decisions and status survive session ends and team changes.
* Bad, because the team must keep the docs current; mitigated by the Context Sync step in every PR, the PR checklist, and the deterministic checks in `scripts/check_context.py`.
* Bad, because `AGENTS.md` must stay small (Codex reads at most 32 KiB by default; Claude Code recommends under 200 lines). Growth goes into linked documents, scoped rules or nested `AGENTS.md` files, not the root file.

## More Information

* AGENTS.md convention: <https://agents.md>
* Claude Code memory and imports: <https://code.claude.com/docs/en/memory>
* Codex instruction discovery: <https://learn.chatgpt.com/docs/agent-configuration/agents-md>
