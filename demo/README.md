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
| `thr-form` | Signed participation form by Sep 16: **Needs You**, high, reminder scheduled |
| `thr-passport` | Passport expires June 2027, clear of the October trip: **Watching**, no interruption |
| `thr-newsletter` | Not a responsibility, no loop |

Base-inbox ids run `msg-001` to `msg-013` plus `msg-018` and `msg-019`; the gap is the delta batch below, which was numbered first. Renumbering it would churn the tests for no gain.

`seed-inbox-delta.json` is the "next morning" batch for the delta path (plan step 7): merged on top of the base inbox by `mergeFixtures`, it must update existing loops rather than create duplicates.

| Delta message | Expected outcome |
|---|---|
| `msg-014` Bursar "Payment received" | `thr-deposit` loop **Needs You → Resolved**, receipt as resolving evidence |
| `msg-015` Bill "Approved" | `thr-issue1` loop **Waiting → Resolved** |
| `msg-016` gate assignment | `thr-flight` loop stays **Watching**, new evidence only |
| `msg-017` library due date | new loop `thr-library`, **Needs You**, due Sep 18 |

Change any file only with a matching update to these tables, the other files and the tests in `packages/shared/test/fixtures.test.ts`.
