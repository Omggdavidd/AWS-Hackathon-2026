---
status: accepted
date: 2026-09-10
decision-makers: team
---

# Actions are gated by risk tier; high-risk actions require explicit human approval

## Context and Problem Statement

The agent acts on a real person's email and calendar. Sending the wrong email, paying, booking or accepting terms on an inferred intent is unacceptable, and judges explicitly penalise risky automation with no approval model (`docs/hackathon/SPEC.md` §12, §17).

## Considered Options

* Three risk tiers with per-tier default behaviour and an approval queue
* Ask for approval on every action
* Let the model decide case by case whether to ask

## Decision Outcome

Chosen option: "Three risk tiers with an approval queue", because it keeps the demo's "handle what you can" autonomy while making high-consequence actions impossible without a human click.

| Tier | Examples | Default |
|---|---|---|
| Low | Classify, watch, reminder, archive a resolved thread, update local state | Execute automatically; always audited |
| Medium | Draft an email, tentative calendar event, prepare a form, suggest slots | Prepare automatically; execution policy may require approval |
| High | Send sensitive email, submit an application, pay, book a paid service, sign or accept terms | Explicit user approval before execution |

Every action is a `ProposedAction` record with a tier and a status (`PROPOSED`, `APPROVED`, `EXECUTED`, `FAILED`, `CANCELLED`). Execution tools refuse a high-tier action whose status is not `APPROVED`; this is enforced in code, not in a prompt. Claims shown to the user are evidence-backed with a confidence value and an "I already did this" escape hatch. Connectors use least-privilege scopes.

### Consequences

* Good, because safety is a property of the application, so a prompt failure cannot bypass it.
* Good, because the approval flow is itself a demo moment (§14).
* Bad, because tier assignment is a judgement the Risk Judge can get wrong; the defaults err toward asking, and the tier is visible in the audit feed.

## More Information

Trust rules for the MVP: `docs/hackathon/SPEC.md` §12.
