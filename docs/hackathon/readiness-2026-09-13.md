# Readiness brief, 2026-09-13

A dated snapshot for reading, written one day before the deadline: what we are building, what is actually in the repository, who built it, and the ordered work left before the entry is submitted.

This file is a snapshot and does not own any fact. Current phase, issue ownership and known issues live in [`STATUS.md`](../../STATUS.md); required assets and dates live in [`SUBMISSION.md`](SUBMISSION.md); the day-by-day plan lives in [`docs/plans/2026-09-10-mvp.md`](../plans/2026-09-10-mvp.md). Where this file and those disagree, they are right and this one is stale.

## Executive summary

**Open Loops** reads a person's email and calendar and keeps a persistent, evidence-backed ledger of every unresolved responsibility it finds. It quietly handles the low-risk ones and interrupts the user only for decisions that are genuinely theirs. It is our team entry in the AWS *Agents for Humans* hackathon, Everyday Agents track, due Mon Sep 14, 2026, 8:00 PM ET.

The audience is people whose obligations arrive as email and quietly expire there, students above all: a registration deposit due Friday, a proof-of-insurance form nobody chased, a write-up a professor is still waiting on. Inbox assistants summarize what arrived. Open Loops tracks what is still open, and closes it.

Three product decisions carry the entry, and they are what a judge should remember after the video ends:

- **It checks whether the thing is already done.** An Investigator searches later mail and calendar entries for a receipt, a reply, a confirmation, so a paid invoice never nags you. This is what makes the ledger trustworthy instead of a second inbox.
- **The safety gate is code, not a prompt.** Effects reach the world only through an `ActionSink`, and only after `mayExecute` allows it. Sending mail or paying waits for a human; that is enforced in application code and covered by a test.
- **Every claim links to its source.** Each loop shows quoted evidence and links to the exact message or calendar event it came from, so any statement the agent makes can be checked against what it read.

Stack, per ADRs 0003 to 0012: Strands Agents TypeScript SDK on Amazon Bedrock (Claude Sonnet 4.6), deployed to Bedrock AgentCore Runtime, ledger in DynamoDB behind a local-or-AWS adapter, UI in Next.js 16.

## Current state of the repository

The core demo path is built and deployed. A real scan of the 12-thread demo inbox produces 11 loops with the expected states in four to five and a half minutes, writing evidence, proposed actions (high-risk ones gated) and audit events through the shared ledger into DynamoDB. The runtime `AgentCore-OpenLoop-default` is live in `us-east-1` and has been invoked end to end from the AWS CLI and from the web app's Scan button. A second scan of the next morning's mail updates existing loops instead of duplicating them, and *Catch me up* reports what changed since the last check.

What a judge cannot do yet is open a URL: the web app has no public deployment, there is no demo video, and the Devpost form is untouched. That is the whole remaining gap, and most of it is not code.

`pnpm check` was run on this snapshot (Node 22.23.2, pnpm 12.3.4) and is green: Biome clean across 117 files, typecheck passing in all four workspaces, 89 unit tests passing in 16 files, context check OK across 42 markdown files with no warnings. One suite is skipped by design, the DynamoDB contract suite, which runs only with `OPENLOOP_DYNAMO_TEST_TABLE` set. No test calls a model.

| Component | State today |
|---|---|
| `agent/` | Strands pipeline (Extractor, Investigator with inbox and ledger tools, Risk Judge, Action Agent), all structured output parsed with Zod. `handle`, `execute`, delta and `catch_up` paths work. High risk never executes without approval, enforced in code and tested. One structured JSON log line per pipeline step, with CloudWatch captures kept for judges. |
| `web/` | Overview with three views on the same loops: List by time (home), Calendar and Board, under a headline, live clock and docked agent panel. Loop detail in reading order: facts, next action, consequence, quoted evidence, executed effects, folded history. Approve and decline, "I already did this", Remind me tomorrow, Ignore, activity feed, quiet change banner, a message page behind every source id, white and navy themes. |
| `packages/shared/` | Zod schemas for every record and agent output, state transitions, `LedgerStore` with `LocalLedgerStore` and a contract suite every implementation runs, `IngestionSource` with `FixtureSource`. No framework dependencies. |
| `packages/ledger-dynamo/` | Single-table DynamoDB store passing the shared contract suite against a real table. `openloop-ledger` and `openloop-ledger-test` exist in `us-east-1`. |
| `demo/` | 15 messages, 3 events, 12 threads, with the expected outcome per thread documented and asserted by tests. The seeded ledger of 11 loops renders with no AWS account. |
| `docs/`, `.github/` | ADRs 0003 to 0012 accepted, architecture and MVP plan recorded, judge-facing README with an architecture diagram, CI running the context check, a secret scan and workspace checks including a production build of the web app. |

## Who built what

Counted from merged pull requests on `main` as of 2026-09-13. Work in progress on a branch or on someone's machine does not appear here; issue numbers are given, not PR numbers.

**Omggdavidd (David Amaefula), 36 merged PRs, repository admin.** Built the spine of the project and most of the surface: repository methodology and the ADRs; the shared package, schemas and ledger interface; the entire Strands pipeline and its AgentCore deployment; DynamoDB and the Scan button; the delta path; action execution and the approval flow; *Catch me up*; structured pipeline logging and the CloudWatch evidence; and the full design line of the dashboard from the first shell to the current List, Board and Calendar overview (#1, #2, #4, #8 to #13, #17, #18, #30, #51 to #88).

**ab00bae, 6 merged PRs.** Owns much of what a judge reads first, plus two pieces of product behaviour: the judge-facing README and submission architecture diagram (#33), the count corrections in both (#63, #69), *Remind me tomorrow* and *Ignore* so a responsibility can be parked without pretending it is done (#36), the quiet change banner on the overview (#39), and the fix for the race where an action in flight could reopen a loop the user had just resolved (#66).

**tdare514, 5 merged PRs.** Evidence and correctness work: the message page behind every evidence link, which is what lets a judge check a claim against the original mail (#35); the professor-form and passport-renewal demo threads (#40); marking a loop done now cancels its pending actions (#37); a production web build in CI so a route that fails to compile cannot reach `main` (#38); and the STATUS corrections to scan timings. Also carried the observability evidence work with Omggdavidd (#30).

**Ojulari123, 4 open issues.** Assigned the remaining agent-side work, including two of the four must-ship items: the demo reset script (#29) and the failure paths (#14), plus scan speed (#16) and Investigator calibration (#15). Nothing merged to `main` yet. This is the largest single block of must-ship work still outstanding, so get a status directly rather than infer one from the repository.

**AyomideAw, 1 open issue.** Owns the demo script (#22), which the video depends on and which nothing else can start without. Two earlier issues on this track (#37, #38) were delivered by tdare514. As above, confirm progress directly.

## What has to happen next

Ordered by what the demo needs first. The first four are the must-ship issues named in `STATUS.md` *Next up*; the rest are submission work that has no issue.

1. **Demo reset script, clean table, fresh base scan** (#29, Ojulari123, must-ship). Everything downstream depends on putting the ledger into a known state on demand. A full scan takes four to five and a half minutes, so the demo must open on a warm ledger and reset between takes.
2. **Failure paths: duplicates, resolved loops, vague deadlines, unsafe actions** (#14, Ojulari123, must-ship). This is where judges poke. The claim that the agent is trustworthy rests on it behaving correctly when the input is messy, not only on the happy path we rehearse.
3. **Deploy the web app to Vercel with a least-privilege IAM user** (#19, Omggdavidd, must-ship). Without a public URL a judge can only read our README. The Vercel project does not exist yet and no one is named as its creator; that call is still open in the MVP plan and should be made today.
4. **Demo script, rehearsed and timed** (#22, AyomideAw, must-ship). The video cannot be recorded without it and the five-minute limit is unforgiving. Follow the timing table in `SPEC.md` §14 and stay off the subject of how the models work.
5. **Record and upload the demo video.** Five minutes maximum, public on YouTube or Vimeo with visibility verified, and the pitch has to cover the problem, who it is for and why it matters, not just a UI tour. No owner is named on any issue. Record early enough that a second take is possible.
6. **Devpost prerequisites for every team member.** Registration, eligibility confirmation, one named submission representative, and an AWS Builder ID for them. None are ticked in `SUBMISSION.md`, all are individual actions, and any one missing invalidates the entry.
7. **Submission package: text description, testing instructions, README links.** Still unticked: the feature description, the testing-access instructions, and the live demo and video links in the table at the top of `README.md`.
8. **Clean-machine test and secrets audit, then submit.** Clone fresh, follow the README exactly, confirm both the 60-second local run and the deployed URL work, confirm no secret ever entered history. Submit by the 7:00 PM ET internal target and change nothing substantive after it.
9. **Quality, only with time left over.** Investigator calibration so the rescheduled club meeting lands in Watching every run (#15), a faster scan (#16), and the README screenshots that still show nine loops instead of eleven (#64, unowned and judge-visible). Stretch items (#20, #21, #31) stay closed until everything above is done.

## Risks and open calls

| Risk | Severity | Note |
|---|---|---|
| No public URL, and no owner for the Vercel project | High | The live demo is an optional booster on the checklist, but a judge who cannot click anything is judging a README. #19 is assigned; the account that hosts it does not exist. Decide who creates it today. |
| Two must-ship agent issues with nothing merged | High | #29 and #14 sit with one person. If they are not close, reassign or cut scope while a day remains. The reset script is worth more to the recording than the failure-path work, so it goes first. |
| A live scan is too slow to demo | Medium | Four to five and a half minutes for 12 threads, measured across four runs. The video must open on a pre-scanned ledger and show the backfill only in compressed form. Do not plan a take around a cold scan. |
| One known calibration flake, visible on camera | Medium | The Investigator marks the rescheduled club meeting *Needs you* instead of *Watching* in roughly one run out of two. Harmless on the page, distracting in a recording that narrates the states. |
| `STATUS.md` still reports Phase 2 while the work is at Phase 4 to 5 | Low | The phase line has said Foundation since Sep 10, though the MVP plan puts us at polish, deployment and submission. Only the team advances a phase, but the line should be corrected before a judge reads it as our own account of where we are. |
| Node version trips the clean-machine test | Low | The repository needs Node 22; an older Node in the shell fails at corepack before any project code runs, with a message that looks like a broken repository. The README's pnpm note covers part of this. Confirm during the clean-machine pass. |

## Sources

`STATUS.md`, `SUBMISSION.md`, `docs/plans/2026-09-10-mvp.md`, the open and closed GitHub issues, the merged PR history on `main`, and a full `pnpm check` run on 2026-09-13.
