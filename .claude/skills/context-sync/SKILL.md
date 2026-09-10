---
name: context-sync
description: Run the Context Sync Protocol before a PR is marked ready or before declaring significant work complete. Checks that code, status, architecture, docs and agent context agree, updates only the affected docs, runs the checks, and reports Context Sync PASS or INCOMPLETE.
---

Execute `docs/process/context-sync.md` step by step. Read that file first; it is the canonical protocol and contains the impact matrix and the report format. Do not skip steps and do not update documents the diff does not affect.

1. `git fetch origin`, then `git diff origin/main...HEAD --stat` and the full diff. Summarize what actually changed, one line per area.
2. Read `STATUS.md`. Read other shared docs only where the impact matrix says they may be affected.
3. Apply the impact matrix. Update affected docs surgically. Bump *Last updated* in `STATUS.md` only if its content changed. Never change *Current phase* unless the user asked for it.
4. If a decision was introduced, reversed or materially changed, create or update an ADR (`/adr <title>`). If a plan in `docs/plans/` covers this work, update it.
5. Verify every instruction you kept or wrote against the actual tree: paths, commands, env vars.
6. Run the relevant commands from `AGENTS.md` *Commands*, then `python3 scripts/check_context.py`.
7. Scan the diff for secrets, tokens and real credentials.
8. Review `git diff` again, including doc edits.
9. Report `Context Sync: PASS` or `Context Sync: INCOMPLETE` in the exact format from the protocol. If a PR exists, append the report to its description with `gh pr edit --body-file`; do not overwrite what the author wrote.

Never report PASS if a check failed or could not run. Say what failed, verbatim.
