@AGENTS.md
@STATUS.md

# Claude Code notes

Everything imported above is the shared, tool-agnostic briefing. This file holds only what is specific to Claude Code. Keep it under 40 lines; shared instructions belong in `AGENTS.md`.

- Use plan mode for work that touches more than one workspace, an ADR-covered area, or the shared docs structure. Save the plan to `docs/plans/` only when it spans several PRs or people.
- Never change *Current phase* in `STATUS.md` unless the user asks.
- `/context-sync` runs the Context Sync Protocol. Use it before marking a PR ready or declaring significant work complete.
- `/adr <title>` scaffolds a decision record with the next free number and updates the index.
- A PreToolUse hook runs `scripts/check_context.py` whenever a Bash command creates, readies or merges a PR with `gh`. If it blocks, fix the reported problem; do not route around it.
- `.claude/settings.json` denies reading `.env` and `.env.local` files. Use the `.env.example` next to the code instead.
- Scoped instructions go in `.claude/rules/<name>.md` with `paths:` frontmatter, not in this file. Add a nested `CLAUDE.md` only when a workspace has conventions the root cannot express.
- Parallel sessions: one branch per `git worktree` to avoid edit collisions.
- `STATUS.md` is imported at launch; if the session runs long, re-read it before updating it.
