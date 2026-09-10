# Context Sync Protocol

Goal: **code, current status, architecture, documentation and agent context agree before anything merges to `main`.** `main` is both the current code and the current shared project memory.

This is mostly a semantic check. CI verifies the deterministic parts with `scripts/check_context.py`; a human or agent must do the rest.

## When

- Before a PR is marked *Ready for review*.
- Before an agent declares significant work complete.
- Whenever you notice a shared document disagreeing with the code, even outside your change.

Claude Code: `/context-sync`. Other agents and humans: follow the steps below.

## Steps

1. **Inspect the complete branch diff.** `git fetch origin && git diff origin/main...HEAD`. Summarize what actually changed, one line per area.
2. **Read the shared context that could be affected.** Always `STATUS.md`. Then only the documents the impact matrix below implicates.
3. **Classify the change** with the impact matrix.
4. **Update only the affected documents.** Edit surgically and respect each document's responsibility (ownership table in `AGENTS.md`).
5. **`STATUS.md`**: if the phase, what works, what is in progress, what is blocked, what is next, known issues, temporary limitations, demo readiness or workstreams changed, update it and bump *Last updated*. Move items completed more than about a week ago out of *Recently completed*.
6. **ADRs**: if the change introduces, reverses or materially changes an architectural decision (framework, service, data store, auth, orchestration, deployment, observability, security assumption), add an ADR (`docs/decisions/README.md` explains how) or mark the superseded one.
7. **`AGENTS.md`**: only if commands, conventions, constraints, layout or the definition of done changed.
8. **`CLAUDE.md` / `.claude/`**: only if Claude-specific always-on instructions, skills, hooks or permissions changed.
9. **README / setup / env / API docs**: if a developer would now install, run, configure, call or test something differently.
10. **Plans**: if a plan in `docs/plans/` covers this work, update its status or mark it done.
11. **Verify docs against code.** For every instruction you kept or wrote, confirm the command, path, variable or behaviour exists in the tree.
12. **Remove stale text** you found along the way if the fix is small. Otherwise record it under *Known issues* in `STATUS.md`.
13. **Run checks**: the relevant test/lint/typecheck/build commands from `AGENTS.md`, then `python3 scripts/check_context.py`.
14. **Verify no secrets**: scan the diff for credentials, tokens, real endpoints with keys, `.env` contents.
15. **Review the final `git diff` again**, now including doc changes.
16. **Report the result** in the format below and put it in the PR description.

## Impact matrix

| The change affects… | Update |
|---|---|
| Phase, what works, in progress, blocked, next, known issues, limitations, demo readiness, workstreams | `STATUS.md` |
| Component structure, boundaries, data flow, invariants | `docs/architecture.md` |
| Choice of framework, service, data store, auth, orchestration, deployment, observability, security assumption | new or updated ADR in `docs/decisions/` |
| Install, run or configure steps | `README.md` (or `docs/setup.md` if it exists) |
| Build / test / lint / typecheck commands, testing procedure | `AGENTS.md` *Commands*, and the workspace README |
| Environment variables | the relevant `.env.example`, and the setup text that points at it |
| Dependencies | lockfile in the same PR; an ADR only for a new framework or service |
| API contracts, shared schemas | the schema source of truth in the shared package, plus `docs/architecture.md` if a boundary moved |
| Agent behaviour, conventions, constraints, definition of done | `AGENTS.md` |
| Claude-only instructions, skills, hooks, permissions | `CLAUDE.md`, `.claude/` |
| Deployment | `docs/architecture.md` deployment section, plus an ADR if the strategy changed |
| A multi-PR plan's scope or status | the plan in `docs/plans/` |
| Team workflow, PR process | `CONTRIBUTING.md`, `.github/pull_request_template.md` |
| Hackathon requirements, submission, demo behaviour | `docs/hackathon/` (`DEMO.md` for the demo path) |

If nothing in the matrix applies, no document changes. Say so in the report.

## Result

Finish with exactly one of these, filled in truthfully:

```
Context Sync: PASS
Docs updated: STATUS.md (moved X from in progress to works), docs/decisions/0003-....md (new).
Checks: <command> passed, <command> passed, check_context.py passed.
Secrets: none in diff.
```

```
Context Sync: PASS
Docs updated: none. <one-line reason no shared docs are affected>.
Checks: <what ran>.
Secrets: none in diff.
```

```
Context Sync: INCOMPLETE
Blocking: <what disagrees, what failed, or what could not be verified, and why>.
Checks: <what ran, what failed, verbatim>.
```

## Anti-patterns

- Editing every document "to be safe". Touch only what the change affects.
- Bumping *Last updated* without changing content.
- Adding "(outdated)" or "TODO update" notes instead of fixing or deleting the text.
- Writing an ADR for a trivial choice such as a utility library or a lint rule.
- Reporting PASS without running the checks.
