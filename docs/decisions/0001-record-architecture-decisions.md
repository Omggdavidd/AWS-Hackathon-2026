---
status: accepted
date: 2026-09-10
decision-makers: David Amaefula
---

# Record architecture decisions as ADRs

## Context and Problem Statement

Several developers, each working with AI coding agents, will make stack and design choices quickly. Decisions made inside a chat session are lost when the session ends, and later contributors (human or agent) cannot tell whether a choice was deliberate or accidental.

## Considered Options

* Lightweight Architecture Decision Records in the repository
* A single `DECISIONS.md` log
* Decisions recorded only in PR descriptions and chat

## Decision Outcome

Chosen option: "Lightweight ADRs in `docs/decisions/`", using the MADR 4.0 minimal template, because one file per decision keeps each record small, reviewable in the same PR as the change, and easy for an agent to load selectively. A single log file grows into a document nobody reads; PR descriptions and chat are not discoverable.

### Consequences

* Good, because the rationale for every consequential choice is versioned next to the code and reviewed with it.
* Good, because agents can be told to read only the ADRs relevant to their task.
* Bad, because writing an ADR takes a few minutes; mitigated by the minimal template and the `/adr` skill.

## More Information

Format reference: <https://adr.github.io/madr/>. What counts as an ADR-worthy decision is listed in `docs/decisions/README.md`.
