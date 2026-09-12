# Contributing

Lightweight workflow for a fast-moving hackathon team working with AI coding agents. Agents follow this too (via `AGENTS.md`).

## Principles

- `main` is always demoable and always describes the current project. Never push to it directly.
- Branches live hours to a couple of days, not weeks.
- Small PRs merge fast; big PRs rot.
- Context Sync before merge: `docs/process/context-sync.md`.

## The loop

1. Update local `main`: `git switch main && git pull --ff-only`.
2. Create a focused branch.
3. Work with your AI agent (it follows `AGENTS.md`).
4. Test the work.
5. Context Sync.
6. Push the branch and open a PR from the template.
7. Review, address feedback.
8. Squash merge, delete the branch.
9. Everyone else pulls `main`.

## Claiming work

Work is tracked as GitHub issues with labels `area:*`, `must-ship`, `stretch`, all on the submission milestone. To take something:

1. Assign yourself on the issue and say so in the team channel. One person per issue; split it if two people want it.
2. Branch as `<type>/<issue>-<short-description>` and put `Closes #<issue>` in the PR body so the issue closes on merge.
3. If you discover new work, open an issue with the same shape (why, what, acceptance, pointers) rather than a note in chat.
4. `STATUS.md` *In progress* lists issue numbers, not names; update it in your PR when you start and when you finish.

Must-ship issues before stretch issues. The milestone is the deadline.

## Branches

- Branch from an up-to-date `main`: `git fetch origin && git switch -c <name> origin/main`.
- Name: `<type>/<short-kebab-description>`, optionally with an issue number: `feature/12-agent-tool-router`.
- Types: `feature`, `fix`, `docs`, `chore`, `infra`, `spike` (throwaway experiments, may be deleted unmerged).
- One person (plus their agent) per branch. Parallel work goes on separate branches. Claude Code users can run parallel sessions with `git worktree`.

## Commits

- Conventional Commits: `type(scope): description`, with types `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `infra`, `ci`. Breaking change: `!` after the type.
- Commit often on your branch. WIP commits are fine because PRs are squash-merged; the **PR title** becomes the commit on `main`, so make it a good conventional message.
- Never commit secrets. `.gitignore` catches common cases and CI runs a secret scan. Neither replaces reading your own diff.

## Keeping current

- Rebase on `main` at least daily and before marking a PR ready: `git fetch origin && git rebase origin/main`.
- After a rebase, push your own branch with `git push --force-with-lease`. Never force-push someone else's branch or `main`.
- Rebase, do not merge, `main` into feature branches. History stays linear and conflicts stay local.

## Pull requests

1. Open as a **draft** early if you want eyes on it. Mark **Ready for review** only after Context Sync.
2. Fill in the template. The checklist is short on purpose; every box means something.
3. Keep it reviewable: one logical change, ideally under ~400 changed lines. Split otherwise.
4. CI must be green: `context-check`, `secret-scan`, and build/test jobs as they are added.
5. One approval from a teammate who did not write it (enforced by the ruleset). The admin bypass is for a missing review only, never for a red or not-yet-reported check: `main` was broken once by an admin merge with `workspace-checks` failing. Keep PRs small so reviews take minutes.
6. After a rebase onto `main`, rerun `pnpm check` and `pnpm --filter @openloop/web build` before pushing. Two PRs touching the same file can auto-merge into something that does not compile (that is how #45 and #46 collided).
7. Squash merge. Delete the branch.

## Reviews

- Review within a couple of hours during working sessions. Unblocking teammates beats finishing your own feature.
- Review for: does it do what the PR says, is scope respected, are shared docs synchronized, is anything dangerous (secrets, destructive infra, cost).
- Do not review style. Formatters and linters own that.
- Reviewers may push small fixes to the branch instead of requesting changes, and say so in a comment.

## Conflicts and stale branches

- The branch author resolves conflicts by rebasing. Ask the other author when intent is unclear.
- A PR that shows no CI checks at all is almost always conflicting with `main`: GitHub runs no workflows when it cannot build the merge commit. Rebase, push, and the checks appear.
- A branch more than two days behind `main` is stale: rebase it before doing anything else, and re-run the checks, since `main` may have changed the ground under it.
- A branch nobody has touched for a week gets closed or its PR marked draft; reopen from a fresh rebase when work resumes.
- `STATUS.md`: keep both sides' facts, then re-read the whole file so it still describes *now*.
- ADR number collisions: the later PR renumbers its ADR to the next free number and fixes the index.
- Lockfiles: take `main`'s lockfile and re-run the install command.

## Testing before merge

- Run the commands listed in `AGENTS.md` *Commands* for every workspace you touched.
- If a check cannot run (missing credentials, no AWS access), say so in the PR instead of skipping silently.
- Manual demo checks count. Note what you tried.

## Recommended `main` protection (repo admin, one-time)

A `main` ruleset is active: pull request required, squash merge only, status checks `context-check`, `secret-scan` and `workspace-checks` required, linear history, no force pushes or deletion. One approval from a teammate who did not write the change is required. The repository admin (David) can bypass the ruleset to keep integration moving; everyone else waits for a review.
