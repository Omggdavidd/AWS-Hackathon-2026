---
status: accepted
date: 2026-09-10
decision-makers: team
---

# The demo runs on deterministic seeded data; live Gmail is an optional second path

## Context and Problem Statement

The submission is judged on a recorded five-minute video plus testing instructions (`docs/hackathon/SPEC.md` §14, §18). Live Gmail depends on OAuth setup, personal inbox contents and network conditions, none of which are deterministic or safe to record. The team has four days.

## Considered Options

* Seeded Gmail-like fixtures as the primary path, live Gmail and Calendar wired only after the seeded path works end to end
* Live Gmail only
* Live Gmail as primary with fixtures only for unit tests

## Decision Outcome

Chosen option: "Seeded first, live second", because it makes every demo branch reproducible, keeps the frontend unblocked from day one, and lets judges run the project without Google credentials. The seed set is the student scenario in §14: an old unpaid deposit, a later receipt that auto-resolves a different loop, an insurance request with a ready draft, a waiting manager thread, a moved club meeting, a watched flight, and an optional dentist reminder. The same ingestion interface serves fixtures and the live connector, so switching is configuration, not code.

### Consequences

* Good, because the demo, the tests and the judges' run all use the same deterministic path.
* Good, because no teammate's personal inbox appears on screen.
* Bad, because a seeded-only submission is weaker on "real work for real people"; the live connector is the first stretch item and is shown if it is stable.

## More Information

Seeded scenario and video sequence: `docs/hackathon/SPEC.md` §14. Ingestion strategy: §11.
