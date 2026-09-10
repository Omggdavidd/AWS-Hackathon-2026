# Demo fixtures

Deterministic seed data for the five-minute demo (`docs/hackathon/SPEC.md` §14, ADR-0006). All people, organizations and addresses are fictional.

`seed-inbox.json` is loaded by `FixtureSource` from `@openloop/shared/ingestion`. The persona's `now` is the clock the demo runs against.

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
| `thr-newsletter` | Not a responsibility, no loop |

Change the data only with a matching update to this table and to the expected-loop tests.
