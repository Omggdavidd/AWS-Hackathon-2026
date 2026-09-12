# Demo fixtures

Deterministic seed data for the five-minute demo (`docs/hackathon/SPEC.md` §14, ADR-0006). All people, organizations and addresses are fictional.

`seed-inbox.json` is loaded by `FixtureSource` from `@openloop/shared/ingestion`. The persona's `now` is the clock the demo runs against.

`seed-ledger.json` is the ledger the agent is expected to produce from that inbox: 11 loops, their evidence, proposed actions and audit trail. The web app copies it to `.openloop/ledger.json` on first run so the dashboard is populated before the agent exists, and the agent's end-to-end test will compare its output against it.

| Thread | Expected outcome |
|---|---|
| `thr-deposit` | Registration deposit, $200, due Sep 15: **Needs You**, critical, no receipt found |
| `thr-housing` | Housing fee: created from the request, then **Resolved** by the "Payment received" reply |
| `thr-insurance` | Proof of insurance by Sep 12: **Needs You**, reply draft ready |
| `thr-issue1` | Write-up sent Sep 3, no reply: **Waiting** on Bill, follow-up suggested |
| `thr-club` | Meeting moved: **Watching**, calendar event updated, no interruption |
| `thr-flight` | Departure shifted 45 minutes, no conflict: **Watching**, no interruption |
| `thr-dentist` | Due for a visit: **Needs You**, low, propose a slot |
| `thr-return` | Return window closes Sep 19, $84: **Needs You**, medium |
| `thr-streaming` | Card declined, $15.99: **Needs You**, low |
| `thr-form` | Signed participation form by Sep 16: **Needs You**, high, reminder set for the evening before |
| `thr-passport` | Passport expires June 2027, renewals do not open until March 2027: **Watching**, real and dated but nothing to do yet |
| `thr-newsletter` | Not a responsibility, no loop |

Base-inbox ids run `msg-001` to `msg-013` plus `msg-018` and `msg-019`; the gap is the delta batch below, which was numbered first. Renumbering it would churn the tests for no gain.

Each expected loop also carries an `area`, the part of life it belongs to (school, work, money, health, home, travel, community, other), which the Extractor sets from who is asking and what it is about; the board's By area view groups on it.

Three loops carry `interruptUser` — the deposit, the insurance proof and the participation form — and no others. It is the Risk Judge's answer to "is this worth a tap on the shoulder?", and the web app raises a browser notification only for a flagged loop that still needs the user. Everything else arrives quietly in the notification centre, which is the point: eight of the eleven never interrupt.

`seed-inbox-delta.json` is the "next morning" batch for the delta path (plan step 7): merged on top of the base inbox by `mergeFixtures`, it must update existing loops rather than create duplicates.

| Delta message | Expected outcome |
|---|---|
| `msg-014` Bursar "Payment received" | `thr-deposit` loop **Needs You → Resolved**, receipt as resolving evidence |
| `msg-015` Bill "Approved" | `thr-issue1` loop **Waiting → Resolved** |
| `msg-016` gate assignment | `thr-flight` loop stays **Watching**, new evidence only |
| `msg-017` library due date | new loop `thr-library`, **Needs You**, due Sep 18 |

`seed-inbox-failures.json` is the ugly-cases inbox for the failure-path tests (`agent/app/OpenLoopAgent/test/failure-paths.test.ts`). It is loaded directly by those tests, not by the demo script or the web app, so the demo narrative is unaffected.

| Thread | Expected outcome |
|---|---|
| `thr-lab-fee` | CHEM 210 lab fee $45 due Sep 20: **Needs You**; rescanning the same message changes nothing |
| `thr-permit` | Permit renewal $60, then "Payment received": **Resolved** |
| `thr-permit-notice` | Automated second notice about the same already-paid permit: **Watching**, never a second **Needs You** |
| `thr-advisor` | Draft requested "sometime next month": **Needs You** with no `dueAt` and low confidence |
| `thr-scholarship` | Scholarship renewal by Sep 30: **Needs You** with three actions (low, medium, high); `handle` runs the first two and lists the high-risk one |

Change any file only with a matching update to these tables, the other files and the tests in `packages/shared/test/fixtures.test.ts`.
