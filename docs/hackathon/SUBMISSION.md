# Submission checklist

Living checklist for the Agents for Humans hackathon submission. Detail and rationale are in `SPEC.md` section 18; the live Devpost rules control if anything here differs. Tick items in the PR that completes them.

## Key dates

| Item | When |
|---|---|
| Internal submission target | Mon Sep 14, 2026, 7:00 PM ET (one-hour buffer) |
| Official submission deadline | Mon Sep 14, 2026, 5:00 PM PT / 8:00 PM ET |
| Judging | Sep 15 9:00 AM PT to Oct 8 5:00 PM PT (project must stay available and free to judge) |
| Winners announced | On or around Oct 14, 2026, 2:00 PM PT |

## Before building

- [ ] Every team member registered on Devpost; one authorized submission representative named
- [ ] Every team member confirmed eligible (age of majority, not in an excluded territory, not a Quebec resident)
- [x] AWS credits: none left (organizers confirmed 2026-09-11). The AWS account is self-funded; a $60 monthly cost budget exists with email alerts at 85% and 100% of actual spend and 100% forecast (set at $25 and verified from the CLI 2026-09-13; raised 2026-09-14 once September spend passed $29, about sixty cents per full scan).
- [ ] AWS Builder ID created for the representative

## Required assets

- [x] Public GitHub repository
- [x] MIT or Apache license file visible on the repo page
- [x] README with setup instructions sufficient to run the project from a clean machine
- [x] All source code, assets and demo data needed to run (verified 2026-09-14: the 60-second path in `README.md` needs only the repo; `demo/` carries the inbox, the delta batch and the expected ledger, all asserted by tests)
- [x] Architecture diagram (`docs/architecture/openloop-architecture.png`, source SVG beside it)
- [x] Text description of features and functionality (paste-ready copy in `DEVPOST.md`, 751 words: tagline, inspiration, what it does, who it is for, how we built it, challenges, what is next, links)
- [ ] Demo video, 5 minutes maximum, showing the working project, hosted public on YouTube or Vimeo, visibility verified
- [ ] Pitch in the video covers the problem, who it is for and why it matters
- [x] Testing access or instructions; credentials if any site is private (the deployed app is public and needs none; `README.md` carries both the no-AWS local run and the full setup)
- [x] Project uses Strands Agents meaningfully and runs on AWS (verified 2026-09-14: `@strands-agents/sdk` across five files — seven specialist roles as structured-output Agents and five custom tools; deployed to AgentCore Runtime `AgentCore-OpenLoop-default` in `us-east-1` on Bedrock)
- [x] No secrets or credentials anywhere in the repo history (audited 2026-09-14 across the entire history — no commit count stated, because it moves hourly: no AWS or Google keys, session or refresh tokens, private keys, and no `.env`, `.pem`, `.p12`, `.key` or credentials file was ever added, only `.env.example`. Re-run it with the two commands in the PR that ticked this. `gitleaks` also runs on every push and pull request, but it guards new commits rather than certifying old ones, which is why this was done by hand)
- [x] Disclosure of any pre-existing code incorporated (`README.md` *Originality*)

## Optional boosters

- [x] Live demo link: https://openloop-neon.vercel.app
- [ ] AgentCore Runtime deployment shown
- [ ] builder.aws post(s) with "Agents for Humans" in the title (up to 0.6 bonus points, 0.2 each)

## Submission day

- [ ] Fill the video link in the table at the top of `README.md` (the live demo link is in)
- [ ] Clean-machine install and test from README
- [ ] Final video recorded early and uploaded
- [ ] Devpost form complete
- [ ] Submitted by 7:00 PM ET; nothing substantive changes after the deadline
