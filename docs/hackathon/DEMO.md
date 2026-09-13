# Demo script

The five-minute video is the submission (SPEC §18). This is the shot list: what is on screen, what to click, and what to say, scene by scene.

**Timing.** The narration below is **550 words**, counted, not estimated. That is 3:48 at 145 words per minute and 4:14 at a slower, clearer 130, leaving between 45 and 70 seconds for clicks, page loads and pauses inside the five-minute limit. Each scene carries its measured word count. Two passes were walked against the running app on 2026-09-13 to confirm every click and every on-screen string; the spoken timings still need one read-aloud with a stopwatch before the take — see *Rehearsal status* at the end.

| | |
|---|---|
| Target length | Under 5:00. The limit is hard; the rules reject longer. |
| Narration | 550 words, 3:48 to 4:14 spoken |
| Longest scene | The deposit, 50 s |
| Hard prerequisite | A connected workspace, see *Before you record* |
| Closing line | *Inbox AI organizes messages. Open Loops manages responsibilities.* |

## Before you record

**Record against the deployed app: <https://openloop-neon.vercel.app>.** Since #19 it is live, connected to the runtime and to DynamoDB, so the agent buttons work without any local setup — and it is the same thing a judge will click. Verified 2026-09-13: HTTP 200, the panel reads *"Your agent"* with all four buttons live.

If you record locally instead, the agent buttons only work with `web/.env.local` filled in: `AgentPanel` disables all four when `scanConfigured` is false, which is `Boolean(OPENLOOP_RUNTIME_ARN && OPENLOOP_LEDGER_TABLE)`. On the bare seeded ledger the panel reads *"Sample loops. Connect the workspace to run it"* and every button is greyed. You would reach scene 5 before finding out.

**Loop titles are written by the model and change between runs.** `agent/README.md` says it plainly: *"Priorities and loop titles vary between runs; `demo/README.md` pins states, not priorities."* The titles in this script are the seeded ledger's. A real scan produces the same eleven loops in the same states with its own wording — on the deployed app today the insurance loop is titled *"Submit renter's insurance certificate to Maple Court PM before move-in"*, not *"Send proof of renter's insurance"*.

So: **identify rows by what they are, not by the string in this script, and read aloud whatever is on screen.** The counts are stable and worth checking; the wording is not.

**Do not record a cold scan.** A full scan is four to five and a half minutes, measured across four runs — longer than the whole video. Open on a ledger that has already been scanned (#29's reset script). Scene 6 explains how to show the agent working without waiting for it.

Check before you hit record:

- [ ] The agent panel says *"Your agent"* with all four buttons live, not greyed. On the deployed URL this is already true; locally it needs `web/.env.local`.
- [ ] The ledger has been reset and freshly scanned, not left mid-demo. The headline should read **6 things need you. 1 is waiting on others. 3 on your radar.** with **1 / 11 loops closed**. (As of 2026-09-13 the deployed ledger is mid-demo — 3 need you, 5 of 12 closed, a delta already run — so it *must* be reset before a take. That is #29.)
- [ ] Decide whether the take opens on the welcome screen. A fresh browser profile shows it (name the agent, then the five-stop tour); a profile that has visited before goes straight to Today. Either is fine; do not let the tour run mid-scene.
- [ ] Light theme, browser at 1440 wide, bookmarks bar hidden, notifications silenced.
- [ ] A second browser tab already open on `docs/architecture/openloop-architecture.png` and one on the CloudWatch log group, for scene 7.

**The dates move.** The fixtures are anchored to `persona.now = 2026-09-10` but the app renders against the real clock, so the relative dates change every day. On **Monday Sep 14**, recording day, the overview reads:

| Bucket | Rows |
|---|---|
| Overdue (2) | Send proof of renter's insurance — *Overdue by 2 days*; Update StreamBox payment method — *Overdue by 3 days* |
| Today (0) | *Nothing due today.* |
| This week (3) | **Pay registration deposit — *Due tomorrow***; Return signed participation form — *Due in 2 days*; Return desk lamp for refund — *Due in 5 days* |
| Later (2) | Flight NW 0412; Renew passport before June 2027 |
| No date (2) | Issue #1 write-up review; Book dental cleaning |
| Earlier (1) | Robotics Club meeting moved — *Sep 10*, a past date the user does not owe, so it is not Overdue |
| Resolved (1) | Pay housing application fee |

"Due tomorrow" on the deposit is the best version of this story we will get, so record on the 14th rather than earlier. Do not say "due Friday" — read what is on screen.

## The script

### 1 · The problem — 0:00 to 0:30 — 58 words

**Screen.** Open `/messages/msg-001` — *"Action required: Fall registration deposit"*, from the Bursar's Office, dated August 14. Scroll it slowly.

> This email arrived a month ago. It asks for a two hundred dollar deposit, and it names a deadline. It was read, it was not acted on, and it moved up the inbox and out of mind. Nothing is wrong with the inbox. It stored the message perfectly. It just has no idea that anything is still open.

Use our own fictional message, not a real inbox. Nothing personal on camera.

### 2 · What the agent produced — 0:30 to 1:05 — 68 words

**Screen.** Click **Today** in the rail.

> Open Loops read that inbox and a calendar and produced this. Not a summary of messages — a ledger of responsibilities, grouped by when they matter. Six things need me. One is waiting on somebody else. Three I am only watching. Two have already slipped past their date. This is the whole product in one screen: your life has open loops, and this is the list of them.

Let the headline land. Do not scroll yet.

### 3 · The forgotten one — 1:05 to 1:55 — 95 words

**Screen.** Click the row **Pay registration deposit**. It opens in the pane beside the list.

> Here is the one from the email. Due tomorrow, two hundred dollars, from the Bursar's office. Here is what it wants me to do, and here is what happens if I do not: my course registration may be released.
>
> This is the part that matters. It is quoting the actual sentence out of the actual email — and the line underneath says it searched later messages and found no receipt and no confirmation. It did not just extract a task. It went looking for evidence that the job was already done, and there was none.

Point at the **What I found** quote, then the **History** line reading *"searched later messages, no receipt or confirmation found"*. Click the `msg-001` source link to show the original, then come back.

### 4 · The one that closed itself — 1:55 to 2:35 — 73 words

**Screen.** Scroll the list to **Resolved** and click **Pay housing application fee**; the pane follows.

> Same inbox, different ending. Another university payment, also requested weeks ago. This one is closed, and I never touched it. A later email said the payment was received, the agent found it, matched it to the request, and closed the loop on its own.
>
> That is the difference between this and a to-do list. A to-do list would still be nagging me about this. Anything that can only add items eventually gets ignored.

### 5 · What it will and will not do alone — 2:35 to 3:20 — 83 words

**Screen.** Click **Handle what you can** in the agent panel above the list. When the result appears, open **Send proof of renter's insurance**, then open **Pay registration deposit**.

> Now I will let it work. It drafts the reply to the property manager, it books the calendar time, it sets the reminders — everything low risk, without asking.
>
> And then there is this one. Paying two hundred dollars is high risk, so it stops and waits for me. That gate is not a sentence in a prompt asking the model to be careful. It is application code the model cannot talk its way past, and there is a test that proves it.

Show the drafted email inside the insurance loop, then click **Review** on the deposit's action: the decision sheet shows the payment it would make, the email it rests on, and **Approve** and **Decline**, each of which asks for a second click.

### 6 · The next morning — 3:20 to 4:00 — 62 words

**Screen.** Click **Check for new mail**. **Cut here** and resume on the finished result.

> This is the next morning's mail. It does not create duplicates of things it already knows about — it updates them. The deposit closes, because the receipt arrived overnight. A new library deadline appears. And at the top, one quiet line telling me what changed while I was not looking.
>
> Not "you have six new emails". What changed, and what it means.

Two places show it, both added since the spec was written: the quiet line above the headline on Today, and the bell in the header with a count on it (#101). The line is the one to narrate; the bell is there if someone asks where the history lives.

**This is the scene most likely to break the take.** The delta run is a real model call. Record the click, stop, let it finish, and resume on the result — or pre-run it and show the finished state. Do not sit watching a progress bar.

### 7 · How it is built — 4:00 to 4:35 — 61 words

**Screen.** Switch to the architecture diagram tab, then the CloudWatch tab.

> Underneath: four specialist agents on the Strands SDK, running on Bedrock AgentCore Runtime. One decides whether a message contains a responsibility, one goes looking for whether it is already resolved, one judges the risk, one carries out the work. Every step is typed and checked before the next one sees it, and every step writes a log line you can read.

Thirty-five seconds, one diagram, one log. Do not explain the models.

### 8 · Who it is for — 4:35 to 5:00 — 50 words

**Screen.** Back to the overview.

> This started with students, because a missed deposit costs you a semester. But everybody carries these — the form, the renewal, the reply you owe somebody. Following through is work, and right now every one of us is doing it from memory.
>
> Inbox AI organizes messages. Open Loops manages responsibilities.

## If something goes wrong

| What breaks | What to do |
|---|---|
| A scan or delta is still running when you need it | Cut. Resume on the finished state. Nothing in the video requires an unbroken take. |
| The scan stream stops with no error and a stale count | Known: a truncated stream fails silently (see #19). Reload the page — the loops are in DynamoDB whether or not the browser heard about it. |
| The club meeting shows *Needs you* instead of *Watching* | Known calibration flake, roughly one run in two (`STATUS.md` *Known issues*). It is not in the script; do not narrate that row. Reset and re-scan if it bothers you. |
| Bedrock is slow or throttled | Record scenes 1 to 4 and 8 against the pre-scanned ledger, which needs no live model call at all. Only scenes 5 and 6 invoke the runtime. |
| Everything is on fire | Scenes 1 to 4 plus 8 are a complete, honest two-and-a-half-minute video. Ship that rather than nothing. |

## What not to say

From SPEC §17's list of traps, the ones this script is built to avoid:

- **Do not talk about the models.** No token counts, no prompt engineering, no model names beyond one mention in scene 7. The judge is scoring whether a human problem got solved.
- **Do not say "autonomous"** and then click through five confirmations. Say what it does alone and what it refuses to do alone, which is scene 5.
- **Do not narrate the UI.** "Here is the sidebar, here are the tabs" is dead air. Every sentence should be about a responsibility, not a component.
- **Do not claim anything not on screen.** Live Gmail is not wired up. If asked, it is the same `IngestionSource` interface behind the fixtures — say that, do not imply it is running.
- **Do not apologise** for the seeded data. It is deterministic on purpose and every thread's expected outcome is asserted by a test.

## Rehearsal status

Walked against the deployed app at <https://openloop-neon.vercel.app> and against the app running locally on the seeded ledger, most recently on 2026-09-13 at commit `c8c221c`, confirming that every click in this file exists and every quoted on-screen string matches: the headline, the bucket names and counts, the facts strip on the deposit, the evidence quote, the History line, the three loop-page buttons, the Review link and the Approve and Decline pair on the decision sheet, and all four agent-panel labels.

**Not yet done: a spoken read-through against a stopwatch.** The 550 words are counted from this file, but turning words into seconds is arithmetic at an assumed pace, not a measurement of anyone actually reading it. Whoever records should read it aloud once end to end, note the real time at the top of this file, and cut from scenes 2 and 4 first if it runs long — they carry the least that a judge could not infer from the screen.
