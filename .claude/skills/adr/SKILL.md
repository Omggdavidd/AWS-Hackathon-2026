---
name: adr
description: Scaffold a new Architecture Decision Record in docs/decisions with the next free number and add it to the index. Use when a framework, service, data store, auth, orchestration, deployment, observability or security decision is being made or reversed.
---

Create an ADR titled: $ARGUMENTS

1. Find the next number: the highest `NNNN-*.md` in `docs/decisions/` plus one, zero-padded to four digits.
2. Copy `docs/decisions/adr-template.md` to `docs/decisions/NNNN-<kebab-title>.md`. Set `date` to today, `status: proposed`, and `decision-makers` to the people involved (ask if unknown).
3. Fill *Context and Problem Statement*, *Considered Options* and *Decision Outcome* from the conversation and the code. Cite the hackathon spec section or issue where relevant. Real trade-offs only; no filler options.
4. If it reverses an earlier ADR, set that ADR's status to `superseded by ADR-NNNN` and link both ways.
5. Add a row to the index table in `docs/decisions/README.md`.
6. Run `python3 scripts/check_context.py`.
7. Tell the user the ADR is `proposed`; the team sets it to `accepted`, not you.
